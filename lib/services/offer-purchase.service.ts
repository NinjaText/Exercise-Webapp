import type Stripe from "stripe";
import type { OfferPurchase, PaidOffer } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { nullOrUnset } from "@/lib/db/mongo-null";
import { NOTIFICATION_TYPES } from "@/lib/notifications/types";
import { notifyOnce } from "@/lib/payments/connect-notify";
import { CONNECT_PURCHASE_TYPE } from "@/lib/payments/connect-config";
import { formatStripeAmount } from "@/lib/utils/money";
import { grantProgramAccess, pauseProgramAccess } from "@/lib/services/offer-access.service";

/**
 * One-time PROGRAM purchases (spec §3 "Access"). Lifecycle:
 *   PENDING (row written before the Checkout redirect)
 *     → PAID      (checkout completed / async payment succeeded) → fulfill
 *     → FAILED    (async payment failed, or the checkout expired unpaid)
 *   PENDING/PAID → REFUNDED (full refund or lost dispute; program paused)
 * `fulfillmentStatus` tracks program access separately and is retried by
 * the retry-program-purchases cron. Every transition is a conditional write
 * on the status it was read in, so replayed webhooks are no-ops.
 */

export interface ConnectSessionMetadata {
  offerId: string;
  clientId: string;
  trainerId: string;
}

const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;

/** The session's Connect metadata, or null when it isn't one of ours. */
export function parseConnectMetadata(metadata: Stripe.Metadata | null | undefined): ConnectSessionMetadata | null {
  if (!metadata || metadata.purchaseType !== CONNECT_PURCHASE_TYPE) return null;
  const { offerId, clientId, trainerId } = metadata;
  if (![offerId, clientId, trainerId].every((v) => typeof v === "string" && OBJECT_ID_RE.test(v))) return null;
  return { offerId, clientId, trainerId };
}

function idOf(ref: string | { id: string } | null | undefined): string | null {
  if (!ref) return null;
  return typeof ref === "string" ? ref : ref.id;
}

/**
 * The offer named in metadata, only if it is safe to act on. Trainers own
 * their Stripe account and can create sessions/subscriptions with any
 * metadata, so metadata is never trusted on its own:
 * - the offer must belong to that trainer on that connected account, and
 * - the buyer must be a CLIENT in the trainer's org (the same rule as
 *   getTrainersForClient), so nothing can be pushed into an arbitrary user.
 * Anything else is logged and ignored (the webhook still acks).
 */
export async function loadVerifiedOffer(meta: ConnectSessionMetadata, stripeAccountId: string): Promise<PaidOffer | null> {
  const offer = await prisma.paidOffer.findUnique({ where: { id: meta.offerId } });
  if (!offer || offer.trainerId !== meta.trainerId || offer.stripeAccountId !== stripeAccountId) {
    console.warn(`[payments] ignoring ${stripeAccountId} object: offer ${meta.offerId} doesn't match trainer/account`);
    return null;
  }
  const [trainer, client] = await Promise.all([
    prisma.user.findUnique({ where: { id: meta.trainerId }, select: { role: true, clerkOrgId: true } }),
    prisma.user.findUnique({ where: { id: meta.clientId }, select: { role: true, clerkOrgId: true } }),
  ]);
  const sameOrg = !!trainer?.clerkOrgId && trainer.clerkOrgId === client?.clerkOrgId;
  if (trainer?.role !== "TRAINER" || client?.role !== "CLIENT" || !sameOrg) {
    console.warn(`[payments] ignoring ${stripeAccountId} object: client ${meta.clientId} isn't a client of trainer ${meta.trainerId}`);
    return null;
  }
  return offer;
}

/**
 * True when the payment was already fully refunded (or the charge reversed).
 * A refunded Checkout Session still reports payment_status "paid", so this
 * is checked before anything is marked PAID or fulfilled.
 */
async function isPaymentReversed(paymentIntentId: string | null, stripeAccountId: string): Promise<boolean> {
  if (!paymentIntentId) return false;
  const intent = await stripe.paymentIntents.retrieve(
    paymentIntentId,
    { expand: ["latest_charge"] },
    { stripeAccount: stripeAccountId }
  );
  const charge = intent.latest_charge;
  if (!charge || typeof charge === "string") return false;
  return charge.refunded || (charge.amount > 0 && charge.amount_refunded >= charge.amount);
}

/**
 * The purchase row for a session. Normally written before redirect; if that
 * write was lost, it is recreated from the (verified) metadata so a paid
 * session is never dropped.
 */
async function findOrCreatePurchase(
  session: Stripe.Checkout.Session,
  meta: ConnectSessionMetadata,
  offer: PaidOffer
): Promise<OfferPurchase> {
  const existing = await prisma.offerPurchase.findUnique({ where: { stripeCheckoutSessionId: session.id } });
  if (existing) return existing;
  try {
    return await prisma.offerPurchase.create({
      data: {
        offerId: offer.id,
        trainerId: meta.trainerId,
        clientId: meta.clientId,
        stripeAccountId: offer.stripeAccountId,
        stripeCheckoutSessionId: session.id,
        stripePaymentIntentId: null,
        amountInCents: session.amount_total ?? offer.priceInCents,
        currency: session.currency ?? offer.currency,
        status: "PENDING",
        fulfillmentStatus: "PENDING",
        assignedProgramId: null,
        failureReason: null,
        paidAt: null,
        refundedAt: null,
      },
    });
  } catch (err) {
    if ((err as { code?: string }).code !== "P2002") throw err;
    const raced = await prisma.offerPurchase.findUnique({ where: { stripeCheckoutSessionId: session.id } });
    if (!raced) throw err;
    return raced;
  }
}

async function clientName(clientId: string): Promise<string> {
  const client = await prisma.user.findUnique({
    where: { id: clientId },
    select: { firstName: true, lastName: true, email: true },
  });
  if (!client) return "A client";
  return `${client.firstName} ${client.lastName}`.trim() || client.email;
}

/**
 * A paid PROGRAM session (`checkout.session.completed` with payment_status
 * "paid", or `async_payment_succeeded`). Returns the purchase id when it
 * needs fulfilling (the caller runs `fulfillOfferPurchase` in `after()`), or
 * null when the session isn't ours / isn't paid / was already handled.
 */
export async function markPurchasePaid(session: Stripe.Checkout.Session, stripeAccountId: string): Promise<string | null> {
  if (session.mode !== "payment" || session.payment_status !== "paid") return null;
  const meta = parseConnectMetadata(session.metadata);
  if (!meta) return null;
  const offer = await loadVerifiedOffer(meta, stripeAccountId);
  if (!offer || offer.kind !== "PROGRAM") return null;

  const purchase = await findOrCreatePurchase(session, meta, offer);
  if (purchase.clientId !== meta.clientId) return null;
  if (purchase.status === "REFUNDED") return null;

  // Refunded before this event (or the cron) got here: never grant access.
  const paymentIntentId = idOf(session.payment_intent);
  if (await isPaymentReversed(paymentIntentId, stripeAccountId)) {
    await prisma.offerPurchase.updateMany({
      where: { id: purchase.id, status: { in: ["PENDING", "PAID"] } },
      data: { status: "REFUNDED", refundedAt: new Date(), stripePaymentIntentId: paymentIntentId },
    });
    await pauseProgramAccess(purchase.assignedProgramId);
    return null;
  }

  const { count } = await prisma.offerPurchase.updateMany({
    where: { id: purchase.id, status: "PENDING" },
    data: {
      status: "PAID",
      paidAt: new Date(),
      stripePaymentIntentId: paymentIntentId,
      amountInCents: session.amount_total ?? purchase.amountInCents,
      failureReason: null,
    },
  });
  if (count === 1) {
    const amount = formatStripeAmount(session.amount_total ?? purchase.amountInCents, session.currency ?? purchase.currency);
    await notifyOnce(
      {
        userId: meta.trainerId,
        type: NOTIFICATION_TYPES.OFFER_PAYMENT_RECEIVED,
        title: "Payment received",
        body: `${await clientName(meta.clientId)} bought ${offer.name} for ${amount}.`,
        link: "/payments?tab=payments",
        metadata: { purchaseId: purchase.id },
      },
      `purchase-paid:${purchase.id}`
    );
  }

  // Re-read: a replay of a paid-but-unfulfilled purchase should still fulfill.
  const current = await prisma.offerPurchase.findUnique({ where: { id: purchase.id } });
  if (current?.status === "PAID" && current.fulfillmentStatus !== "FULFILLED") return current.id;
  return null;
}

/** `checkout.session.async_payment_failed` for a PROGRAM purchase. */
export async function markPurchasePaymentFailed(session: Stripe.Checkout.Session, stripeAccountId: string): Promise<boolean> {
  if (session.mode !== "payment") return false;
  const meta = parseConnectMetadata(session.metadata);
  if (!meta) return false;
  const offer = await loadVerifiedOffer(meta, stripeAccountId);
  if (!offer) return false;
  const purchase = await findOrCreatePurchase(session, meta, offer);

  const { count } = await prisma.offerPurchase.updateMany({
    where: { id: purchase.id, status: "PENDING" },
    data: { status: "FAILED", failureReason: "Payment failed" },
  });
  if (count !== 1) return false;

  const dedupeKey = `purchase-failed:${purchase.id}`;
  await notifyOnce(
    {
      userId: meta.clientId,
      type: NOTIFICATION_TYPES.OFFER_PAYMENT_FAILED,
      title: "Payment failed",
      body: `Your payment for ${offer.name} didn't go through. You can try again from the Store.`,
      link: "/store",
      metadata: { purchaseId: purchase.id },
    },
    dedupeKey
  );
  await notifyOnce(
    {
      userId: meta.trainerId,
      type: NOTIFICATION_TYPES.OFFER_PAYMENT_FAILED,
      title: "Payment failed",
      body: `${await clientName(meta.clientId)}'s payment for ${offer.name} failed.`,
      link: "/payments?tab=payments",
      metadata: { purchaseId: purchase.id },
    },
    dedupeKey
  );
  return true;
}

/**
 * Grants program access for a PAID purchase. Idempotent and safe to retry:
 * a FULFILLED purchase is a no-op. Failures are recorded on the row
 * (`fulfillmentStatus` FAILED) for the cron, then rethrown.
 */
export async function fulfillOfferPurchase(purchaseId: string): Promise<void> {
  const purchase = await prisma.offerPurchase.findUnique({ where: { id: purchaseId }, include: { offer: true } });
  if (!purchase || purchase.status !== "PAID" || purchase.fulfillmentStatus === "FULFILLED") return;

  try {
    const templateId = purchase.offer.programTemplateId;
    if (!templateId) throw new Error(`Offer ${purchase.offerId} has no program template`);

    // Paid twice for the same program (e.g. two checkout tabs): don't clone
    // a second copy. The trainer refunds the duplicate from Stripe; with no
    // assignedProgramId, that refund pauses nothing the client still owns.
    if (!purchase.assignedProgramId) {
      const others = await prisma.offerPurchase.findMany({
        where: { offerId: purchase.offerId, clientId: purchase.clientId, status: "PAID", fulfillmentStatus: "FULFILLED" },
        select: { id: true, assignedProgramId: true },
      });
      if (others.some((o) => o.id !== purchase.id && o.assignedProgramId)) {
        await prisma.offerPurchase.updateMany({
          where: { id: purchase.id, status: "PAID" },
          data: { fulfillmentStatus: "FULFILLED", failureReason: "Duplicate purchase: the client already owns this program. Refund it in Stripe." },
        });
        console.warn(`[payments] duplicate purchase ${purchase.id} for offer ${purchase.offerId}; not cloning again`);
        return;
      }
    }

    const programId = await grantProgramAccess({
      templateId,
      trainerId: purchase.trainerId,
      clientId: purchase.clientId,
      currentProgramId: purchase.assignedProgramId,
      claim: async (id) => {
        const { count } = await prisma.offerPurchase.updateMany({
          where: { id: purchase.id, ...nullOrUnset("assignedProgramId") },
          data: { assignedProgramId: id },
        });
        return count === 1;
      },
    });
    // null: a concurrent run claimed it and finishes the assignment.
    if (programId === null) return;

    await prisma.offerPurchase.updateMany({
      where: { id: purchase.id, status: "PAID" },
      data: { fulfillmentStatus: "FULFILLED", failureReason: null },
    });

    // A refund (or lost dispute) that landed while we were cloning found no
    // program to pause yet — pause it now.
    const after = await prisma.offerPurchase.findUnique({ where: { id: purchase.id }, select: { status: true } });
    if (after?.status === "REFUNDED") await pauseProgramAccess(programId);
  } catch (err) {
    const reason = err instanceof Error ? err.message.slice(0, 300) : "Fulfillment failed";
    await prisma.offerPurchase
      .updateMany({
        where: { id: purchase.id, fulfillmentStatus: { not: "FULFILLED" } },
        data: { fulfillmentStatus: "FAILED", failureReason: reason },
      })
      .catch((writeErr) => console.error("[payments] could not record fulfillment failure:", writeErr));
    throw err;
  }
}

/** The purchase a payment belongs to, scoped to the connected account it was made on. */
async function findPurchaseForPayment(paymentIntentId: string | null, stripeAccountId: string): Promise<OfferPurchase | null> {
  if (!paymentIntentId) return null;
  const byIntent = await prisma.offerPurchase.findFirst({
    where: { stripePaymentIntentId: paymentIntentId, stripeAccountId },
  });
  if (byIntent) return byIntent;

  // The payment intent wasn't recorded yet (refund raced the paid webhook):
  // find the session that created it, on the same account.
  const sessions = await stripe.checkout.sessions.list({ payment_intent: paymentIntentId, limit: 1 }, { stripeAccount: stripeAccountId });
  const sessionId = sessions.data[0]?.id;
  if (!sessionId) return null;
  const bySession = await prisma.offerPurchase.findUnique({ where: { stripeCheckoutSessionId: sessionId } });
  return bySession && bySession.stripeAccountId === stripeAccountId ? bySession : null;
}

/**
 * Ends access for a purchase whose money went back: PENDING or PAID →
 * REFUNDED (a PENDING row must flip too, or a later paid event would still
 * fulfill it) and the program is paused. Idempotent.
 */
async function revokePurchase(
  purchase: OfferPurchase,
  paymentIntentId: string,
  reason: string
): Promise<boolean> {
  const { count } = await prisma.offerPurchase.updateMany({
    where: { id: purchase.id, status: { in: ["PENDING", "PAID"] } },
    data: { status: "REFUNDED", refundedAt: new Date(), stripePaymentIntentId: paymentIntentId, failureReason: reason },
  });
  if (count !== 1) return false;
  // Re-read: fulfillment may have assigned a program since we loaded the row.
  const current = await prisma.offerPurchase.findUnique({ where: { id: purchase.id }, select: { assignedProgramId: true } });
  await pauseProgramAccess(current?.assignedProgramId ?? purchase.assignedProgramId);
  return true;
}

/**
 * `charge.refunded`: a full refund ends access (REFUNDED + program paused).
 * Partial refunds are a goodwill gesture and leave access alone. Charges for
 * membership invoices aren't purchases and are ignored here — ending a
 * membership goes through its subscription.
 */
export async function handleChargeRefunded(charge: Stripe.Charge, stripeAccountId: string): Promise<boolean> {
  if (!charge.refunded) return false;
  const paymentIntentId = idOf(charge.payment_intent);
  const purchase = await findPurchaseForPayment(paymentIntentId, stripeAccountId);
  if (!purchase || !paymentIntentId) return false;
  if (!(await revokePurchase(purchase, paymentIntentId, "Refunded"))) return false;

  const offer = await prisma.paidOffer.findUnique({ where: { id: purchase.offerId }, select: { name: true } });
  const amount = formatStripeAmount(charge.amount_refunded, charge.currency);
  await notifyOnce(
    {
      userId: purchase.clientId,
      type: NOTIFICATION_TYPES.REFUND_PROCESSED,
      title: "Refund processed",
      body: `Your ${amount} refund for ${offer?.name ?? "your program"} has been processed.`,
      link: "/store",
      metadata: { purchaseId: purchase.id },
      email: { amount, programCount: 1 },
    },
    `purchase-refunded:${purchase.id}`
  );
  return true;
}

/** `charge.dispute.closed` lost: the money went back to the client, so access ends like a full refund. */
export async function handleDisputeClosed(dispute: Stripe.Dispute, stripeAccountId: string): Promise<boolean> {
  if (dispute.status !== "lost") return false;
  const paymentIntentId = idOf(dispute.payment_intent);
  const purchase = await findPurchaseForPayment(paymentIntentId, stripeAccountId);
  if (!purchase || !paymentIntentId) return false;
  return revokePurchase(purchase, paymentIntentId, "Dispute lost");
}

const STALE_PENDING_MAX_AGE_MS = 2 * 24 * 60 * 60 * 1000;
const RETRY_BATCH = 25;

/**
 * Cron body (run from /api/cron/retry-program-purchases):
 * 1. PAID purchases whose fulfillment is PENDING/FAILED past a grace period
 *    are fulfilled again.
 * 2. PENDING purchases past the grace period are reconciled against Stripe,
 *    in case a webhook was missed: paid → marked PAID and fulfilled; expired
 *    → FAILED, so the sweep stops checking them.
 * Best-effort per row; one failure never stops the rest.
 */
export async function retryStuckOfferPurchases(
  graceMs = 5 * 60 * 1000,
  now = new Date()
): Promise<{ retried: number; succeeded: number; failed: number; reconciled: number }> {
  const cutoff = new Date(now.getTime() - graceMs);

  const unfulfilled = await prisma.offerPurchase.findMany({
    where: { status: "PAID", fulfillmentStatus: { in: ["PENDING", "FAILED"] }, updatedAt: { lt: cutoff } },
    select: { id: true },
    take: RETRY_BATCH,
  });
  let succeeded = 0;
  let failed = 0;
  for (const { id } of unfulfilled) {
    try {
      await fulfillOfferPurchase(id);
      succeeded += 1;
    } catch (err) {
      console.error(`[payments] retry fulfillment failed for purchase ${id}:`, err);
      failed += 1;
    }
  }

  const pending = await prisma.offerPurchase.findMany({
    where: {
      status: "PENDING",
      createdAt: { lt: cutoff, gte: new Date(now.getTime() - STALE_PENDING_MAX_AGE_MS) },
    },
    take: RETRY_BATCH,
  });
  let reconciled = 0;
  for (const purchase of pending) {
    try {
      const session = await stripe.checkout.sessions.retrieve(purchase.stripeCheckoutSessionId, {}, {
        stripeAccount: purchase.stripeAccountId,
      });
      if (session.payment_status === "paid") {
        const toFulfill = await markPurchasePaid(session, purchase.stripeAccountId);
        if (toFulfill) await fulfillOfferPurchase(toFulfill);
        reconciled += 1;
      } else if (session.status === "expired") {
        await prisma.offerPurchase.updateMany({
          where: { id: purchase.id, status: "PENDING" },
          data: { status: "FAILED", failureReason: "Checkout expired" },
        });
        reconciled += 1;
      }
    } catch (err) {
      console.error(`[payments] reconcile failed for purchase ${purchase.id}:`, err);
    }
  }

  return { retried: unfulfilled.length, succeeded, failed, reconciled };
}

export interface PurchaseListItem {
  id: string;
  offerId: string;
  offerName: string;
  amountInCents: number;
  currency: string;
  status: string;
  fulfillmentStatus: string;
  paidAt: Date | null;
  createdAt: Date;
  assignedProgramId: string | null;
}

/** The client's own completed purchases (abandoned checkouts are not shown). */
export async function listPurchasesForClient(clientId: string): Promise<PurchaseListItem[]> {
  const rows = await prisma.offerPurchase.findMany({
    where: { clientId, status: { in: ["PAID", "REFUNDED"] } },
    include: { offer: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return rows.map((r) => ({
    id: r.id,
    offerId: r.offerId,
    offerName: r.offer.name,
    amountInCents: r.amountInCents,
    currency: r.currency,
    status: r.status,
    fulfillmentStatus: r.fulfillmentStatus,
    paidAt: r.paidAt,
    createdAt: r.createdAt,
    assignedProgramId: r.assignedProgramId,
  }));
}

/** For the /store success page: the buyer's own purchase by session id. */
export async function getPurchaseForClientBySession(clientId: string, sessionId: string) {
  const purchase = await prisma.offerPurchase.findUnique({
    where: { stripeCheckoutSessionId: sessionId },
    include: { offer: { select: { name: true, kind: true } } },
  });
  if (!purchase || purchase.clientId !== clientId) return null;
  return purchase;
}
