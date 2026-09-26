import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { tierFromPriceId } from "@/lib/stripe-config";
import { SubStatus } from "@prisma/client";
import type Stripe from "stripe";

function stripeStatusToSubStatus(status: Stripe.Subscription.Status): SubStatus {
  switch (status) {
    case "active": return "ACTIVE";
    case "trialing": return "TRIALING";
    case "past_due": return "PAST_DUE";
    case "canceled": return "CANCELED";
    case "unpaid": return "UNPAID";
    default: return "ACTIVE";
  }
}

/**
 * These writes use `updateMany` rather than `update`: a trainer who has
 * deleted their account has no `TrainerSubscription` row, and `update` throws
 * P2025 for a missing row, which surfaces as a 500 on the Stripe webhook and
 * makes Stripe retry the same doomed event for days. `updateMany` is a no-op
 * when nothing matches, which is the correct outcome for an event about a
 * customer we no longer track. Neither caller uses the returned record.
 */
export async function syncSubscriptionFromStripe(
  stripeCustomerId: string,
  subscription: Stripe.Subscription
): Promise<void> {
  const priceId = subscription.items.data[0]?.price.id ?? null;
  const plan = priceId ? tierFromPriceId(priceId) : null;

  await prisma.trainerSubscription.updateMany({
    where: { stripeCustomerId },
    data: {
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      plan: plan ?? "STARTER",
      status: stripeStatusToSubStatus(subscription.status),
      currentPeriodEnd: subscription.items.data[0]?.current_period_end
        ? new Date(subscription.items.data[0].current_period_end * 1000)
        : null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
  });
}

export async function activateSubscriptionFromCheckout(
  session: Stripe.Checkout.Session
): Promise<void> {
  const stripeCustomerId = session.customer as string;
  const subscriptionId = session.subscription as string;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const priceId = subscription.items.data[0]?.price.id ?? null;
  const plan = priceId ? tierFromPriceId(priceId) : null;

  await prisma.trainerSubscription.updateMany({
    where: { stripeCustomerId },
    data: {
      stripeSubscriptionId: subscriptionId,
      stripePriceId: priceId,
      plan: plan ?? "STARTER",
      status: "ACTIVE",
      currentPeriodEnd: subscription.items.data[0]?.current_period_end
        ? new Date(subscription.items.data[0].current_period_end * 1000)
        : null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
  });
}
