import type { SubStatus } from "@prisma/client";

/**
 * The one billing-gate rule, shared by trainers (TrainerSubscription) and club
 * members (MemberSubscription). Extracted verbatim from the original trainer
 * gate in app/(platform)/layout.tsx so both stay identical.
 */
export type AccessVerdict = "ok" | "trial_expired" | "payment_failed";

type SubLike = { status: SubStatus; trialEndsAt: Date } | null;

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

type MemberSubLike = { status: SubStatus; trialEndsAt: Date; stripeSubscriptionId: string | null } | null;

/**
 * A member who subscribed during their trial: checkout kept the rest of the
 * trial, and Stripe starts billing at `trialEndsAt`. Member-only — trainer
 * billing never creates this state.
 */
export function hasScheduledSubscription(sub: MemberSubLike): boolean {
  return sub?.status === "TRIALING" && Boolean(sub.stripeSubscriptionId);
}

/**
 * Member gate: the shared rule, except a scheduled subscription keeps access
 * past `trialEndsAt` until Stripe's trial-conversion webhook lands (it then
 * becomes ACTIVE, or PAST_DUE if the first charge fails).
 */
export function evaluateMemberAccess(sub: MemberSubLike, now: Date): AccessVerdict {
  return hasScheduledSubscription(sub) ? "ok" : evaluateAccess(sub, now);
}

/** Days for the "N days left — Subscribe" banner; null once they've subscribed. */
export function memberTrialBannerDays(sub: MemberSubLike, now: Date): number | null {
  return hasScheduledSubscription(sub) ? null : trialDaysLeft(sub, now);
}
