import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { TRAINER_TRIAL_DAYS, tierFromPrice, type PlanTier } from "@/lib/stripe-config";
import { resolveTierPriceId } from "@/lib/billing/tier-price";
import { isTrialEligible } from "@/lib/billing/access";
import {
  isScheduledToCancel,
  stripeStatusToSubStatus,
  subscriptionPeriodEnd,
  subscriptionTrialFields,
} from "@/lib/billing/stripe-period";
import { appBaseUrl } from "@/lib/utils/app-url";
import type { TrainerSubscription } from "@prisma/client";
import type Stripe from "stripe";

/** Checkout metadata tag for trainer plan checkouts (the webhook's default branch). */
export const TRAINER_PURCHASE_TYPE = "trainer_subscription";

/** Stripe requires trial_end at least 48h out; a legacy trial closer than that bills now. */
const TRIAL_END_MIN_LEAD_MS = 48 * 60 * 60 * 1000;

/** Fields written from a Stripe subscription onto the TrainerSubscription row. */
function rowFromSubscription(subscription: Stripe.Subscription) {
  const price = subscription.items.data[0]?.price ?? null;
  const priceId = price?.id ?? null;
  const plan = tierFromPrice(price);
  return {
    stripeSubscriptionId: subscription.id,
    stripePriceId: priceId,
    // A price without one of our lookup keys (e.g. pre-2026-11) keeps the stored plan.
    ...(plan ? { plan } : {}),
    // Real Stripe status: a trial checkout is TRIALING, not ACTIVE.
    status: stripeStatusToSubStatus(subscription.status),
    currentPeriodEnd: subscriptionPeriodEnd(subscription),
    cancelAtPeriodEnd: isScheduledToCancel(subscription),
    ...subscriptionTrialFields(subscription),
  };
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
  await prisma.trainerSubscription.updateMany({
    where: { stripeCustomerId },
    data: rowFromSubscription(subscription),
  });
}

/** checkout.session.completed for a trainer plan. Respects trialing (no hard ACTIVE). */
export async function activateSubscriptionFromCheckout(
  session: Stripe.Checkout.Session
): Promise<void> {
  const stripeCustomerId = session.customer as string;
  const subscriptionId = session.subscription as string;
  if (!stripeCustomerId || !subscriptionId) return;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  await prisma.trainerSubscription.updateMany({
    where: { stripeCustomerId },
    data: rowFromSubscription(subscription),
  });
}

/** Statuses that mean the trainer already has a live Stripe subscription. */
export function hasLiveTrainerSubscription(
  sub: Pick<TrainerSubscription, "stripeSubscriptionId" | "status">
): boolean {
  return Boolean(sub.stripeSubscriptionId) && sub.status !== "CANCELED";
}

/**
 * True when Stripe already has any subscription (any status) for this
 * customer — a returning customer whose earlier subscription we may not have
 * on the row. Fails closed: if Stripe can't tell us, no trial.
 */
async function customerHadSubscription(stripeCustomerId: string): Promise<boolean> {
  try {
    const list = await stripe.subscriptions.list({ customer: stripeCustomerId, status: "all", limit: 1 });
    return list.data.length > 0;
  } catch (err) {
    console.error("[trainer-checkout] couldn't list subscriptions; no trial:", err);
    return true;
  }
}

export type TrainerTrialPlan =
  | { kind: "trial_days"; days: number }
  | { kind: "trial_end"; trialEnd: number }
  | { kind: "none" };

/**
 * Which trial (if any) a trainer checkout gets:
 *  - a grandfathered card-less trial with >48h left keeps its remaining days
 *    (Stripe bills when it ends);
 *  - a never-trialed account gets TRAINER_TRIAL_DAYS;
 *  - everyone else (trial used, earlier subscription) pays now.
 */
export async function trainerTrialPlan(
  sub: Pick<TrainerSubscription, "status" | "trialEndsAt" | "stripeSubscriptionId" | "trialUsedAt" | "stripeCustomerId">,
  now = new Date()
): Promise<TrainerTrialPlan> {
  if (
    !sub.stripeSubscriptionId &&
    sub.status === "TRIALING" &&
    sub.trialEndsAt.getTime() - now.getTime() > TRIAL_END_MIN_LEAD_MS
  ) {
    return { kind: "trial_end", trialEnd: Math.floor(sub.trialEndsAt.getTime() / 1000) };
  }
  if (isTrialEligible(sub) && !(await customerHadSubscription(sub.stripeCustomerId))) {
    return { kind: "trial_days", days: TRAINER_TRIAL_DAYS };
  }
  return { kind: "none" };
}

export type TrainerCheckoutResult =
  | { ok: true; url: string }
  | { ok: false; status: number; error: string };

/**
 * One Stripe Checkout session for a trainer plan. Card is always collected;
 * the trial (if eligible) runs inside Stripe and converts to paid at its end.
 * Shared by POST /api/stripe/checkout, /start/trainer and onboarding.
 */
export async function createTrainerCheckoutSession(
  trainerId: string,
  tier: PlanTier
): Promise<TrainerCheckoutResult> {
  const sub = await prisma.trainerSubscription.findUnique({ where: { trainerId } });
  if (!sub) return { ok: false, status: 404, error: "Subscription record not found" };
  if (hasLiveTrainerSubscription(sub)) {
    return { ok: false, status: 409, error: "Already subscribed — change plans in the billing portal." };
  }

  let priceId: string;
  try {
    priceId = await resolveTierPriceId(tier);
  } catch (err) {
    console.error(`[trainer checkout] no Stripe price for ${tier}:`, err);
    return { ok: false, status: 503, error: "This plan isn't available right now. Please try again shortly." };
  }

  const trial = await trainerTrialPlan(sub);
  const metadata = { purchaseType: TRAINER_PURCHASE_TYPE, trainerId, plan: tier };
  const session = await stripe.checkout.sessions.create({
    customer: sub.stripeCustomerId,
    mode: "subscription",
    payment_method_collection: "always",
    line_items: [{ price: priceId, quantity: 1 }],
    metadata,
    subscription_data: {
      metadata,
      ...(trial.kind === "trial_days" ? { trial_period_days: trial.days } : {}),
      ...(trial.kind === "trial_end" ? { trial_end: trial.trialEnd } : {}),
      ...(trial.kind !== "none"
        ? { trial_settings: { end_behavior: { missing_payment_method: "cancel" as const } } }
        : {}),
    },
    success_url: `${appBaseUrl()}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appBaseUrl()}/billing/cancel`,
  });
  if (!session.url) return { ok: false, status: 500, error: "Checkout session URL unavailable" };
  return { ok: true, url: session.url };
}
