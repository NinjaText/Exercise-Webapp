import type { PlanTier } from "@prisma/client";
import { DEFAULT_TIER_ALLOWANCES, type UnlimitedReason } from "./config";

export interface AllowanceOverride {
  customMonthlyTokens: number | null;
  unlimited: boolean;
}

export interface AllowanceInput {
  tier: PlanTier;
  /** Admin-edited per-tier values; missing tiers fall back to the placeholder defaults. */
  tierAllowances?: Partial<Record<PlanTier, number>>;
  override?: AllowanceOverride | null;
  /** Bonus granted for the current cycle only. */
  bonusTokens?: number;
  /** Set when the account is unlimited for a reason outside the override (exempt, club…). */
  unlimitedReason?: UnlimitedReason | null;
}

export interface ResolvedAllowance {
  /** Tier or custom allowance before the bonus; null = unlimited. */
  base: number | null;
  /** base + bonus; null = unlimited. */
  total: number | null;
  unlimitedReason: UnlimitedReason | null;
  source: "tier" | "custom" | "unlimited";
}

/** Pure allowance resolution: unlimited reason > override unlimited > custom limit > tier. */
export function resolveAllowance(input: AllowanceInput): ResolvedAllowance {
  const bonus = Math.max(0, input.bonusTokens ?? 0);
  if (input.unlimitedReason) return { base: null, total: null, unlimitedReason: input.unlimitedReason, source: "unlimited" };
  if (input.override?.unlimited) return { base: null, total: null, unlimitedReason: "override", source: "unlimited" };
  const custom = input.override?.customMonthlyTokens;
  if (custom !== null && custom !== undefined) {
    return { base: custom, total: custom + bonus, unlimitedReason: null, source: "custom" };
  }
  const base = input.tierAllowances?.[input.tier] ?? DEFAULT_TIER_ALLOWANCES[input.tier];
  return { base, total: base + bonus, unlimitedReason: null, source: "tier" };
}

/** Remaining tokens; null = unlimited. Never negative. */
export function remainingTokens(total: number | null, used: number): number | null {
  return total === null ? null : Math.max(0, total - used);
}

/** True when a new call must be refused. */
export function isExhausted(total: number | null, used: number): boolean {
  return total !== null && used >= total;
}
