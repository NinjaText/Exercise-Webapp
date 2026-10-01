import type Stripe from "stripe";
import type { CoachingStatus, MemberCoaching, Prisma, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { nullOrUnset } from "@/lib/db/mongo-null";
import { stripe } from "@/lib/stripe";
import { getOrgCapabilities } from "@/lib/org-capabilities";
import { getOrgForUser } from "@/lib/org-capabilities.server";
import { evaluateMemberAccess } from "@/lib/billing/access";
import { isStripeSubscriptionAlreadyCanceled } from "@/lib/billing/stripe-errors";
import { subscriptionPeriodEnd } from "@/lib/billing/stripe-period";
import { nextCoachingStatus, type CoachingEvent } from "@/lib/clubs/coaching-state";
import { getClubTrainer } from "@/lib/services/club-trainer.service";
import { notifyUser } from "@/lib/services/notification.service";
import { NOTIFICATION_TYPES } from "@/lib/notifications/types";
import { logUserAudit } from "@/lib/services/audit-log.service";
import { AUDIT_ACTIONS } from "@/lib/audit/catalog";
import { appBaseUrl } from "@/lib/utils/app-url";

/**
 * The club coaching add-on (spec §6): member requests → club trainer accepts
 * or declines → member pays (Task 6 syncs Stripe) → ACTIVE. Every status
 * write is conditional on the status it was read in, and legal only if
 * `nextCoachingStatus` allows it, so concurrent and replayed calls are safe.
 */

/** Checkout metadata tag that routes a session to the coaching add-on. */
export const COACHING_PURCHASE_TYPE = "member_coaching";

export type CoachingErrorCode =
  | "not_offered"
  | "not_eligible"
  | "invalid_input"
  | "invalid_state"
  | "not_found"
  | "forbidden";

const DEFAULT_MESSAGES: Record<CoachingErrorCode, string> = {
  not_offered: "Coaching isn't offered at this club right now.",
  not_eligible: "Your membership needs to be in good standing to request coaching.",
  invalid_input: "Notes must be 1–1000 characters.",
  invalid_state: "This coaching request has changed. Refresh and try again.",
  not_found: "Coaching request not found.",
  forbidden: "You can't manage coaching for this member.",
};

/** Its message is safe to show in the UI. */
export class CoachingError extends Error {
  constructor(public code: CoachingErrorCode, message?: string) {
    super(message ?? DEFAULT_MESSAGES[code]);
    this.name = "CoachingError";
  }
}

const NOTE_MAX = 1000;
const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;

type Actor = Pick<User, "id" | "role" | "clerkOrgId" | "firstName" | "lastName" | "email">;
type MemberSummary = Pick<User, "id" | "firstName" | "lastName" | "email">;
type CoachingWithUser = MemberCoaching & { user: MemberSummary };

const MEMBER_SELECT = { id: true, firstName: true, lastName: true, email: true } as const;

function fullName(u: Pick<User, "firstName" | "lastName" | "email">): string {
  return `${u.firstName} ${u.lastName}`.trim() || u.email;
}

function trimNote(raw: string | undefined): string {
  const note = (raw ?? "").trim();
  if (note.length > NOTE_MAX) throw new CoachingError("invalid_input");
  return note;
}

/** The member's request note: trimmed, 1–1000 characters. */
function parseRequiredNote(raw: string): string {
  const note = trimNote(raw);
  if (!note) throw new CoachingError("invalid_input");
  return note;
}

/** The trainer's optional reply: trimmed, at most 1000 characters; `null` when empty. */
function parseOptionalNote(raw: string | undefined): string | null {
  return trimNote(raw) || null;
}

function transition(current: CoachingStatus | null, event: CoachingEvent): CoachingStatus {
  const next = nextCoachingStatus(current, event);
  if (!next) throw new CoachingError("invalid_state");
  return next;
}

/** The club trainer of the org the coaching row belongs to. */
function isTrainerFor(actor: Actor, coaching: MemberCoaching): boolean {
  return actor.role === "TRAINER" && actor.clerkOrgId !== null && actor.clerkOrgId === coaching.clerkOrgId;
}

async function loadCoaching(memberId: string): Promise<CoachingWithUser> {
  if (!OBJECT_ID_RE.test(memberId)) throw new CoachingError("not_found");
  const coaching = await prisma.memberCoaching.findUnique({
    where: { userId: memberId },
    include: { user: { select: MEMBER_SELECT } },
  });
  if (!coaching) throw new CoachingError("not_found");
  return coaching;
}

/** Writes only if the row still matches `where`; count 0 means someone else moved it first. */
async function conditionalWrite(
  where: Prisma.MemberCoachingWhereInput & { userId: string },
  data: Prisma.MemberCoachingUpdateManyMutationInput
): Promise<MemberCoaching> {
  const { count } = await prisma.memberCoaching.updateMany({ where, data });
  if (count !== 1) throw new CoachingError("invalid_state");
  const updated = await prisma.memberCoaching.findUnique({ where: { userId: where.userId } });
  if (!updated) throw new CoachingError("not_found");
  return updated;
}

export async function getCoachingForUser(userId: string): Promise<MemberCoaching | null> {
  return prisma.memberCoaching.findUnique({ where: { userId } });
}

/**
 * Expires the customer's open coaching Checkout sessions, so an offer that was
 * re-opened, withdrawn or ended can't still be paid from an old tab. Only
 * sessions tagged `COACHING_PURCHASE_TYPE` are touched; membership checkout is
 * left alone. A Stripe failure propagates — callers decide whether it matters.
 * One page (100) is plenty: a member never has that many open sessions.
 */
export async function expireOpenCoachingCheckouts(customerId: string): Promise<number> {
  const sessions = await stripe.checkout.sessions.list({ customer: customerId, status: "open", limit: 100 });
  let expired = 0;
  for (const session of sessions.data) {
    if (session.metadata?.purchaseType !== COACHING_PURCHASE_TYPE) continue;
    await stripe.checkout.sessions.expire(session.id);
    expired += 1;
  }
  return expired;
}

/**
 * Best-effort `expireOpenCoachingCheckouts` for a member, by their stored
 * Stripe customer. Logged, never thrown: the status write it follows has
 * already happened, and a checkout that completes anyway is cancelled and
 * refunded as an orphan (`cancelOrphanSubscription`).
 */
async function expireMemberCoachingCheckouts(userId: string): Promise<void> {
  try {
    const membership = await prisma.memberSubscription.findUnique({
      where: { userId },
      select: { stripeCustomerId: true },
    });
    if (!membership?.stripeCustomerId) return;
    await expireOpenCoachingCheckouts(membership.stripeCustomerId);
  } catch (err) {
    console.error(`[coaching] could not expire open coaching checkouts for ${userId}:`, err);
  }
}

/**
 * Per-cycle fields a new request starts without. Written as explicit nulls on
 * create too (not omitted): Mongo `{ field: null }` filters miss unwritten fields.
 */
const CLEARED_CYCLE_FIELDS = {
  responseNote: null,
  respondedAt: null,
  respondedById: null,
  stripeSubscriptionId: null,
  currentPeriodEnd: null,
} as const;

/** Opens a request cycle: creates the member's row, or reuses a DECLINED/CANCELED one. */
async function writeRequest(userId: string, clerkOrgId: string, note: string): Promise<MemberCoaching> {
  const fresh = {
    clerkOrgId,
    status: transition(null, "member_request"),
    requestNote: note,
    requestedAt: new Date(),
    ...CLEARED_CYCLE_FIELDS,
  };
  const existing = await getCoachingForUser(userId);
  if (!existing) {
    try {
      return await prisma.memberCoaching.create({ data: { userId, ...fresh } });
    } catch (err) {
      if ((err as { code?: string }).code !== "P2002") throw err;
    }
  }
  // A row exists (or a concurrent first request just created one).
  const current = existing ?? (await getCoachingForUser(userId));
  if (!current) throw new CoachingError("invalid_state");
  transition(current.status, "member_request");
  return conditionalWrite(
    { userId, status: current.status },
    { ...fresh, cancelAtPeriodEnd: false }
  );
}

export async function requestCoaching(member: User, note: string): Promise<MemberCoaching> {
  if (member.role !== "CLIENT") throw new CoachingError("not_eligible", "Only club members can request coaching.");
  const org = await getOrgForUser(member);
  if (!org || getOrgCapabilities(org).billing !== "member") {
    throw new CoachingError("not_eligible", "Coaching is only available to club members.");
  }
  if (!org.coachingStripePriceId) throw new CoachingError("not_offered");
  const trainer = await getClubTrainer(org.clerkOrgId);
  if (!trainer) throw new CoachingError("not_offered");

  const membership = await prisma.memberSubscription.findUnique({ where: { userId: member.id } });
  if (evaluateMemberAccess(membership, new Date()) !== "ok") throw new CoachingError("not_eligible");

  const requestNote = parseRequiredNote(note);
  const coaching = await writeRequest(member.id, org.clerkOrgId, requestNote);

  const memberName = fullName(member);
  await notifyUser({
    userId: trainer.id,
    type: NOTIFICATION_TYPES.COACHING_REQUESTED,
    title: "Coaching request",
    body: `${memberName} asked you for coaching.`,
    link: `/clients/${member.id}`,
    metadata: { memberId: member.id, coachingId: coaching.id },
    email: { memberName, note: requestNote, clientLink: `${appBaseUrl()}/clients/${member.id}` },
  });
  await logUserAudit(member, () => ({
    action: AUDIT_ACTIONS.COACHING_REQUESTED,
    targetType: "User",
    targetId: member.id,
    targetLabel: memberName,
  }));
  return coaching;
}

export async function respondToCoachingRequest(
  trainer: User,
  memberId: string,
  accept: boolean,
  note?: string
): Promise<MemberCoaching> {
  const coaching = await loadCoaching(memberId);
  if (!isTrainerFor(trainer, coaching)) throw new CoachingError("forbidden");
  const responseNote = parseOptionalNote(note);
  const status = transition(coaching.status, accept ? "trainer_accept" : "trainer_decline");

  const updated = await conditionalWrite(
    { userId: memberId, status: coaching.status },
    { status, responseNote, respondedAt: new Date(), respondedById: trainer.id }
  );

  const trainerName = fullName(trainer);
  const clubName = (await getOrgForUser(trainer))?.name ?? "your club";
  const dashboardLink = `${appBaseUrl()}/dashboard`;
  await notifyUser(
    accept
      ? {
          userId: memberId,
          type: NOTIFICATION_TYPES.COACHING_ACCEPTED,
          title: "Coaching request accepted",
          body: `${trainerName} accepted your coaching request. Start coaching from your dashboard.`,
          link: "/dashboard",
          metadata: { coachingId: coaching.id },
          email: { trainerName, clubName, dashboardLink },
        }
      : {
          userId: memberId,
          type: NOTIFICATION_TYPES.COACHING_DECLINED,
          title: "Coaching request declined",
          body: responseNote
            ? `${trainerName} declined your coaching request: "${responseNote}"`
            : `${trainerName} declined your coaching request.`,
          link: "/dashboard",
          metadata: { coachingId: coaching.id },
          email: { trainerName, clubName, note: responseNote ?? undefined, dashboardLink },
        }
  );
  await logUserAudit(trainer, () => ({
    action: accept ? AUDIT_ACTIONS.COACHING_ACCEPTED : AUDIT_ACTIONS.COACHING_DECLINED,
    targetType: "User",
    targetId: memberId,
    targetLabel: fullName(coaching.user),
    metadata: responseNote ? { note: responseNote } : undefined,
  }));
  return updated;
}

/** The member, or their club trainer, cancels a request or an unpaid offer. */
export async function withdrawCoaching(actor: User, memberId: string): Promise<MemberCoaching> {
  const coaching = await loadCoaching(memberId);
  let event: CoachingEvent;
  if (actor.id === memberId && actor.role === "CLIENT") event = "member_withdraw";
  else if (isTrainerFor(actor, coaching)) event = "trainer_withdraw";
  else throw new CoachingError("forbidden");

  const updated = await conditionalWrite(
    { userId: memberId, status: coaching.status },
    { status: transition(coaching.status, event) }
  );
  await logUserAudit(actor, () => ({
    action: AUDIT_ACTIONS.COACHING_WITHDRAWN,
    targetType: "User",
    targetId: memberId,
    targetLabel: fullName(coaching.user),
    metadata: { from: coaching.status },
  }));
  await expireMemberCoachingCheckouts(memberId);
  return updated;
}

/**
 * The club trainer ends coaching. Paid coaching runs to the end of the period
 * (Stripe's deleted event sets CANCELED later); an unpaid offer ends now.
 */
export async function endCoaching(trainer: User, memberId: string): Promise<MemberCoaching> {
  const coaching = await loadCoaching(memberId);
  if (!isTrainerFor(trainer, coaching)) throw new CoachingError("forbidden");

  let updated: MemberCoaching;
  if (coaching.status === "ACTIVE" || coaching.status === "PAST_DUE") {
    if (coaching.cancelAtPeriodEnd) return coaching; // already ending; idempotent
    const subId = coaching.stripeSubscriptionId;
    if (!subId) throw new CoachingError("invalid_state");
    await stripe.subscriptions.update(subId, { cancel_at_period_end: true });
    updated = await conditionalWrite(
      { userId: memberId, status: coaching.status, stripeSubscriptionId: subId },
      { cancelAtPeriodEnd: true }
    );
  } else if (coaching.status === "ACCEPTED") {
    updated = await conditionalWrite(
      { userId: memberId, status: coaching.status },
      { status: transition(coaching.status, "trainer_withdraw") }
    );
    await expireMemberCoachingCheckouts(memberId);
  } else {
    throw new CoachingError("invalid_state");
  }

  await logUserAudit(trainer, () => ({
    action: AUDIT_ACTIONS.COACHING_ENDED,
    targetType: "User",
    targetId: memberId,
    targetLabel: fullName(coaching.user),
    metadata: { from: coaching.status, atPeriodEnd: coaching.status !== "ACCEPTED" },
  }));
  return updated;
}

/**
 * Membership ended (spec §6): paid coaching is cancelled in Stripe right
 * away, and any open row becomes CANCELED. A non-"already cancelled" Stripe
 * error propagates and leaves the row as is, so it still mirrors billing.
 * Retries once if the row moved under us (e.g. checkout just activated it);
 * throws `invalid_state` if it moved again.
 */
export async function cancelCoachingForEndedMembership(userId: string): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const coaching = await getCoachingForUser(userId);
    if (!coaching) return;
    const next = nextCoachingStatus(coaching.status, "membership_ended");
    if (!next) return;

    const subId = coaching.stripeSubscriptionId;
    if ((coaching.status === "ACTIVE" || coaching.status === "PAST_DUE") && subId) {
      try {
        await stripe.subscriptions.cancel(subId);
      } catch (err) {
        if (!isStripeSubscriptionAlreadyCanceled(err, subId, "[coaching]")) throw err;
      }
    }
    const { count } = await prisma.memberCoaching.updateMany({
      where: { userId, status: coaching.status },
      data: { status: next, cancelAtPeriodEnd: false },
    });
    if (count === 1) {
      // An unpaid request/offer may still have a checkout open in some tab.
      if (coaching.status === "REQUESTED" || coaching.status === "ACCEPTED") {
        await expireMemberCoachingCheckouts(userId);
      }
      return;
    }
  }
  console.error(`[coaching] could not cancel coaching for ended membership of ${userId}: row kept changing`);
  throw new CoachingError("invalid_state");
}

/** Coaching that can still bill, or still be paid for. */
const OPEN_COACHING_STATUSES: CoachingStatus[] = ["REQUESTED", "ACCEPTED", "ACTIVE", "PAST_DUE"];

/**
 * A no-card trial that runs out fires no Stripe event, so nothing else ends
 * the member's coaching (spec §6 "membership ended"). Daily cron body, run
 * from the member-trial-reminders cron: coaching bills monthly, so a lag of
 * under a day can't add a charge except a renewal landing in that window,
 * and the trial-ending cron is where this rule belongs (the 15-minute cron is
 * starter-program cloning). Matches `evaluateMemberAccess`: a member who
 * subscribed during the trial (`stripeSubscriptionId` set) keeps access past
 * `trialEndsAt` and is skipped. Best-effort per member, logged; one failure
 * never stops the rest.
 */
export async function sweepCoachingForExpiredTrials(now = new Date()): Promise<{ checked: number; canceled: number }> {
  const open = await prisma.memberCoaching.findMany({
    where: { status: { in: OPEN_COACHING_STATUSES } },
    select: { userId: true },
  });
  if (open.length === 0) return { checked: 0, canceled: 0 };
  const expired = await prisma.memberSubscription.findMany({
    where: {
      userId: { in: open.map((row) => row.userId) },
      status: "TRIALING",
      ...nullOrUnset("stripeSubscriptionId"),
      trialEndsAt: { lt: now },
    },
    select: { userId: true },
  });
  let canceled = 0;
  for (const { userId } of expired) {
    try {
      await cancelCoachingForEndedMembership(userId);
      canceled += 1;
    } catch (err) {
      console.error(`[coaching] expired-trial sweep could not cancel coaching for ${userId}:`, err);
    }
  }
  return { checked: expired.length, canceled };
}

// ── Stripe sync (spec §6 webhook routing) ──────────────────────────────────

type StripeCoachingEvent = Extract<CoachingEvent, "payment_succeeded" | "payment_failed" | "subscription_ended">;

/** The status each Stripe-driven event lands on, to spot a same-state (period-only) update. */
const EVENT_TARGET: Record<StripeCoachingEvent, CoachingStatus> = {
  payment_succeeded: "ACTIVE",
  payment_failed: "PAST_DUE",
  subscription_ended: "CANCELED",
};

/** `null` for statuses that move nothing (incomplete, paused). */
function stripeCoachingEvent(status: Stripe.Subscription.Status): StripeCoachingEvent | null {
  switch (status) {
    case "active":
    case "trialing":
      return "payment_succeeded";
    case "past_due":
    case "unpaid":
      return "payment_failed";
    case "canceled":
    case "incomplete_expired":
      return "subscription_ended";
    default:
      return null;
  }
}

/** Still billing (or about to): a subscription we don't want must be cancelled. */
function isLive(status: Stripe.Subscription.Status): boolean {
  return status === "active" || status === "trialing" || status === "past_due" || status === "unpaid";
}

/**
 * Only an ACCEPTED row with no subscription yet may adopt one by `userId`, and
 * only a subscription created after the offer was accepted, so a delayed
 * event from an earlier cycle's subscription can never be taken for this
 * cycle's checkout.
 */
function canAdopt(row: MemberCoaching, subscription: Stripe.Subscription): boolean {
  return (
    row.status === "ACCEPTED" &&
    row.stripeSubscriptionId === null &&
    row.respondedAt !== null &&
    subscription.created * 1000 >= row.respondedAt.getTime()
  );
}

/**
 * A coaching subscription no open offer owns (offer withdrawn mid-checkout,
 * or an old cycle's subscription): cancel it if it still bills, never drop it
 * silently. A non-"already cancelled" Stripe error propagates so Stripe retries.
 */
async function cancelOrphanSubscription(subscription: Stripe.Subscription, reason: string): Promise<void> {
  if (!isLive(subscription.status)) {
    console.info(`[coaching] ignoring ended subscription ${subscription.id} (${reason})`);
    return;
  }
  console.warn(`[coaching] cancelling orphaned subscription ${subscription.id} (${reason})`);
  try {
    await stripe.subscriptions.cancel(subscription.id);
  } catch (err) {
    if (!isStripeSubscriptionAlreadyCanceled(err, subscription.id, "[coaching]")) throw err;
  }
  await refundRecentOrphan(subscription);
}

/** An orphan this young was almost certainly paid for an offer that was already gone. */
const ORPHAN_REFUND_WINDOW_MS = 24 * 60 * 60 * 1000;

function idOf(ref: string | { id: string } | null | undefined): string | undefined {
  return typeof ref === "string" ? ref : ref?.id;
}

/**
 * Refunds the paid first invoice of an orphan created in the last 24 hours
 * (paid after a withdraw/end, or a second checkout). Older orphans are only
 * cancelled — they may be a long-running subscription we must not refund
 * automatically. On this API version the invoice's money lives in
 * `invoice.payments[].payment` (`payment_intent`, or `charge` when there is
 * none). The idempotency key makes a redelivered event refund at most once.
 * Logged, never thrown: the cancel already happened.
 */
async function refundRecentOrphan(subscription: Stripe.Subscription): Promise<void> {
  if (Date.now() - subscription.created * 1000 >= ORPHAN_REFUND_WINDOW_MS) return;
  try {
    const invoiceId = idOf(subscription.latest_invoice);
    if (!invoiceId) return;
    const invoice = await stripe.invoices.retrieve(invoiceId, { expand: ["payments"] });
    if (invoice.status !== "paid" || !invoice.amount_paid) return;
    const payment = invoice.payments?.data.find((p) => p.status === "paid")?.payment;
    const paymentIntent = idOf(payment?.payment_intent);
    const charge = idOf(payment?.charge);
    if (!paymentIntent && !charge) {
      console.error(`[coaching] orphan ${subscription.id}: paid invoice ${invoiceId} has no payment to refund`);
      return;
    }
    const refund = await stripe.refunds.create(
      {
        ...(paymentIntent ? { payment_intent: paymentIntent } : { charge }),
        reason: "requested_by_customer",
        metadata: { purchaseType: COACHING_PURCHASE_TYPE, orphanSubscriptionId: subscription.id },
      },
      { idempotencyKey: `coaching-orphan-refund-${subscription.id}` }
    );
    console.warn(`[coaching] refunded orphaned subscription ${subscription.id} (invoice ${invoiceId}, refund ${refund.id})`);
  } catch (err) {
    console.error(`[coaching] could not refund orphaned subscription ${subscription.id}:`, err);
  }
}

async function findCoachingBySubscription(subscriptionId: string): Promise<MemberCoaching | null> {
  return prisma.memberCoaching.findFirst({ where: { stripeSubscriptionId: subscriptionId } });
}

/**
 * Applies a coaching subscription's state to its row. The row is the one that
 * stores this subscription id, or the member's row by `userId` when it may
 * adopt this subscription (`canAdopt`). Adoption uses the subscription as
 * Stripe has it now (`fresh`, or re-retrieved), not an event snapshot.
 * Anything else is an orphan. Writes are conditional on the status and
 * subscription id they were read with; one retry on a lost race, then
 * `invalid_state` so the webhook 500s and Stripe redelivers.
 */
async function applyCoachingSubscription(
  subscription: Stripe.Subscription,
  userId: string | undefined,
  fresh: boolean
): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const stored = await findCoachingBySubscription(subscription.id);
    const row = stored ?? (userId ? await getCoachingForUser(userId) : null);
    if (!row) {
      if (!userId) {
        // Contract error (tagged without a userId): never cancel a paid subscription over it.
        console.error(`[coaching] subscription ${subscription.id} is tagged coaching but has no userId or stored row; skipped`);
        return;
      }
      return cancelOrphanSubscription(subscription, "no coaching row");
    }
    if (!stored) {
      if (!canAdopt(row, subscription)) {
        return cancelOrphanSubscription(subscription, `row ${row.userId} is ${row.status}, not awaiting this subscription`);
      }
      if (!fresh) {
        subscription = await stripe.subscriptions.retrieve(subscription.id);
        fresh = true;
      }
    }

    const event = stripeCoachingEvent(subscription.status);
    if (!event) return;
    const target = EVENT_TARGET[event];
    let data: Prisma.MemberCoachingUpdateManyMutationInput;
    if (row.status === target) {
      if (target === "CANCELED") return; // replayed end
      data = {}; // e.g. a renewal: only the period moves
    } else {
      const next = nextCoachingStatus(row.status, event);
      if (!next) {
        console.info(`[coaching] ignoring ${event} for ${row.userId} in ${row.status} (${subscription.id})`);
        if (row.status === "CANCELED" || row.status === "DECLINED") {
          await cancelOrphanSubscription(subscription, `row ${row.userId} is ${row.status}`);
        }
        return;
      }
      data = { status: next };
    }
    const ended = data.status === "CANCELED";
    const { count } = await prisma.memberCoaching.updateMany({
      where: {
        userId: row.userId,
        status: row.status,
        // Adoption: the row has no subscription yet, which may mean the field was never written.
        ...(row.stripeSubscriptionId === null
          ? nullOrUnset("stripeSubscriptionId")
          : { stripeSubscriptionId: row.stripeSubscriptionId }),
      },
      data: {
        ...data,
        stripeSubscriptionId: subscription.id,
        currentPeriodEnd: subscriptionPeriodEnd(subscription),
        cancelAtPeriodEnd: ended ? false : subscription.cancel_at_period_end,
      },
    });
    if (count === 1) return;
  }
  console.error(`[coaching] could not sync subscription ${subscription.id}: row kept changing`);
  throw new CoachingError("invalid_state");
}

/** `checkout.session.completed` for the coaching add-on: ACCEPTED → ACTIVE (ACTIVE is idempotent). */
export async function activateCoachingFromCheckout(session: Stripe.Checkout.Session): Promise<void> {
  const userId = session.metadata?.userId;
  if (!userId || !session.subscription) {
    console.error(`[coaching] checkout session ${session.id} is missing userId or subscription; skipped`);
    return;
  }
  const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  await applyCoachingSubscription(subscription, userId, true);
}

/**
 * `customer.subscription.*`: true when this is a coaching subscription (tagged
 * in metadata, or stored on a row), so the webhook stops before membership
 * and trainer billing ever see it. Invalid transitions are ignored, never
 * applied, so a replayed active event after CANCELED can't reactivate.
 */
export async function syncCoachingFromStripe(subscription: Stripe.Subscription): Promise<boolean> {
  const tagged = subscription.metadata?.purchaseType === COACHING_PURCHASE_TYPE;
  if (!tagged && !(await findCoachingBySubscription(subscription.id))) return false;
  await applyCoachingSubscription(subscription, tagged ? subscription.metadata.userId : undefined, false);
  return true;
}

/**
 * `invoice.payment_failed`: true when the invoice is for a coaching
 * subscription (stored on a row, or tagged in the invoice's subscription
 * metadata snapshot), so membership billing never sees it.
 */
export async function markCoachingPastDue(
  subscriptionId: string,
  subscriptionMetadata?: Stripe.Metadata | null
): Promise<boolean> {
  const row = await findCoachingBySubscription(subscriptionId);
  if (!row) return subscriptionMetadata?.purchaseType === COACHING_PURCHASE_TYPE;
  if (row.status === "PAST_DUE") return true;
  const next = nextCoachingStatus(row.status, "payment_failed");
  if (!next) {
    console.info(`[coaching] ignoring payment_failed for ${row.userId} in ${row.status} (${subscriptionId})`);
    return true;
  }
  const { count } = await prisma.memberCoaching.updateMany({
    where: { userId: row.userId, status: row.status, stripeSubscriptionId: subscriptionId },
    data: { status: next },
  });
  // A lost race means another event moved the row; subscription.updated carries the same state.
  if (count !== 1) console.info(`[coaching] payment_failed for ${row.userId} lost a race; skipped`);
  return true;
}

/** The club trainer's inbox: open requests, oldest first. */
export async function listCoachingRequests(clerkOrgId: string): Promise<CoachingWithUser[]> {
  return prisma.memberCoaching.findMany({
    where: { clerkOrgId, status: "REQUESTED" },
    orderBy: { requestedAt: "asc" },
    include: { user: { select: MEMBER_SELECT } },
  });
}
