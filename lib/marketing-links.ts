/**
 * Every outbound CTA destination on the public marketing site lives here, so
 * no page hard-codes a URL that later goes stale.
 */

/**
 * Sharon's public Calendly booking link (club consultations + Individual
 * Advanced inquiries). Until NEXT_PUBLIC_CALENDLY_URL is set, CTAs fall back
 * to an email so they're never broken.
 */
export const CALENDLY_URL =
  process.env.NEXT_PUBLIC_CALENDLY_URL ||
  "mailto:hello@miaperformance.com?subject=MIA%20Performance%20consultation";

/** "Start your free trial" on marketing pages → audience selection. */
export const GET_STARTED_HREF = "/get-started";

/** Dedicated pricing page; `tab` preselects Clubs | Trainers | Individuals. */
export type PricingTab = "clubs" | "trainers" | "individuals";
const PRICING_TABS: readonly PricingTab[] = ["clubs", "trainers", "individuals"];
export const DEFAULT_PRICING_TAB: PricingTab = "trainers";

/** `?tab=` value → a known tab (default trainers). Server- and client-safe. */
export function parsePricingTab(value: string | null | undefined): PricingTab {
  return PRICING_TABS.includes(value as PricingTab) ? (value as PricingTab) : DEFAULT_PRICING_TAB;
}
export function pricingHref(tab?: PricingTab): string {
  return tab ? `/pricing?tab=${tab}` : "/pricing";
}

/** Trainer tiers as stored in the PlanTier enum (labels: Starter / Growth / Pro). */
export type TrainerPlanKey = "STARTER" | "PRO" | "UNLIMITED";

/**
 * Starts a 7-day card-required trial on the given trainer tier: sign-up (if
 * needed) → onboarding → Stripe Checkout. Implemented by app/start/trainer.
 */
export function trainerTrialHref(plan: TrainerPlanKey): string {
  return `/start/trainer?plan=${plan}`;
}

/**
 * Starts the Individual Starter 7-day card-required trial: sign-up (if
 * needed) → joins the MIA Individuals club → Stripe Checkout. Implemented by
 * app/start/individual.
 */
export const INDIVIDUAL_TRIAL_HREF = "/start/individual";

/** True for links that leave the app (Calendly, mailto) — render as <a>, not <Link>. */
export function isExternalHref(href: string): boolean {
  return /^(https?:|mailto:)/.test(href);
}
