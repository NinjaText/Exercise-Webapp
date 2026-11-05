import { describe, it, expect, vi, beforeEach } from "vitest";

const list = vi.fn();
vi.mock("@/lib/stripe", () => ({ stripe: { prices: { list: (a: unknown) => list(a) } } }));

import { resolveTierPriceId, clearTierPriceCache, TierPriceMissingError } from "../tier-price";
import { tierFromPrice, TIER_CONFIG } from "@/lib/stripe-config";

describe("resolveTierPriceId", () => {
  beforeEach(() => {
    clearTierPriceCache();
    list.mockReset();
  });

  it("asks Stripe for the active price with the plan's lookup key", async () => {
    list.mockResolvedValue({ data: [{ id: "price_growth" }] });
    await expect(resolveTierPriceId("PRO")).resolves.toBe("price_growth");
    expect(list).toHaveBeenCalledWith({ lookup_keys: ["mia_trainer_growth_monthly_v2"], active: true, limit: 1 });
  });

  it("caches for a few minutes, then looks up again (picks up a moved key)", async () => {
    list.mockResolvedValueOnce({ data: [{ id: "price_old" }] }).mockResolvedValueOnce({ data: [{ id: "price_new" }] });
    await resolveTierPriceId("STARTER", 0);
    await expect(resolveTierPriceId("STARTER", 60_000)).resolves.toBe("price_old");
    await expect(resolveTierPriceId("STARTER", 6 * 60_000)).resolves.toBe("price_new");
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("throws a clear error when the Stripe account has no such price", async () => {
    list.mockResolvedValue({ data: [] });
    await expect(resolveTierPriceId("UNLIMITED")).rejects.toBeInstanceOf(TierPriceMissingError);
  });
});

describe("tierFromPrice", () => {
  it("maps each plan's lookup key back to its tier", () => {
    for (const tier of ["STARTER", "PRO", "UNLIMITED"] as const) {
      expect(tierFromPrice({ lookup_key: TIER_CONFIG[tier].lookupKey })).toBe(tier);
    }
  });
  it("returns null for prices without one of our keys (old prices keep the stored plan)", () => {
    expect(tierFromPrice({ lookup_key: null })).toBeNull();
    expect(tierFromPrice({ lookup_key: "someone_else" })).toBeNull();
    expect(tierFromPrice(null)).toBeNull();
  });
});
