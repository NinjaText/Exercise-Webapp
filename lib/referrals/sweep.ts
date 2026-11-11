import type { Referral, SubStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { nullOrUnset } from "@/lib/db/mongo-null";
import { applyPaidInvoice, paidInvoiceFacts } from "./payments";
import { formatCents, planRetentionBonuses, retentionBonusSourceKey, retentionDueAt } from "./terms";

export interface LiveSubscription {
  status: SubStatus;
  stripeSubscriptionId: string | null;
}

/** Current MIA subscription row per referred user (trainer plan or club membership). */
export async function liveSubscriptions(
  referrals: Pick<Referral, "referredUserId" | "subscriberType">[]
): Promise<Map<string, LiveSubscription>> {
  const trainerIds = referrals.filter((r) => r.subscriberType === "TRAINER").map((r) => r.referredUserId);
  const memberIds = referrals.filter((r) => r.subscriberType === "INDIVIDUAL").map((r) => r.referredUserId);
  const [trainers, members] = await Promise.all([
    trainerIds.length
      ? prisma.trainerSubscription.findMany({
          where: { trainerId: { in: trainerIds } },
          select: { trainerId: true, status: true, stripeSubscriptionId: true },
        })
      : [],
    memberIds.length
      ? prisma.memberSubscription.findMany({
          where: { userId: { in: memberIds } },
          select: { userId: true, status: true, stripeSubscriptionId: true },
        })
      : [],
  ]);
  const map = new Map<string, LiveSubscription>();
  for (const t of trainers) map.set(t.trainerId, { status: t.status, stripeSubscriptionId: t.stripeSubscriptionId ?? null });
  for (const m of members) map.set(m.userId, { status: m.status, stripeSubscriptionId: m.stripeSubscriptionId ?? null });
  return map;
}

export interface SweepResult {
  backfilledPayments: number;
  churned: number;
  retained: number;
  bonusesAwarded: number;
  errors: number;
}

/**
 * Safety net for a missed `invoice.paid` webhook: a referral still marked
 * SIGNED_UP whose subscription is live gets its paid invoices read from Stripe.
 */
async function backfillPayments(referrals: Referral[], subs: Map<string, LiveSubscription>, result: SweepResult) {
  for (const r of referrals) {
    if (r.status !== "SIGNED_UP") continue;
    const sub = subs.get(r.referredUserId);
    if (!sub?.stripeSubscriptionId || (sub.status !== "ACTIVE" && sub.status !== "PAST_DUE")) continue;
    try {
      const invoices = await stripe.invoices.list({ subscription: sub.stripeSubscriptionId, status: "paid", limit: 24 });
      const facts = invoices.data
        .map(paidInvoiceFacts)
        .filter((f): f is NonNullable<typeof f> => f !== null)
        .sort((a, b) => a.paidAt.getTime() - b.paidAt.getTime());
      for (const f of facts) await applyPaidInvoice(r.id, f);
      if (facts.length) {
        result.backfilledPayments += facts.length;
        r.status = "CONVERTED"; // so the churn pass below doesn't re-read it as unpaid
      }
    } catch (err) {
      result.errors++;
      console.error(`[referrals] payment backfill failed for referral ${r.id}:`, err);
    }
  }
}

async function markChurned(referralId: string, from: Referral["status"][], now: Date): Promise<boolean> {
  const { count } = await prisma.referral.updateMany({
    where: { id: referralId, status: { in: from } },
    data: { status: "CHURNED", churnedAt: now },
  });
  return count > 0;
}

/** Canceled subscription, or the account is gone → CHURNED. */
async function reconcileChurn(referrals: Referral[], subs: Map<string, LiveSubscription>, now: Date, result: SweepResult) {
  for (const r of referrals) {
    if (r.status !== "SIGNED_UP" && r.status !== "CONVERTED") continue;
    const sub = subs.get(r.referredUserId);
    if (!sub || sub.status === "CANCELED") {
      if (await markChurned(r.id, ["SIGNED_UP", "CONVERTED"], now)) {
        r.status = "CHURNED";
        result.churned++;
      }
    }
  }
}

/** Retention period reached → confirm the subscription is active in Stripe → RETAINED. */
async function qualifyRetention(referrals: Referral[], subs: Map<string, LiveSubscription>, now: Date, result: SweepResult) {
  for (const r of referrals) {
    if (r.status !== "CONVERTED") continue;
    const due = retentionDueAt(r);
    if (!due || due > now) continue;
    const subId = subs.get(r.referredUserId)?.stripeSubscriptionId;
    if (!subId) continue;
    try {
      const stripeSub = await stripe.subscriptions.retrieve(subId);
      if (stripeSub.status === "active") {
        const { count } = await prisma.referral.updateMany({
          where: { id: r.id, status: "CONVERTED" },
          data: { status: "RETAINED", retainedAt: now },
        });
        if (count) result.retained++;
      } else if (stripeSub.status === "canceled" || stripeSub.status === "incomplete_expired") {
        if (await markChurned(r.id, ["CONVERTED"], now)) result.churned++;
      }
      // past_due / unpaid / paused: not retained yet — re-checked next run.
    } catch (err) {
      result.errors++;
      console.error(`[referrals] Stripe retention check failed for referral ${r.id}:`, err);
    }
  }
}

/** Every full group of retained, un-bonused referrals (same contractor, same terms) earns one bonus. */
export async function awardRetentionBonuses(result: SweepResult): Promise<void> {
  const retained = await prisma.referral.findMany({
    where: { status: "RETAINED", retentionBonusCents: { gt: 0 }, ...nullOrUnset("retentionBonusId") },
    select: {
      id: true,
      contractorId: true,
      retainedAt: true,
      retentionBonusCents: true,
      retentionRequiredCount: true,
      retentionMonths: true,
    },
  });
  const byContractor = new Map<string, typeof retained>();
  for (const r of retained) byContractor.set(r.contractorId, [...(byContractor.get(r.contractorId) ?? []), r]);

  for (const [contractorId, list] of byContractor) {
    for (const award of planRetentionBonuses(list)) {
      const ids = award.referrals.map((r) => r.id);
      const sourceKey = retentionBonusSourceKey(contractorId, ids);
      const { retentionRequiredCount: n, retentionMonths: m } = award.referrals[0];
      try {
        let commissionId: string;
        try {
          const row = await prisma.commission.create({
            data: {
              contractorId,
              kind: "RETENTION_BONUS",
              status: "UNPAID",
              amountCents: award.bonusCents,
              currency: "usd",
              description: `Retention bonus — ${n} referral${n === 1 ? "" : "s"} retained ${m} month${m === 1 ? "" : "s"} (${formatCents(award.bonusCents)})`,
              sourceKey,
              referralIds: ids,
              payoutId: null,
              paidAt: null,
              voidedAt: null,
            },
            select: { id: true },
          });
          commissionId = row.id;
          result.bonusesAwarded++;
        } catch (err) {
          if ((err as { code?: string }).code !== "P2002") throw err;
          // Created by an earlier run that stopped before linking the referrals.
          const existing = await prisma.commission.findUnique({ where: { sourceKey }, select: { id: true } });
          if (!existing) throw err;
          commissionId = existing.id;
        }
        await prisma.referral.updateMany({
          where: { id: { in: ids }, ...nullOrUnset("retentionBonusId") },
          data: { retentionBonusId: commissionId },
        });
      } catch (err) {
        result.errors++;
        console.error(`[referrals] retention bonus failed for contractor ${contractorId}:`, err);
      }
    }
  }
}

/**
 * Daily referral upkeep (cron + admin "Recalculate now"). Each step is
 * idempotent, so overlapping runs or a run after a partial failure are safe.
 */
export async function sweepReferrals(now = new Date()): Promise<SweepResult> {
  const result: SweepResult = { backfilledPayments: 0, churned: 0, retained: 0, bonusesAwarded: 0, errors: 0 };
  const open = await prisma.referral.findMany({ where: { status: { in: ["SIGNED_UP", "CONVERTED"] } } });
  const subs = await liveSubscriptions(open);

  await backfillPayments(open, subs, result);
  await reconcileChurn(open, subs, now, result);
  await qualifyRetention(open, subs, now, result);
  await awardRetentionBonuses(result);
  return result;
}
