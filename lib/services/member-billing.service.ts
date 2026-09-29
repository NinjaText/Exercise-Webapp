import type Stripe from "stripe";
import type { SubStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

/** Checkout metadata tag that routes a session to member (not trainer) billing. */
export const MEMBER_PURCHASE_TYPE = "member_subscription";

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

function periodEnd(subscription: Stripe.Subscription): Date | null {
  const end = subscription.items.data[0]?.current_period_end;
  return end ? new Date(end * 1000) : null;
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
  await prisma.memberSubscription.updateMany({
    where: { userId },
    data: {
      // Real Stripe status, so a late/replayed event can't reactivate a canceled sub.
      status: toSubStatus(subscription.status),
      stripeCustomerId: session.customer as string,
      stripeSubscriptionId: subscription.id,
      currentPeriodEnd: periodEnd(subscription),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
  });
}

/** Only the member's current subscription (or a first one) may change their row. */
function forSubscription(stripeCustomerId: string, subscriptionId: string) {
  return {
    stripeCustomerId,
    OR: [{ stripeSubscriptionId: null }, { stripeSubscriptionId: subscriptionId }],
  };
}

export async function syncMemberSubscriptionFromStripe(
  stripeCustomerId: string,
  subscription: Stripe.Subscription
): Promise<number> {
  if (!stripeCustomerId) return 0;
  const { count } = await prisma.memberSubscription.updateMany({
    where: forSubscription(stripeCustomerId, subscription.id),
    data: {
      stripeSubscriptionId: subscription.id,
      status: toSubStatus(subscription.status),
      currentPeriodEnd: periodEnd(subscription),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
  });
  return count;
}

export async function markMemberCanceled(
  stripeCustomerId: string,
  subscriptionId: string
): Promise<number> {
  if (!stripeCustomerId) return 0;
  const { count } = await prisma.memberSubscription.updateMany({
    where: forSubscription(stripeCustomerId, subscriptionId),
    data: { status: "CANCELED" },
  });
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
