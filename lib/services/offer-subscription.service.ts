import type Stripe from "stripe";
import type { OfferSubscription, PaidOffer, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { nullOrUnset } from "@/lib/db/mongo-null";
import { subscriptionPeriodEnd } from "@/lib/billing/stripe-period";
import { isStripeSubscriptionAlreadyCanceled } from "@/lib/billing/stripe-errors";
import { NOTIFICATION_TYPES } from "@/lib/notifications/types";
import { notifyOnce } from "@/lib/payments/connect-notify";
import { PaymentsError } from "@/lib/payments/connect-errors";
import { assertPaymentsAvailable } from "@/lib/payments/payments-access";
import {
  LIVE_SUBSCRIPTION_STATUSES,
  VISIBLE_SUBSCRIPTION_STATUSES,
  type OfferSubscriptionStatus,
} from "@/lib/payments/connect-config";
import { formatStripeAmount } from "@/lib/utils/money";
import { logUserAudit } from "@/lib/services/audit-log.service";
import { AUDIT_ACTIONS } from "@/lib/audit/catalog";
import { grantProgramAccess, pauseProgramAccess, resumeProgramAccess } from "@/lib/services/offer-access.service";
import { loadVerifiedOffer, parseConnectMetadata } from "@/lib/services/offer-purchase.service";

/**
 * COACHING memberships (spec §3 "Access"). The Stripe subscription on the
 * trainer's account is the source of truth: every webhook re-reads it live
 * (`{ stripeAccount }`) and mirrors it here, so out-of-order or replayed
 * events converge on the current state. CANCELED is terminal — Stripe
 * subscriptions can't be revived — so a stale event never reopens one.
 */

type Client = Pick<User, "id" | "role" | "clerkOrgId" | "email" | "firstName" | "lastName">;

export function mapSubscriptionStatus(status: Stripe.Subscription.Status): OfferSubscriptionStatus {
  switch (status) {
    case "active":
    case "trialing":
      return "ACTIVE";
    case "past_due":
      return "PAST_DUE";
    // Stripe has stopped collecting: access pauses until it returns to active.
    case "unpaid":
    case "paused":
      return "PAUSED";
    case "canceled":
    case "incomplete_expired":
      return "CANCELED";
    case "incomplete":
    default:
      return "INCOMPLETE";
  }
}

function idOf(ref: string | { id: string } | null | undefined): string | null {
  if (!ref) return null;
  return typeof ref === "string" ? ref : ref.id;
}

function fromUnix(seconds: number | null | undefined): Date | null {
  return seconds ? new Date(seconds * 1000) : null;
}

export interface SyncResult {
  row: OfferSubscription;
  offer: PaidOffer;
  previousStatus: OfferSubscriptionStatus | null;
}

/** States in which the client has (or is about to have) a paid membership. */
const BILLING_STATUSES: OfferSubscriptionStatus[] = ["ACTIVE", "PAST_DUE", "PAUSED"];

/**
 * A second live membership to the same offer (two checkout tabs, or a
 * replayed checkout) is canceled on the trainer's account right away; the
 * trainer refunds the duplicate charge from Stripe. Returns true when `subId`
 * was the duplicate.
 */
async function cancelIfDuplicate(
  subId: string,
  meta: { clientId: string; offerId: string },
  stripeAccountId: string
): Promise<boolean> {
  const others = await prisma.offerSubscription.findMany({
    where: { clientId: meta.clientId, offerId: meta.offerId, status: { in: BILLING_STATUSES } },
    select: { stripeSubscriptionId: true },
  });
  if (!others.some((o) => o.stripeSubscriptionId !== subId)) return false;
  console.warn(`[payments] duplicate membership ${subId} for offer ${meta.offerId}; canceling it on ${stripeAccountId}`);
  try {
    await stripe.subscriptions.cancel(subId, {}, { stripeAccount: stripeAccountId });
  } catch (err) {
    if (!isStripeSubscriptionAlreadyCanceled(err, subId, "[payments]")) throw err;
  }
  return true;
}

/**
 * Mirrors one Stripe subscription onto its OfferSubscription row, creating
 * the row on first sight. Returns null when the subscription isn't a
 * verified Connect offer on this account (foreign metadata is ignored).
 */
export async function syncOfferSubscription(subscriptionId: string, stripeAccountId: string): Promise<SyncResult | null> {
  const sub = await stripe.subscriptions.retrieve(subscriptionId, {}, { stripeAccount: stripeAccountId });
  const meta = parseConnectMetadata(sub.metadata);
  if (!meta) return null;
  const offer = await loadVerifiedOffer(meta, stripeAccountId);
  if (!offer || offer.kind !== "COACHING") return null;

  const fields = {
    status: mapSubscriptionStatus(sub.status),
    currentPeriodEnd: subscriptionPeriodEnd(sub),
    cancelAtPeriodEnd: sub.cancel_at_period_end || sub.cancel_at !== null,
    canceledAt: fromUnix(sub.ended_at ?? sub.canceled_at),
  };

  let existing = await prisma.offerSubscription.findUnique({ where: { stripeSubscriptionId: sub.id } });
  const wasBilling = existing ? BILLING_STATUSES.includes(existing.status as OfferSubscriptionStatus) : false;
  if (
    existing?.status !== "CANCELED" &&
    !wasBilling &&
    BILLING_STATUSES.includes(fields.status) &&
    (await cancelIfDuplicate(sub.id, meta, stripeAccountId))
  ) {
    fields.status = "CANCELED";
    fields.canceledAt = new Date();
    fields.cancelAtPeriodEnd = false;
  }

  const activatedNow = fields.status === "ACTIVE" ? new Date() : null;
  if (!existing) {
    try {
      const row = await prisma.offerSubscription.create({
        data: {
          offerId: offer.id,
          trainerId: meta.trainerId,
          clientId: meta.clientId,
          stripeAccountId,
          stripeSubscriptionId: sub.id,
          stripeCustomerId: idOf(sub.customer) ?? "",
          assignedProgramId: null,
          activatedAt: activatedNow,
          ...fields,
          canceledAt: fields.status === "CANCELED" ? (fields.canceledAt ?? new Date()) : null,
        },
      });
      return { row, offer, previousStatus: null };
    } catch (err) {
      if ((err as { code?: string }).code !== "P2002") throw err;
      existing = await prisma.offerSubscription.findUnique({ where: { stripeSubscriptionId: sub.id } });
      if (!existing) throw err;
    }
  }

  const previousStatus = existing.status as OfferSubscriptionStatus;
  if (previousStatus === "CANCELED") return { row: existing, offer, previousStatus };

  const row = await prisma.offerSubscription.update({
    where: { id: existing.id },
    data: {
      ...fields,
      activatedAt: existing.activatedAt ?? activatedNow,
      canceledAt: fields.status === "CANCELED" ? (fields.canceledAt ?? new Date()) : existing.canceledAt,
    },
  });
  return { row, offer, previousStatus };
}

/**
 * Access follows status. Run in `after()` by the webhook (cloning is slow):
 * - ACTIVE: the offer's program is assigned (and resumed after a PAUSED spell);
 * - PAUSED (Stripe stopped collecting) or CANCELED: the program is paused;
 * - PAST_DUE: access continues while Stripe retries the card.
 */
export async function applySubscriptionAccess(result: SyncResult): Promise<void> {
  const { row, offer, previousStatus } = result;

  if (row.status === "CANCELED" || row.status === "PAUSED") {
    if (previousStatus !== row.status) await pauseProgramAccess(row.assignedProgramId);
    return;
  }
  if (row.status !== "ACTIVE") return;
  if (previousStatus === "PAUSED") await resumeProgramAccess(row.assignedProgramId);
  if (!offer.programTemplateId) return;
  if (row.assignedProgramId && previousStatus === "ACTIVE") return;

  const programId = await grantProgramAccess({
    templateId: offer.programTemplateId,
    trainerId: row.trainerId,
    clientId: row.clientId,
    currentProgramId: row.assignedProgramId,
    claim: async (id) => {
      const { count } = await prisma.offerSubscription.updateMany({
        where: { id: row.id, ...nullOrUnset("assignedProgramId") },
        data: { assignedProgramId: id },
      });
      return count === 1;
    },
  });

  // Canceled/paused while we were cloning: that event found nothing to pause.
  const current = await prisma.offerSubscription.findUnique({ where: { id: row.id }, select: { status: true } });
  if (programId && current && current.status !== "ACTIVE" && current.status !== "PAST_DUE") {
    await pauseProgramAccess(programId);
  }
}

/**
 * The trainer's account can no longer be reached (deauthorized), so MIA
 * stops receiving billing events for it. Live memberships on it are ended
 * in MIA and their programs paused, so access can't outlive what MIA can
 * verify. Idempotent; returns how many memberships were ended.
 */
export async function endMembershipsForAccount(stripeAccountId: string): Promise<number> {
  const live = await prisma.offerSubscription.findMany({
    where: { stripeAccountId, status: { in: LIVE_SUBSCRIPTION_STATUSES } },
    select: { id: true, assignedProgramId: true },
  });
  let ended = 0;
  for (const sub of live) {
    const { count } = await prisma.offerSubscription.updateMany({
      where: { id: sub.id, status: { in: LIVE_SUBSCRIPTION_STATUSES } },
      data: { status: "CANCELED", canceledAt: new Date(), cancelAtPeriodEnd: false },
    });
    if (count === 1) {
      await pauseProgramAccess(sub.assignedProgramId);
      ended += 1;
    }
  }
  return ended;
}

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  return idOf(invoice.parent?.subscription_details?.subscription);
}

async function displayName(userId: string): Promise<string> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true, email: true } });
  if (!u) return "A client";
  return `${u.firstName} ${u.lastName}`.trim() || u.email;
}

/** `invoice.paid` for a membership: re-sync, then tell the trainer once per invoice. */
export async function handleOfferInvoicePaid(invoice: Stripe.Invoice, stripeAccountId: string): Promise<SyncResult | null> {
  const subscriptionId = invoiceSubscriptionId(invoice);
  if (!subscriptionId) return null;
  const result = await syncOfferSubscription(subscriptionId, stripeAccountId);
  if (!result) return null;

  if (invoice.amount_paid > 0 && invoice.id) {
    const amount = formatStripeAmount(invoice.amount_paid, invoice.currency);
    const renewal = invoice.billing_reason === "subscription_cycle";
    await notifyOnce(
      {
        userId: result.row.trainerId,
        type: NOTIFICATION_TYPES.OFFER_PAYMENT_RECEIVED,
        title: "Payment received",
        body: `${await displayName(result.row.clientId)} ${renewal ? "renewed" : "started"} ${result.offer.name} (${amount}).`,
        link: "/payments?tab=subscriptions",
        metadata: { subscriptionId: result.row.id },
      },
      `invoice-paid:${invoice.id}`
    );
  }
  return result;
}

/**
 * `invoice.payment_failed` for a membership: PAST_DUE (a renewal Stripe will
 * retry) and both sides are told once per attempt. A failed first invoice
 * stays INCOMPLETE — there was no membership yet.
 */
export async function handleOfferInvoicePaymentFailed(invoice: Stripe.Invoice, stripeAccountId: string): Promise<SyncResult | null> {
  const subscriptionId = invoiceSubscriptionId(invoice);
  if (!subscriptionId) return null;
  const synced = await syncOfferSubscription(subscriptionId, stripeAccountId);
  if (!synced) return null;

  let result = synced;
  if (synced.row.status === "ACTIVE") {
    const { count } = await prisma.offerSubscription.updateMany({
      where: { id: synced.row.id, status: "ACTIVE" },
      data: { status: "PAST_DUE" },
    });
    if (count === 1) result = { ...synced, row: { ...synced.row, status: "PAST_DUE" } };
  }

  const amount = formatStripeAmount(invoice.amount_due, invoice.currency);
  const dedupeKey = `invoice-failed:${invoice.id}:${invoice.attempt_count}`;
  await notifyOnce(
    {
      userId: result.row.clientId,
      type: NOTIFICATION_TYPES.OFFER_PAYMENT_FAILED,
      title: "Payment failed",
      body: `We couldn't charge ${amount} for ${result.offer.name}. Update your card from the link in Stripe's email to keep your membership.`,
      link: "/store",
      metadata: { subscriptionId: result.row.id },
    },
    dedupeKey
  );
  await notifyOnce(
    {
      userId: result.row.trainerId,
      type: NOTIFICATION_TYPES.OFFER_PAYMENT_FAILED,
      title: "Payment failed",
      body: `${await displayName(result.row.clientId)}'s ${amount} payment for ${result.offer.name} failed.`,
      link: "/payments?tab=subscriptions",
      metadata: { subscriptionId: result.row.id },
    },
    dedupeKey
  );
  return result;
}

// ── Client self-service ─────────────────────────────────────────────────────

async function requireOwnSubscription(client: Client, subscriptionRowId: string) {
  if (client.role !== "CLIENT") throw new PaymentsError("forbidden");
  await assertPaymentsAvailable(client);
  const row = await prisma.offerSubscription.findUnique({ where: { id: subscriptionRowId }, include: { offer: true } });
  if (!row || row.clientId !== client.id) throw new PaymentsError("not_found", "Membership not found.");
  return row;
}

/**
 * The client cancels per the offer's policy (spec §3):
 * - END_OF_PERIOD: `cancel_at_period_end` — access runs to the end of the
 *   paid month and the client can resume until then.
 * - IMMEDIATE, or any PAST_DUE/PAUSED membership (no paid period left to
 *   honour): canceled now and the program paused.
 */
export async function cancelOfferSubscription(client: Client, subscriptionRowId: string): Promise<OfferSubscription> {
  const row = await requireOwnSubscription(client, subscriptionRowId);
  if (row.status === "CANCELED") return row;
  if (row.status === "INCOMPLETE") throw new PaymentsError("invalid_state", "This membership hasn't started yet.");

  const stripeAccount = row.stripeAccountId;
  const immediate = row.offer.cancellationPolicy === "IMMEDIATE" || row.status === "PAST_DUE" || row.status === "PAUSED";
  let updated: OfferSubscription;

  if (immediate) {
    try {
      await stripe.subscriptions.cancel(row.stripeSubscriptionId, {}, { stripeAccount });
    } catch (err) {
      if (!isStripeSubscriptionAlreadyCanceled(err, row.stripeSubscriptionId, "[payments]")) throw err;
    }
    const { count } = await prisma.offerSubscription.updateMany({
      where: { id: row.id, status: { not: "CANCELED" } },
      data: { status: "CANCELED", canceledAt: new Date(), cancelAtPeriodEnd: false },
    });
    if (count === 1) await pauseProgramAccess(row.assignedProgramId);
    updated = (await prisma.offerSubscription.findUnique({ where: { id: row.id } })) ?? row;
  } else {
    if (row.cancelAtPeriodEnd) return row;
    await stripe.subscriptions.update(row.stripeSubscriptionId, { cancel_at_period_end: true }, { stripeAccount });
    updated = await prisma.offerSubscription.update({ where: { id: row.id }, data: { cancelAtPeriodEnd: true } });
  }

  await logUserAudit(client, () => ({
    action: AUDIT_ACTIONS.OFFER_SUBSCRIPTION_CANCELED,
    targetType: "OfferSubscription",
    targetId: row.id,
    targetLabel: row.offer.name,
    metadata: { immediate, policy: row.offer.cancellationPolicy },
  }));
  return updated;
}

/** Undo an END_OF_PERIOD cancel before the period ends. */
export async function resumeOfferSubscription(client: Client, subscriptionRowId: string): Promise<OfferSubscription> {
  const row = await requireOwnSubscription(client, subscriptionRowId);
  if (row.status !== "ACTIVE" || !row.cancelAtPeriodEnd) {
    throw new PaymentsError("invalid_state", "This membership can't be resumed.");
  }

  // A scheduled cancel is either the period-end flag (ours) or a date the
  // trainer set in Stripe; clear whichever is live.
  const stripeAccount = row.stripeAccountId;
  const live = await stripe.subscriptions.retrieve(row.stripeSubscriptionId, {}, { stripeAccount });
  if (live.status === "canceled") throw new PaymentsError("invalid_state", "This membership has already ended.");
  const params: Stripe.SubscriptionUpdateParams = live.cancel_at_period_end
    ? { cancel_at_period_end: false }
    : { cancel_at: "" };
  await stripe.subscriptions.update(row.stripeSubscriptionId, params, { stripeAccount });
  const updated = await prisma.offerSubscription.update({ where: { id: row.id }, data: { cancelAtPeriodEnd: false } });

  await logUserAudit(client, () => ({
    action: AUDIT_ACTIONS.OFFER_SUBSCRIPTION_RESUMED,
    targetType: "OfferSubscription",
    targetId: row.id,
    targetLabel: row.offer.name,
  }));
  return updated;
}

// ── Listing ────────────────────────────────────────────────────────────────

export interface SubscriptionListItem {
  id: string;
  offerId: string;
  stripeAccountId: string;
  offerName: string;
  priceInCents: number;
  currency: string;
  cancellationPolicy: string;
  status: string;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
  createdAt: Date;
  clientId: string;
  clientName: string;
}

type RowWithOffer = OfferSubscription & { offer: Pick<PaidOffer, "name" | "priceInCents" | "currency" | "cancellationPolicy"> };

function toListItem(row: RowWithOffer, clientName: string): SubscriptionListItem {
  return {
    id: row.id,
    offerId: row.offerId,
    stripeAccountId: row.stripeAccountId,
    offerName: row.offer.name,
    priceInCents: row.offer.priceInCents,
    currency: row.offer.currency,
    cancellationPolicy: row.offer.cancellationPolicy,
    status: row.status,
    currentPeriodEnd: row.currentPeriodEnd,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    canceledAt: row.canceledAt,
    createdAt: row.createdAt,
    clientId: row.clientId,
    clientName,
  };
}

const OFFER_SUMMARY = { select: { name: true, priceInCents: true, currency: true, cancellationPolicy: true } } as const;

/** The client's memberships, live first. Abandoned (INCOMPLETE) checkouts are hidden. */
export async function listSubscriptionsForClient(clientId: string): Promise<SubscriptionListItem[]> {
  const rows = await prisma.offerSubscription.findMany({
    where: { clientId, status: { in: VISIBLE_SUBSCRIPTION_STATUSES } },
    include: { offer: OFFER_SUMMARY },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const order = (s: string) => (s === "CANCELED" ? 1 : 0);
  return rows.sort((a, b) => order(a.status) - order(b.status)).map((r) => toListItem(r, ""));
}

export async function listSubscriptionsForTrainer(trainerId: string): Promise<SubscriptionListItem[]> {
  const rows = await prisma.offerSubscription.findMany({
    where: { trainerId, status: { in: VISIBLE_SUBSCRIPTION_STATUSES } },
    include: { offer: OFFER_SUMMARY },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const clientIds = [...new Set(rows.map((r) => r.clientId))];
  const clients = clientIds.length
    ? await prisma.user.findMany({
        where: { id: { in: clientIds } },
        select: { id: true, firstName: true, lastName: true, email: true },
      })
    : [];
  const names = new Map(clients.map((c) => [c.id, `${c.firstName} ${c.lastName}`.trim() || c.email]));
  return rows.map((r) => toListItem(r, names.get(r.clientId) ?? "Former client"));
}
