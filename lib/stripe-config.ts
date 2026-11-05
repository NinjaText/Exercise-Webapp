/**
 * Trainer plans. The PlanTier enum keys are stored on existing
 * TrainerSubscription rows, so they never change; only the labels do:
 *   STARTER → "Starter" (1–10 clients), PRO → "Growth" (11–30),
 *   UNLIMITED → "Pro" (31–150).
 */
export type PlanTier = "STARTER" | "PRO" | "UNLIMITED";

export interface TierConfig {
  label: string;
  priceInCents: number;
  /** Max active clients (including pending invitations); null = no cap. */
  clientLimit: number | null;
  description: string;
  /**
   * Stripe price lookup key. Checkout asks Stripe for the active price with
   * this key (lib/billing/tier-price.ts), so no price ids live in env vars.
   * To reprice: create the new price in Stripe and move the lookup key to it
   * (scripts/create-stripe-prices.ts does this). Subscribers on older prices
   * keep paying them; their stored plan is kept (see tierFromPrice).
   */
  lookupKey: string;
}

/** Every trainer and card-required club trial: collected in Stripe Checkout. */
export const TRAINER_TRIAL_DAYS = 7;

/** Default club member trial length when a club has none set. */
export const DEFAULT_CLUB_TRIAL_DAYS = 7;

export const TIER_CONFIG: Record<PlanTier, TierConfig> = {
  STARTER: {
    label: "Starter",
    priceInCents: 3999,
    clientLimit: 10,
    description: "Up to 10 active clients",
    lookupKey: "mia_trainer_starter_monthly_v2",
  },
  PRO: {
    label: "Growth",
    priceInCents: 7999,
    clientLimit: 30,
    description: "Up to 30 active clients",
    lookupKey: "mia_trainer_growth_monthly_v2",
  },
  UNLIMITED: {
    label: "Pro",
    priceInCents: 19700,
    clientLimit: 150,
    description: "Up to 150 active clients",
    lookupKey: "mia_trainer_pro_monthly_v2",
  },
};

export const VALID_TIERS: PlanTier[] = ["STARTER", "PRO", "UNLIMITED"];

export function isValidTier(t: string): t is PlanTier {
  return VALID_TIERS.includes(t as PlanTier);
}

/**
 * A subscription's price → tier, by the price's lookup key. Null for prices
 * without one of our keys (e.g. pre-2026-11 prices): callers keep the plan
 * already stored on the row, which was set when that subscriber signed up.
 */
export function tierFromPrice(price: { lookup_key?: string | null } | null | undefined): PlanTier | null {
  const key = price?.lookup_key;
  if (!key) return null;
  for (const [tier, config] of Object.entries(TIER_CONFIG) as [PlanTier, TierConfig][]) {
    if (config.lookupKey === key) return tier;
  }
  return null;
}

/** "$39.99" / "$197" */
export function formatTierPrice(cents: number): string {
  return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
}
