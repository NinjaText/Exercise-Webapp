import type Stripe from "stripe";

/** The subscription's current period end (on its first item, per the current Stripe API), or null. */
export function subscriptionPeriodEnd(subscription: Stripe.Subscription): Date | null {
  const end = subscription.items.data[0]?.current_period_end;
  return end ? new Date(end * 1000) : null;
}

/**
 * Trial fields to persist from a Stripe subscription. Only written when the
 * subscription has (or had) a trial, so a later trial-less subscription never
 * clears `trialUsedAt` — that keeps the one-trial-per-account record.
 */
export function subscriptionTrialFields(
  subscription: Pick<Stripe.Subscription, "trial_start" | "trial_end">
): { trialEndsAt?: Date; trialUsedAt?: Date } {
  if (!subscription.trial_end) return {};
  return {
    trialEndsAt: new Date(subscription.trial_end * 1000),
    trialUsedAt: new Date((subscription.trial_start ?? subscription.trial_end) * 1000),
  };
}

/** Stripe subscription status → our SubStatus (shared by trainer and member billing). */
export function stripeStatusToSubStatus(
  status: Stripe.Subscription.Status
): "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED" | "UNPAID" {
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
 * Whether the subscription is set to end rather than renew. Stripe's customer
 * portal now cancels by setting `cancel_at` (e.g. to the trial end) and leaves
 * `cancel_at_period_end` false, so both must be read.
 */
export function isScheduledToCancel(
  subscription: Pick<Stripe.Subscription, "cancel_at_period_end" | "cancel_at">,
): boolean {
  return subscription.cancel_at_period_end || subscription.cancel_at != null;
}
