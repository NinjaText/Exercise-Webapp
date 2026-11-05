import type { SubStatus } from "@prisma/client";

/**
 * The billing-gate rules, shared by trainers (TrainerSubscription) and club
 * members (MemberSubscription).
 *
 * - "checkout_required": the account never started a plan (fresh trainer, or
 *   a member of a card-required club). Their trial happens inside Stripe
 *   Checkout, so /billing asks them to choose a plan — never "trial ended".
 * - "trial_expired": a card-less (legacy/local) trial ran out, or the
 *   subscription ended.
 * - "payment_failed": PAST_DUE / UNPAID.
 */
export type AccessVerdict = "ok" | "trial_expired" | "payment_failed" | "checkout_required";

/**
 * `trialEndsAt` sentinel for a row that has never had a local (card-less)
 * trial: the account must go through Stripe Checkout before getting access.
 * The column is required, so "no trial yet" is stored as the epoch. Once a
 * Stripe subscription syncs, `trialEndsAt` becomes Stripe's `trial_end`.
 */
export const NO_LOCAL_TRIAL = new Date(0);

type SubLike = { status: SubStatus; trialEndsAt: Date } | null;
type StripeSubLike = { status: SubStatus; trialEndsAt: Date; stripeSubscriptionId: string | null } | null;

/** A row that has never been through checkout and never had a local trial. */
export function awaitingFirstCheckout(sub: StripeSubLike): boolean {
  return (
    sub !== null &&
    sub.status === "TRIALING" &&
    !sub.stripeSubscriptionId &&
    sub.trialEndsAt.getTime() <= NO_LOCAL_TRIAL.getTime()
  );
}

export function evaluateAccess(sub: SubLike, now: Date): AccessVerdict {
  if (!sub || sub.status === "CANCELED") return "trial_expired";
  if (sub.status === "TRIALING" && sub.trialEndsAt < now) return "trial_expired";
  if (sub.status === "PAST_DUE" || sub.status === "UNPAID") return "payment_failed";
  return "ok";
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function trialDaysLeft(sub: SubLike, now: Date): number | null {
  if (!sub || sub.status !== "TRIALING" || sub.trialEndsAt < now) return null;
  return Math.ceil((sub.trialEndsAt.getTime() - now.getTime()) / DAY_MS);
}

/**
 * A subscription that is trialing in Stripe (card on file): Stripe starts
 * billing at `trialEndsAt`. Members get here by subscribing during a local
 * trial or through a card-required club; trainers through every new checkout.
 */
export function hasScheduledSubscription(sub: StripeSubLike): boolean {
  return sub?.status === "TRIALING" && Boolean(sub.stripeSubscriptionId);
}

/**
 * Member gate: the shared rule, except a scheduled subscription keeps access
 * past `trialEndsAt` until Stripe's trial-conversion webhook lands (it then
 * becomes ACTIVE, or PAST_DUE if the first charge fails).
 */
export function evaluateMemberAccess(sub: StripeSubLike, now: Date): AccessVerdict {
  if (awaitingFirstCheckout(sub)) return "checkout_required";
  return hasScheduledSubscription(sub) ? "ok" : evaluateAccess(sub, now);
}

/**
 * Trainer gate. Same rule as members: a Stripe-trialing subscription keeps
 * access across the trial→paid webhook lag, a fresh trainer must check out,
 * and an old card-less trial (TRIALING, no Stripe subscription, future
 * `trialEndsAt`) is grandfathered until it ends.
 */
export function evaluateTrainerAccess(sub: StripeSubLike, now: Date): AccessVerdict {
  return evaluateMemberAccess(sub, now);
}

/** Days for the "N days left — Subscribe" banner; null once they've subscribed. */
export function memberTrialBannerDays(sub: StripeSubLike, now: Date): number | null {
  return hasScheduledSubscription(sub) ? null : trialDaysLeft(sub, now);
}

type TrialOnceLike = {
  status: SubStatus;
  trialEndsAt: Date;
  stripeSubscriptionId: string | null;
  trialUsedAt?: Date | null;
};

/**
 * One free trial per account. Eligible only when the row has never had a
 * trial of any kind: no Stripe trial recorded, no Stripe subscription ever
 * (stripeSubscriptionId is never cleared on cancel), and no old card-less
 * local trial (those rows have a real `trialEndsAt`, not NO_LOCAL_TRIAL).
 * Callers should additionally check Stripe for earlier subscriptions on the
 * same customer.
 */
export function isTrialEligible(sub: TrialOnceLike): boolean {
  if (sub.trialUsedAt) return false;
  if (sub.stripeSubscriptionId) return false;
  return sub.trialEndsAt.getTime() <= NO_LOCAL_TRIAL.getTime();
}
