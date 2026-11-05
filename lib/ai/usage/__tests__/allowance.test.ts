import { describe, it, expect } from "vitest";
import { resolveAllowance, remainingTokens, isExhausted } from "../allowance";
import { DEFAULT_TIER_ALLOWANCES } from "../config";

describe("resolveAllowance", () => {
  it("uses the placeholder default per tier when no admin value exists", () => {
    for (const tier of ["STARTER", "PRO", "UNLIMITED"] as const) {
      expect(resolveAllowance({ tier }).total).toBe(DEFAULT_TIER_ALLOWANCES[tier]);
    }
    expect(DEFAULT_TIER_ALLOWANCES.STARTER).toBeLessThan(DEFAULT_TIER_ALLOWANCES.PRO);
    expect(DEFAULT_TIER_ALLOWANCES.PRO).toBeLessThan(DEFAULT_TIER_ALLOWANCES.UNLIMITED);
  });

  it("prefers the admin-edited tier value", () => {
    expect(resolveAllowance({ tier: "PRO", tierAllowances: { PRO: 42 } })).toMatchObject({ base: 42, total: 42, source: "tier" });
  });

  it("adds this cycle's bonus on top", () => {
    expect(resolveAllowance({ tier: "STARTER", tierAllowances: { STARTER: 100 }, bonusTokens: 50 }).total).toBe(150);
  });

  it("a custom per-trainer limit replaces the tier (bonus still applies)", () => {
    const r = resolveAllowance({
      tier: "STARTER",
      tierAllowances: { STARTER: 100 },
      override: { customMonthlyTokens: 7, unlimited: false },
      bonusTokens: 3,
    });
    expect(r).toMatchObject({ base: 7, total: 10, source: "custom" });
  });

  it("a custom limit of 0 blocks everything", () => {
    const r = resolveAllowance({ tier: "PRO", override: { customMonthlyTokens: 0, unlimited: false } });
    expect(isExhausted(r.total, 0)).toBe(true);
  });

  it("unlimited override and unlimited reasons yield null totals", () => {
    expect(resolveAllowance({ tier: "STARTER", override: { customMonthlyTokens: 5, unlimited: true } })).toMatchObject({
      total: null,
      unlimitedReason: "override",
    });
    expect(resolveAllowance({ tier: "STARTER", unlimitedReason: "club" })).toMatchObject({ total: null, unlimitedReason: "club" });
  });
});

describe("remainingTokens / isExhausted", () => {
  it("handles limited and unlimited totals", () => {
    expect(remainingTokens(100, 30)).toBe(70);
    expect(remainingTokens(100, 130)).toBe(0);
    expect(remainingTokens(null, 999)).toBeNull();
    expect(isExhausted(100, 100)).toBe(true);
    expect(isExhausted(100, 99)).toBe(false);
    expect(isExhausted(null, 10 ** 9)).toBe(false);
  });
});
