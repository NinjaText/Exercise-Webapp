import { isValidTier, type PlanTier } from "@/lib/stripe-config";

/**
 * Carries the trainer plan chosen on the marketing site across Clerk sign-up
 * (whose forceRedirectUrl is fixed to /onboarding) and onboarding, so the
 * trainer lands straight in Stripe Checkout for that plan.
 */
export const START_PLAN_COOKIE = "mia_start_plan";
export const START_PLAN_MAX_AGE_S = 60 * 60;

export function parseStartPlan(raw: string | null | undefined): PlanTier | null {
  const v = raw?.trim().toUpperCase();
  return v && isValidTier(v) ? v : null;
}

export const startPlanCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: START_PLAN_MAX_AGE_S,
};
