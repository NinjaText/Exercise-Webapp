/**
 * Pure commission math. No I/O — everything that decides how much a
 * contractor earns lives here so it can be unit-tested exhaustively.
 */
import type {
  CommissionPlan,
  CommissionType,
  Referral,
  ReferralSubscriberType,
  RetentionScope,
} from "@prisma/client";

export const MAX_FIXED_CENTS = 10_000_00; // $10,000
export const MAX_PERCENT_BP = 10_000; // 100%
export const MAX_RETENTION_COUNT = 1_000;
export const MAX_RETENTION_MONTHS = 36;

export type PlanTerms = Pick<
  CommissionPlan,
  | "trainerCommissionType"
  | "trainerCommissionValue"
  | "individualCommissionType"
  | "individualCommissionValue"
  | "retentionBonusCents"
  | "retentionRequiredCount"
  | "retentionMonths"
  | "retentionScope"
>;

/** The terms copied onto a Referral when it is attributed. */
export interface TermsSnapshot {
  planId: string | null;
  planName: string | null;
  commissionType: CommissionType;
  commissionValue: number;
  retentionBonusCents: number;
  retentionRequiredCount: number;
  retentionMonths: number;
}

export function hasRetentionBonus(t: Pick<PlanTerms, "retentionBonusCents" | "retentionRequiredCount" | "retentionMonths">): boolean {
  return t.retentionBonusCents > 0 && t.retentionRequiredCount > 0 && t.retentionMonths > 0;
}

function scopeCovers(scope: RetentionScope, type: ReferralSubscriberType): boolean {
  return scope === "ALL" || (scope === "TRAINERS" ? type === "TRAINER" : type === "INDIVIDUAL");
}

/**
 * Freezes the plan's terms for one referral. A contractor with no plan still
 * gets referrals tracked, at zero commission.
 */
export function snapshotTerms(
  plan: (PlanTerms & { id: string; name: string }) | null,
  type: ReferralSubscriberType
): TermsSnapshot {
  if (!plan) {
    return {
      planId: null,
      planName: null,
      commissionType: "NONE",
      commissionValue: 0,
      retentionBonusCents: 0,
      retentionRequiredCount: 0,
      retentionMonths: 0,
    };
  }
  const commissionType = type === "TRAINER" ? plan.trainerCommissionType : plan.individualCommissionType;
  const commissionValue = type === "TRAINER" ? plan.trainerCommissionValue : plan.individualCommissionValue;
  const retention = hasRetentionBonus(plan) && scopeCovers(plan.retentionScope, type);
  return {
    planId: plan.id,
    planName: plan.name,
    commissionType,
    commissionValue: commissionType === "NONE" ? 0 : commissionValue,
    retentionBonusCents: retention ? plan.retentionBonusCents : 0,
    retentionRequiredCount: retention ? plan.retentionRequiredCount : 0,
    retentionMonths: retention ? plan.retentionMonths : 0,
  };
}

/** Signup commission for a first paid invoice of `paidCents`. Rounded half-up to the cent. */
export function signupCommissionCents(
  terms: Pick<TermsSnapshot, "commissionType" | "commissionValue">,
  paidCents: number
): number {
  if (paidCents <= 0) return 0;
  switch (terms.commissionType) {
    case "FIXED":
      return Math.max(0, terms.commissionValue);
    case "PERCENT":
      return Math.round((paidCents * Math.max(0, terms.commissionValue)) / 10_000);
    default:
      return 0;
  }
}

/** Adds calendar months in UTC, clamping to the month's last day (Jan 31 + 1 → Feb 28/29). */
export function addMonthsUTC(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

/** When a converted referral becomes eligible for the retention check, or null if it never does. */
export function retentionDueAt(
  r: Pick<Referral, "retentionStartAt" | "retentionMonths" | "retentionBonusCents" | "retentionRequiredCount">
): Date | null {
  if (!r.retentionStartAt || !hasRetentionBonus(r)) return null;
  return addMonthsUTC(r.retentionStartAt, r.retentionMonths);
}

/** Referrals with identical retention terms pool together; different terms never mix. */
export function retentionGroupKey(
  r: Pick<Referral, "retentionBonusCents" | "retentionRequiredCount" | "retentionMonths">
): string {
  return `${r.retentionBonusCents}:${r.retentionRequiredCount}:${r.retentionMonths}`;
}

export interface BonusAward<R> {
  groupKey: string;
  bonusCents: number;
  referrals: R[];
}

/**
 * Splits retained, not-yet-bonused referrals into full bonus groups. Oldest
 * qualifiers go first, so repeated runs over the same data choose the same
 * groups (which makes the bonus idempotency key stable).
 */
export function planRetentionBonuses<
  R extends Pick<Referral, "id" | "retainedAt" | "retentionBonusCents" | "retentionRequiredCount" | "retentionMonths">,
>(retained: R[]): BonusAward<R>[] {
  const groups = new Map<string, R[]>();
  for (const r of retained) {
    if (!r.retainedAt || !hasRetentionBonus(r)) continue;
    const key = retentionGroupKey(r);
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const awards: BonusAward<R>[] = [];
  for (const [groupKey, list] of groups) {
    const sorted = [...list].sort(
      (a, b) => a.retainedAt!.getTime() - b.retainedAt!.getTime() || a.id.localeCompare(b.id)
    );
    const size = sorted[0].retentionRequiredCount;
    for (let i = 0; i + size <= sorted.length; i += size) {
      awards.push({ groupKey, bonusCents: sorted[0].retentionBonusCents, referrals: sorted.slice(i, i + size) });
    }
  }
  return awards;
}

export function retentionBonusSourceKey(contractorId: string, referralIds: string[]): string {
  return `retention:${contractorId}:${[...referralIds].sort().join(",")}`;
}

// ── Display ──────────────────────────────────────────────────────────────

export function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function formatBasisPoints(bp: number): string {
  return `${Number((bp / 100).toFixed(2))}%`;
}

export function describeCommission(type: CommissionType, value: number): string {
  switch (type) {
    case "FIXED":
      return `${formatCents(value)} per paying subscriber`;
    case "PERCENT":
      return `${formatBasisPoints(value)} of first payment`;
    default:
      return "No signup commission";
  }
}

const SCOPE_NOUN: Record<RetentionScope, [string, string]> = {
  TRAINERS: ["trainer", "trainers"],
  INDIVIDUALS: ["individual", "individuals"],
  ALL: ["subscriber", "subscribers"],
};

export function describeRetention(
  t: Pick<PlanTerms, "retentionBonusCents" | "retentionRequiredCount" | "retentionMonths"> & {
    retentionScope?: RetentionScope;
  }
): string {
  if (!hasRetentionBonus(t)) return "No retention bonus";
  const [one, many] = SCOPE_NOUN[t.retentionScope ?? "ALL"];
  const who = t.retentionRequiredCount === 1 ? one : `${t.retentionRequiredCount} ${many}`;
  const months = t.retentionMonths === 1 ? "1 month" : `${t.retentionMonths} months`;
  return `${formatCents(t.retentionBonusCents)} for every ${who} retained ${months}`;
}
