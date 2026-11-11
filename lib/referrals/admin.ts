/**
 * Super-admin reads and writes for /admin/referrals. Callers (server actions
 * and pages) do the requireSuperAdmin() check and the audit logging.
 */
import type { CommissionStatus, Prisma, Referral, ReferralStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { nullOrUnset } from "@/lib/db/mongo-null";
import { describeRetention, hasRetentionBonus, retentionDueAt, retentionGroupKey } from "./terms";
import { liveSubscriptions, type LiveSubscription } from "./sweep";

export class ReferralAdminError extends Error {}

// ── Balances ─────────────────────────────────────────────────────────────

export interface Balances {
  earnedCents: number; // unpaid + paid (void excluded)
  unpaidCents: number;
  paidCents: number;
}

const emptyBalances = (): Balances => ({ earnedCents: 0, unpaidCents: 0, paidCents: 0 });

function addToBalances(b: Balances, status: CommissionStatus, cents: number) {
  if (status === "VOID") return;
  b.earnedCents += cents;
  if (status === "UNPAID") b.unpaidCents += cents;
  else b.paidCents += cents;
}

export interface ReferralCounts {
  total: number;
  paying: number; // CONVERTED + RETAINED
  retained: number;
  churned: number;
  inRetentionWindow: number;
}

const emptyCounts = (): ReferralCounts => ({ total: 0, paying: 0, retained: 0, churned: 0, inRetentionWindow: 0 });

function addToCounts(c: ReferralCounts, status: ReferralStatus, n: number) {
  c.total += n;
  if (status === "CONVERTED" || status === "RETAINED") c.paying += n;
  if (status === "RETAINED") c.retained += n;
  if (status === "CHURNED") c.churned += n;
}

// ── Overview ─────────────────────────────────────────────────────────────

export interface ContractorRow {
  id: string;
  name: string;
  email: string;
  referralCode: string;
  isActive: boolean;
  linkClicks: number;
  planName: string | null;
  counts: ReferralCounts;
  balances: Balances;
}

export async function getReferralOverview() {
  const [contractors, referralGroups, commissionGroups, retentionWindow] = await Promise.all([
    prisma.contractor.findMany({ include: { plan: { select: { name: true } } }, orderBy: { name: "asc" } }),
    prisma.referral.groupBy({ by: ["contractorId", "status"], _count: { _all: true } }),
    prisma.commission.groupBy({ by: ["contractorId", "status"], _sum: { amountCents: true } }),
    prisma.referral.groupBy({
      by: ["contractorId"],
      where: { status: "CONVERTED", retentionBonusCents: { gt: 0 } },
      _count: { _all: true },
    }),
  ]);

  const counts = new Map<string, ReferralCounts>();
  const balances = new Map<string, Balances>();
  const totals = { counts: emptyCounts(), balances: emptyBalances() };

  for (const g of referralGroups) {
    const c = counts.get(g.contractorId) ?? emptyCounts();
    addToCounts(c, g.status, g._count._all);
    addToCounts(totals.counts, g.status, g._count._all);
    counts.set(g.contractorId, c);
  }
  for (const g of retentionWindow) {
    const c = counts.get(g.contractorId) ?? emptyCounts();
    c.inRetentionWindow = g._count._all;
    totals.counts.inRetentionWindow += g._count._all;
    counts.set(g.contractorId, c);
  }
  for (const g of commissionGroups) {
    const b = balances.get(g.contractorId) ?? emptyBalances();
    addToBalances(b, g.status, g._sum.amountCents ?? 0);
    addToBalances(totals.balances, g.status, g._sum.amountCents ?? 0);
    balances.set(g.contractorId, b);
  }

  const rows: ContractorRow[] = contractors.map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email,
    referralCode: c.referralCode,
    isActive: c.isActive,
    linkClicks: c.linkClicks,
    planName: c.plan?.name ?? null,
    counts: counts.get(c.id) ?? emptyCounts(),
    balances: balances.get(c.id) ?? emptyBalances(),
  }));
  return { rows, totals };
}

export async function listRecentCommissions(limit = 15) {
  return prisma.commission.findMany({
    orderBy: { earnedAt: "desc" },
    take: limit,
    include: { contractor: { select: { id: true, name: true } } },
  });
}

// ── Contractor detail ────────────────────────────────────────────────────

export interface RetentionProgress {
  key: string;
  label: string;
  required: number;
  bonusCents: number;
  /** Retained and waiting for the group to fill. */
  qualified: number;
  /** Paying, retention period still running. */
  inWindow: number;
  /** Earliest date one of the in-window referrals becomes eligible. */
  nextDueAt: Date | null;
  bonusesEarned: number;
}

export function retentionProgress(referrals: Referral[]): RetentionProgress[] {
  const groups = new Map<string, RetentionProgress & { bonusIds: Set<string> }>();
  for (const r of referrals) {
    if (!hasRetentionBonus(r)) continue;
    const key = retentionGroupKey(r);
    const g =
      groups.get(key) ??
      {
        key,
        label: describeRetention(r),
        required: r.retentionRequiredCount,
        bonusCents: r.retentionBonusCents,
        qualified: 0,
        inWindow: 0,
        nextDueAt: null,
        bonusesEarned: 0,
        bonusIds: new Set<string>(),
      };
    if (r.status === "RETAINED" && !r.retentionBonusId) g.qualified++;
    if (r.retentionBonusId) g.bonusIds.add(r.retentionBonusId);
    if (r.status === "CONVERTED") {
      g.inWindow++;
      const due = retentionDueAt(r);
      if (due && (!g.nextDueAt || due < g.nextDueAt)) g.nextDueAt = due;
    }
    groups.set(key, g);
  }
  return [...groups.values()].map(({ bonusIds, ...g }) => ({ ...g, bonusesEarned: bonusIds.size }));
}

export type ReferralWithLive = Referral & { live: LiveSubscription | null };

export async function getContractorDetail(id: string) {
  const contractor = await prisma.contractor.findUnique({ where: { id }, include: { plan: true } });
  if (!contractor) return null;
  const [referrals, commissions, payouts] = await Promise.all([
    prisma.referral.findMany({ where: { contractorId: id }, orderBy: { createdAt: "desc" } }),
    prisma.commission.findMany({ where: { contractorId: id }, orderBy: { earnedAt: "desc" } }),
    prisma.payout.findMany({ where: { contractorId: id }, orderBy: { paidAt: "desc" } }),
  ]);
  const live = await liveSubscriptions(referrals);
  const counts = emptyCounts();
  for (const r of referrals) addToCounts(counts, r.status, 1);
  counts.inRetentionWindow = referrals.filter((r) => r.status === "CONVERTED" && hasRetentionBonus(r)).length;
  const balances = emptyBalances();
  for (const c of commissions) addToBalances(balances, c.status, c.amountCents);

  return {
    contractor,
    referrals: referrals.map((r): ReferralWithLive => ({ ...r, live: live.get(r.referredUserId) ?? null })),
    commissions,
    payouts,
    counts,
    balances,
    retention: retentionProgress(referrals),
  };
}

// ── Plans ────────────────────────────────────────────────────────────────

export type PlanInput = Omit<
  Prisma.CommissionPlanUncheckedCreateInput,
  "id" | "createdAt" | "updatedAt" | "archivedAt" | "updatedById"
>;

export async function listPlans() {
  const [plans, usage] = await Promise.all([
    prisma.commissionPlan.findMany({ orderBy: [{ createdAt: "asc" }] }),
    prisma.contractor.groupBy({ by: ["planId"], _count: { _all: true } }),
  ]);
  const usedBy = new Map(usage.map((u) => [u.planId, u._count._all]));
  return plans.map((p) => ({ ...p, contractorCount: usedBy.get(p.id) ?? 0 }));
}

export async function createPlan(input: PlanInput, adminId: string) {
  return prisma.commissionPlan.create({ data: { ...input, updatedById: adminId, archivedAt: null } });
}

/** Only future referrals see the change: existing ones carry their own snapshot. */
export async function updatePlan(id: string, input: PlanInput, adminId: string) {
  return prisma.commissionPlan.update({ where: { id }, data: { ...input, updatedById: adminId } });
}

export async function setPlanArchived(id: string, archived: boolean, adminId: string) {
  return prisma.commissionPlan.update({
    where: { id },
    data: { archivedAt: archived ? new Date() : null, updatedById: adminId },
  });
}

// ── Contractors ──────────────────────────────────────────────────────────

export interface ContractorInput {
  name: string;
  email: string;
  phone: string | null;
  notes: string | null;
  referralCode: string;
  planId: string | null;
  isActive: boolean;
}

async function assertPlanAssignable(planId: string | null, currentPlanId?: string | null) {
  if (!planId) return;
  const plan = await prisma.commissionPlan.findUnique({ where: { id: planId }, select: { archivedAt: true } });
  if (!plan) throw new ReferralAdminError("That commission plan no longer exists.");
  // An archived plan can stay on a contractor who already has it, but isn't handed out anew.
  if (plan.archivedAt && planId !== currentPlanId) throw new ReferralAdminError("That plan is archived.");
}

function uniqueConflict(err: unknown): ReferralAdminError | null {
  if ((err as { code?: string }).code !== "P2002") return null;
  const target = String((err as { meta?: { target?: unknown } }).meta?.target ?? "");
  return new ReferralAdminError(
    target.includes("email") ? "Another contractor already uses that email." : "That referral code is already taken."
  );
}

export async function createContractor(input: ContractorInput) {
  await assertPlanAssignable(input.planId);
  try {
    return await prisma.contractor.create({ data: input });
  } catch (err) {
    throw uniqueConflict(err) ?? err;
  }
}

export async function updateContractor(id: string, input: ContractorInput) {
  const current = await prisma.contractor.findUnique({ where: { id }, select: { planId: true } });
  if (!current) throw new ReferralAdminError("Contractor not found.");
  await assertPlanAssignable(input.planId, current.planId);
  try {
    return await prisma.contractor.update({ where: { id }, data: input });
  } catch (err) {
    throw uniqueConflict(err) ?? err;
  }
}

/** Only a contractor with no history can be deleted; otherwise deactivate. */
export async function deleteContractor(id: string) {
  const [referrals, commissions, payouts] = await Promise.all([
    prisma.referral.count({ where: { contractorId: id } }),
    prisma.commission.count({ where: { contractorId: id } }),
    prisma.payout.count({ where: { contractorId: id } }),
  ]);
  if (referrals + commissions + payouts > 0) {
    throw new ReferralAdminError("This contractor has referral history. Deactivate them instead.");
  }
  return prisma.contractor.delete({ where: { id } });
}

// ── Commissions ──────────────────────────────────────────────────────────

export async function voidCommission(id: string, reason: string) {
  const { count } = await prisma.commission.updateMany({
    where: { id, status: "UNPAID" },
    data: { status: "VOID", voidedAt: new Date(), voidReason: reason },
  });
  if (count === 0) throw new ReferralAdminError("Only unpaid commissions can be voided. Reverse the payout first.");
  return prisma.commission.findUniqueOrThrow({ where: { id } });
}

export async function addAdjustment(contractorId: string, amountCents: number, description: string, adminId: string) {
  if (amountCents === 0) throw new ReferralAdminError("Enter a non-zero amount.");
  const exists = await prisma.contractor.findUnique({ where: { id: contractorId }, select: { id: true } });
  if (!exists) throw new ReferralAdminError("Contractor not found.");
  return prisma.commission.create({
    data: {
      contractorId,
      kind: "ADJUSTMENT",
      status: "UNPAID",
      amountCents,
      currency: "usd",
      description,
      sourceKey: `adjustment:${crypto.randomUUID()}`,
      referralIds: [],
      createdById: adminId,
      payoutId: null,
      paidAt: null,
      voidedAt: null,
    },
  });
}

// ── Payouts ──────────────────────────────────────────────────────────────

export interface PayoutInput {
  contractorId: string;
  commissionIds: string[];
  method: string;
  reference: string | null;
  note: string | null;
  paidAt: Date;
}

/**
 * Marks the chosen unpaid commissions paid under one payout. If any of them
 * changed since the admin loaded the page (paid/voided elsewhere) nothing is
 * kept and the admin is asked to refresh.
 */
export async function recordPayout(input: PayoutInput, adminId: string) {
  const ids = [...new Set(input.commissionIds)];
  if (ids.length === 0) throw new ReferralAdminError("Select at least one commission.");
  const selected = await prisma.commission.findMany({
    where: { id: { in: ids }, contractorId: input.contractorId, status: "UNPAID" },
    select: { id: true, amountCents: true },
  });
  if (selected.length !== ids.length) throw new ReferralAdminError("Some commissions changed. Refresh and try again.");
  const amountCents = selected.reduce((sum, c) => sum + c.amountCents, 0);
  if (amountCents <= 0) throw new ReferralAdminError("The payout total must be more than $0.");

  const payout = await prisma.payout.create({
    data: {
      contractorId: input.contractorId,
      amountCents,
      currency: "usd",
      method: input.method,
      reference: input.reference,
      note: input.note,
      paidAt: input.paidAt,
      commissionIds: ids,
      recordedById: adminId,
      reversedAt: null,
    },
  });
  const { count } = await prisma.commission.updateMany({
    where: { id: { in: ids }, status: "UNPAID" },
    data: { status: "PAID", payoutId: payout.id, paidAt: input.paidAt },
  });
  if (count !== ids.length) {
    // Lost a race: undo our half so balances stay exact.
    await prisma.commission.updateMany({
      where: { payoutId: payout.id },
      data: { status: "UNPAID", payoutId: null, paidAt: null },
    });
    await prisma.payout.delete({ where: { id: payout.id } });
    throw new ReferralAdminError("Some commissions changed. Refresh and try again.");
  }
  return payout;
}

/** Undo a payout recorded by mistake: its commissions become unpaid again. */
export async function reversePayout(id: string, adminId: string) {
  const { count } = await prisma.payout.updateMany({
    where: { id, ...nullOrUnset("reversedAt") },
    data: { reversedAt: new Date(), reversedById: adminId },
  });
  if (count === 0) throw new ReferralAdminError("This payout was already reversed.");
  await prisma.commission.updateMany({
    where: { payoutId: id, status: "PAID" },
    data: { status: "UNPAID", payoutId: null, paidAt: null },
  });
  return prisma.payout.findUniqueOrThrow({ where: { id } });
}

export async function listPayouts(limit = 200) {
  return prisma.payout.findMany({
    orderBy: { paidAt: "desc" },
    take: limit,
    include: { contractor: { select: { id: true, name: true } } },
  });
}
