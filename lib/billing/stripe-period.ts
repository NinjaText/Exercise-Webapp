import type Stripe from "stripe";

/** The subscription's current period end (on its first item, per the current Stripe API), or null. */
export function subscriptionPeriodEnd(subscription: Stripe.Subscription): Date | null {
  const end = subscription.items.data[0]?.current_period_end;
  return end ? new Date(end * 1000) : null;
}
