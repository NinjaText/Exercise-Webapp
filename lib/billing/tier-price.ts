import { stripe } from "@/lib/stripe";
import { TIER_CONFIG, type PlanTier } from "@/lib/stripe-config";

/**
 * Trainer plan → current Stripe price id, looked up in Stripe by the plan's
 * lookup key (TIER_CONFIG[tier].lookupKey). No price ids in env vars: moving
 * a lookup key to a new price in Stripe reprices new checkouts.
 *
 * Cached per server instance for a few minutes so checkout doesn't add a
 * Stripe round-trip every time; a moved key is picked up within the TTL.
 */
const TTL_MS = 5 * 60 * 1000;
const cache = new Map<PlanTier, { priceId: string; at: number }>();

export class TierPriceMissingError extends Error {
  constructor(tier: PlanTier, lookupKey: string) {
    super(
      `No active Stripe price with lookup key "${lookupKey}" for plan ${tier}. ` +
        "Run scripts/create-stripe-prices.ts against this Stripe account.",
    );
    this.name = "TierPriceMissingError";
  }
}

export async function resolveTierPriceId(tier: PlanTier, now = Date.now()): Promise<string> {
  const hit = cache.get(tier);
  if (hit && now - hit.at < TTL_MS) return hit.priceId;

  const lookupKey = TIER_CONFIG[tier].lookupKey;
  const { data } = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
  const price = data[0];
  if (!price) throw new TierPriceMissingError(tier, lookupKey);

  cache.set(tier, { priceId: price.id, at: now });
  return price.id;
}

/** Tests only. */
export function clearTierPriceCache(): void {
  cache.clear();
}
