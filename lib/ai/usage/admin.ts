import type { PlanTier } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getOrgType } from "@/lib/org-capabilities";
import { isBillingExempt } from "@/lib/billing/exempt";
import { computeCycleWindow, calendarMonthWindow, type CycleWindow } from "./cycle";
import { resolveAllowance, remainingTokens, type ResolvedAllowance } from "./allowance";
import { DEFAULT_TIER_ALLOWANCES, MAX_TOKEN_SETTING, SYSTEM_ACCOUNT_KEY, type UnlimitedReason } from "./config";
import { getTierAllowanceMap, incrementPeriod } from "./service";

const TIERS: PlanTier[] = ["STARTER", "PRO", "UNLIMITED"];

export interface TierAllowanceRow {
  tier: PlanTier;
  monthlyTokens: number;
  isDefault: boolean;
}

export async function listTierAllowances(): Promise<TierAllowanceRow[]> {
  const map = await getTierAllowanceMap();
  return TIERS.map((tier) => ({
    tier,
    monthlyTokens: map[tier] ?? DEFAULT_TIER_ALLOWANCES[tier],
    isDefault: map[tier] === undefined,
  }));
}

export interface TrainerUsageRow {
  userId: string;
  name: string;
  email: string;
  tier: PlanTier;
  subStatus: string | null;
  window: CycleWindow;
  used: number;
  requestCount: number;
  bonusTokens: number;
  allowance: ResolvedAllowance;
  remaining: number | null;
  override: { customMonthlyTokens: number | null; unlimited: boolean; note: string | null } | null;
}

/**
 * Every trainer with their current-cycle usage. A handful of bulk queries:
 * trainers, subs, overrides, orgs, and the period docs still open.
 */
export async function listTrainerUsage(now: Date = new Date()): Promise<TrainerUsageRow[]> {
  const trainers = await prisma.user.findMany({
    where: { role: "TRAINER" },
    select: { id: true, firstName: true, lastName: true, email: true, clerkOrgId: true },
    orderBy: { createdAt: "desc" },
  });
  const ids = trainers.map((t) => t.id);
  const orgIds = [...new Set(trainers.map((t) => t.clerkOrgId).filter((x): x is string => Boolean(x)))];

  const [subs, overrides, orgs, periods, tierAllowances] = await Promise.all([
    prisma.trainerSubscription.findMany({
      where: { trainerId: { in: ids } },
      select: { trainerId: true, plan: true, status: true, currentPeriodEnd: true },
    }),
    prisma.aiUsageOverride.findMany({ where: { userId: { in: ids } } }),
    prisma.organization.findMany({ where: { clerkOrgId: { in: orgIds } }, select: { clerkOrgId: true, type: true } }),
    prisma.aiUsagePeriod.findMany({ where: { accountKey: { in: ids }, periodEnd: { gt: now } } }),
    getTierAllowanceMap(),
  ]);
  const subBy = new Map(subs.map((s) => [s.trainerId, s]));
  const overrideBy = new Map(overrides.map((o) => [o.userId, o]));
  const orgTypeBy = new Map(orgs.map((o) => [o.clerkOrgId, getOrgType(o)]));

  return trainers.map((t) => {
    const sub = subBy.get(t.id) ?? null;
    const override = overrideBy.get(t.id) ?? null;
    const tier: PlanTier = sub?.plan ?? "STARTER";
    const window = computeCycleWindow(sub, now);
    const period = periods.find((p) => p.accountKey === t.id && p.periodStart.getTime() === window.start.getTime());
    const used = period?.totalTokens ?? 0;
    const bonusTokens = period?.bonusTokens ?? 0;
    let unlimitedReason: UnlimitedReason | null = null;
    if (t.clerkOrgId && orgTypeBy.get(t.clerkOrgId) === "CLUB") unlimitedReason = "club";
    else if (isBillingExempt(t)) unlimitedReason = "billing_exempt";
    const allowance = resolveAllowance({ tier, tierAllowances, override, bonusTokens, unlimitedReason });
    return {
      userId: t.id,
      name: `${t.firstName} ${t.lastName}`.trim() || t.email,
      email: t.email,
      tier,
      subStatus: sub?.status ?? null,
      window,
      used,
      requestCount: period?.requestCount ?? 0,
      bonusTokens,
      allowance,
      remaining: remainingTokens(allowance.total, used),
      override: override
        ? { customMonthlyTokens: override.customMonthlyTokens, unlimited: override.unlimited, note: override.note }
        : null,
    };
  });
}

export async function getSystemUsage(now: Date = new Date()) {
  const window = calendarMonthWindow(now);
  const period = await prisma.aiUsagePeriod.findUnique({
    where: { accountKey_periodStart: { accountKey: SYSTEM_ACCOUNT_KEY, periodStart: window.start } },
  });
  return { window, used: period?.totalTokens ?? 0, requestCount: period?.requestCount ?? 0 };
}

export async function listRecentUsageEvents(limit = 50) {
  return prisma.aiUsageEvent.findMany({ orderBy: { createdAt: "desc" }, take: limit });
}

export function validateTokenSetting(value: number): string | null {
  if (!Number.isInteger(value) || value < 0) return "Enter a whole number of tokens (0 or more).";
  if (value > MAX_TOKEN_SETTING) return `Maximum is ${MAX_TOKEN_SETTING.toLocaleString("en-US")} tokens.`;
  return null;
}

export async function setTierAllowance(tier: PlanTier, monthlyTokens: number, adminId: string): Promise<void> {
  await prisma.aiTierAllowance.upsert({
    where: { tier },
    create: { tier, monthlyTokens, updatedById: adminId },
    update: { monthlyTokens, updatedById: adminId },
  });
}

export async function setUsageOverride(
  userId: string,
  input: { customMonthlyTokens: number | null; unlimited: boolean; note: string | null },
  adminId: string
): Promise<void> {
  if (input.customMonthlyTokens === null && !input.unlimited && !input.note) {
    await prisma.aiUsageOverride.deleteMany({ where: { userId } });
    return;
  }
  await prisma.aiUsageOverride.upsert({
    where: { userId },
    create: { userId, ...input, updatedById: adminId },
    update: { ...input, updatedById: adminId },
  });
}

/** Adds bonus tokens to the trainer's current cycle only (expires at reset). */
export async function grantBonusTokens(userId: string, tokens: number, now: Date = new Date()): Promise<CycleWindow> {
  const sub = await prisma.trainerSubscription.findUnique({
    where: { trainerId: userId },
    select: { currentPeriodEnd: true },
  });
  const window = computeCycleWindow(sub, now);
  await incrementPeriod(userId, window, { bonusTokens: tokens });
  return window;
}
