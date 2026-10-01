import type Stripe from "stripe";
import type { MemberSubscription, Organization, Prisma, SubStatus, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { nullOrUnset } from "@/lib/db/mongo-null";
import { stripe } from "@/lib/stripe";
import { subscriptionPeriodEnd } from "@/lib/billing/stripe-period";
import { isStripeSubscriptionAlreadyCanceled } from "@/lib/billing/stripe-errors";
import { cancelCoachingForEndedMembership } from "@/lib/services/coaching.service";

/** Checkout metadata tag that routes a session to member (not trainer) billing. */
export const MEMBER_PURCHASE_TYPE = "member_subscription";

/**
 * The member's Stripe customer: reused when we already have one, otherwise
 * created (idempotent per user) and persisted on their MemberSubscription.
 * Shared by membership and coaching checkout so billing stays on one customer.
 */
export async function ensureMemberStripeCustomer(
  user: Pick<User, "id" | "email" | "firstName" | "lastName">,
  sub: Pick<MemberSubscription, "stripeCustomerId">,
  org: Pick<Organization, "clerkOrgId">
): Promise<string> {
  if (sub.stripeCustomerId) return sub.stripeCustomerId;
  const customer = await stripe.customers.create(
    {
      email: user.email,
      name: `${user.firstName} ${user.lastName}`.trim() || undefined,
      metadata: { userId: user.id, clerkOrgId: org.clerkOrgId },
    },
    { idempotencyKey: `member-customer-${user.id}` }
  );
  await prisma.memberSubscription.update({ where: { userId: user.id }, data: { stripeCustomerId: customer.id } });
  return customer.id;
}

function toSubStatus(status: Stripe.Subscription.Status): SubStatus {
  switch (status) {
    case "trialing": return "TRIALING";
    case "past_due": return "PAST_DUE";
    case "canceled": return "CANCELED";
    // Checkout never completed and Stripe gave up: nothing to pay for.
    case "incomplete_expired": return "CANCELED";
    case "unpaid": return "UNPAID";
    // Paused (e.g. trial ended without a payment method): not paying, so gated.
    case "paused": return "UNPAID";
    default: return "ACTIVE";
  }
}

/**
 * All writes are `updateMany` so events for customers we don't track as members
 * (trainers, deleted accounts) are silent no-ops instead of 500s that Stripe
 * would retry for days — same reasoning as stripe-billing.service.ts. The
 * returned count lets the webhook tell member events from trainer events.
 */
export async function activateMemberFromCheckout(session: Stripe.Checkout.Session): Promise<void> {
  const userId = session.metadata?.userId;
  if (!userId) return;
  const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
  const status = toSubStatus(subscription.status);
  const { count } = await prisma.memberSubscription.updateMany({
    where: { userId },
    data: {
      // Real Stripe status, so a late/replayed event can't reactivate a canceled sub.
      status,
      stripeCustomerId: session.customer as string,
      stripeSubscriptionId: subscription.id,
      currentPeriodEnd: subscriptionPeriodEnd(subscription),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
  });
  if (count > 0 && status === "CANCELED") await endCoachingForCanceledMembers({ userId });
}

/** Only the member's current subscription (or a first one) may change their row. */
function forSubscription(stripeCustomerId: string, subscriptionId: string): Prisma.MemberSubscriptionWhereInput {
  return {
    stripeCustomerId,
    // No subscription yet = null or never written (trial rows); see nullOrUnset.
    OR: [...nullOrUnset("stripeSubscriptionId").OR, { stripeSubscriptionId: subscriptionId }],
  };
}

/**
 * Membership ended (spec §6): end the members' coaching too. Best-effort — the
 * membership write already happened and must not 500 the webhook, so a
 * failure is logged for follow-up instead.
 */
async function endCoachingForCanceledMembers(where: Prisma.MemberSubscriptionWhereInput): Promise<void> {
  let userIds: string[];
  try {
    const rows = await prisma.memberSubscription.findMany({
      where: { ...where, status: "CANCELED" },
      select: { userId: true },
    });
    userIds = rows.map((r) => r.userId);
  } catch (err) {
    console.error("[member-billing] coaching cascade lookup failed:", err);
    return;
  }
  for (const userId of userIds) {
    try {
      await cancelCoachingForEndedMembership(userId);
    } catch (err) {
      console.error(`[member-billing] coaching cascade failed for ${userId}:`, err);
    }
  }
}

export async function syncMemberSubscriptionFromStripe(
  stripeCustomerId: string,
  subscription: Stripe.Subscription
): Promise<number> {
  if (!stripeCustomerId) return 0;
  const where = forSubscription(stripeCustomerId, subscription.id);
  const status = toSubStatus(subscription.status);
  const { count } = await prisma.memberSubscription.updateMany({
    where,
    data: {
      stripeSubscriptionId: subscription.id,
      status,
      currentPeriodEnd: subscriptionPeriodEnd(subscription),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
  });
  if (count > 0 && status === "CANCELED") await endCoachingForCanceledMembers(where);
  return count;
}

export async function markMemberCanceled(
  stripeCustomerId: string,
  subscriptionId: string
): Promise<number> {
  if (!stripeCustomerId) return 0;
  const where = forSubscription(stripeCustomerId, subscriptionId);
  const { count } = await prisma.memberSubscription.updateMany({ where, data: { status: "CANCELED" } });
  if (count > 0) await endCoachingForCanceledMembers(where);
  return count;
}

/** `subscriptionId` null (invoice not tied to a subscription) → match by customer only. */
export async function markMemberPastDue(
  stripeCustomerId: string,
  subscriptionId: string | null
): Promise<number> {
  if (!stripeCustomerId) return 0;
  const { count } = await prisma.memberSubscription.updateMany({
    where: subscriptionId ? forSubscription(stripeCustomerId, subscriptionId) : { stripeCustomerId },
    data: { status: "PAST_DUE" },
  });
  return count;
}

/**
 * Stops a club member's Stripe billing before their account is deleted —
 * every deletion entry point (self-delete, super-admin delete, Clerk
 * `user.deleted`) calls this before `deleteUserData`, which removes the
 * MemberSubscription/MemberCoaching rows that are the only record of these
 * subscription ids. Cancels the membership subscription and any ACTIVE/
 * PAST_DUE coaching subscription immediately. "Already cancelled" counts as
 * success; any other Stripe failure throws so the caller aborts with nothing
 * deleted (same rule as trainer billing). Then expires the customer's open
 * Checkout sessions, best-effort, so nothing can be bought for a deleted
 * account. A no-op for anyone without a MemberSubscription (trainers,
 * trainer-org clients).
 */
export async function cancelMemberBillingForDeletion(userId: string): Promise<void> {
  const membership = await prisma.memberSubscription.findUnique({
    where: { userId },
    select: { status: true, stripeCustomerId: true, stripeSubscriptionId: true },
  });
  if (!membership) return;
  const coaching = await prisma.memberCoaching.findUnique({
    where: { userId },
    select: { status: true, stripeSubscriptionId: true },
  });

  const subscriptionIds: string[] = [];
  if (coaching?.stripeSubscriptionId && (coaching.status === "ACTIVE" || coaching.status === "PAST_DUE")) {
    subscriptionIds.push(coaching.stripeSubscriptionId);
  }
  if (membership.stripeSubscriptionId && membership.status !== "CANCELED") {
    subscriptionIds.push(membership.stripeSubscriptionId);
  }
  for (const subscriptionId of subscriptionIds) {
    try {
      await stripe.subscriptions.cancel(subscriptionId);
    } catch (error) {
      if (!isStripeSubscriptionAlreadyCanceled(error, subscriptionId, "[account-deletion]")) throw error;
    }
  }

  if (!membership.stripeCustomerId) return;
  try {
    const open = await stripe.checkout.sessions.list({ customer: membership.stripeCustomerId, status: "open", limit: 100 });
    for (const session of open.data) await stripe.checkout.sessions.expire(session.id);
  } catch (error) {
    console.error(`[account-deletion] could not expire open checkouts for ${userId}:`, error);
  }
}
