/* eslint-disable @typescript-eslint/no-explicit-any -- Stripe stubs */
/**
 * Opt-in end-to-end ledger test against a real MongoDB (only Stripe is
 * stubbed). Catches Mongo query semantics that unit mocks can't — `has`,
 * null-vs-unset, groupBy, unique keys. Never point this at production.
 *
 *   REFERRALS_DB_IT=1 DATABASE_URL=mongodb://127.0.0.1:27018/exercise-webapp-test \
 *     npx vitest run lib/referrals/__tests__/ledger.integration.test.ts
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

const enabled = process.env.REFERRALS_DB_IT === "1" && /127\.0\.0\.1|localhost/.test(process.env.DATABASE_URL ?? "");

vi.mock("@/lib/services/coaching.service", () => ({ COACHING_PURCHASE_TYPE: "member_coaching" }));
vi.mock("@/lib/stripe", () => ({
  stripe: { subscriptions: { retrieve: vi.fn() }, invoices: { list: vi.fn(async () => ({ data: [] })) } },
}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));

import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { attributeReferral } from "../attribution";
import { recordReferralInvoicePayment } from "../payments";
import { sweepReferrals } from "../sweep";
import {
  createContractor,
  createPlan,
  getContractorDetail,
  getReferralOverview,
  recordPayout,
  reversePayout,
  updatePlan,
  voidCommission,
} from "../admin";

const RUN = `it${Date.now().toString(36)}`;
const ADMIN = "0123456789abcdef01234567";
const created = { users: [] as string[], contractor: "", plan: "" };

async function makeTrainer(i: number) {
  const user = await prisma.user.create({
    data: { clerkId: `${RUN}_${i}`, email: `${RUN}_${i}@example.test`, firstName: `T${i}`, lastName: "Test", role: "TRAINER" },
  });
  await prisma.trainerSubscription.create({
    data: { trainerId: user.id, stripeCustomerId: `cus_${RUN}_${i}`, status: "TRIALING", trialEndsAt: new Date() },
  });
  created.users.push(user.id);
  return user;
}

const invoice = (i: number, n: number, cents = 3999) =>
  ({
    id: `in_${RUN}_${i}_${n}`,
    customer: `cus_${RUN}_${i}`,
    amount_paid: cents,
    currency: "usd",
    created: Math.floor(Date.now() / 1000),
    status_transitions: { paid_at: Math.floor(Date.now() / 1000) },
    parent: { subscription_details: { subscription: `sub_${RUN}_${i}`, metadata: { purchaseType: "trainer_subscription" } } },
  }) as any;

describe.skipIf(!enabled)("referral ledger against MongoDB", () => {
  const terms = {
    name: `${RUN} plan`,
    description: null,
    trainerCommissionType: "FIXED" as const,
    trainerCommissionValue: 5000,
    individualCommissionType: "PERCENT" as const,
    individualCommissionValue: 2000,
    retentionBonusCents: 20000,
    retentionRequiredCount: 2,
    retentionMonths: 2,
    retentionScope: "TRAINERS" as const,
  };

  beforeAll(async () => {
    const plan = await createPlan(terms, ADMIN);
    created.plan = plan.id;
    const contractor = await createContractor({
      name: "IT Rep",
      email: `${RUN}-rep@example.test`,
      phone: null,
      notes: null,
      referralCode: `${RUN.toUpperCase()}-REP`,
      planId: plan.id,
      isActive: true,
    });
    created.contractor = contractor.id;
  });

  afterAll(async () => {
    if (!enabled) return;
    await prisma.commission.deleteMany({ where: { contractorId: created.contractor } });
    await prisma.payout.deleteMany({ where: { contractorId: created.contractor } });
    await prisma.referral.deleteMany({ where: { contractorId: created.contractor } });
    await prisma.contractor.deleteMany({ where: { id: created.contractor } });
    await prisma.commissionPlan.deleteMany({ where: { id: created.plan } });
    await prisma.trainerSubscription.deleteMany({ where: { trainerId: { in: created.users } } });
    await prisma.user.deleteMany({ where: { id: { in: created.users } } });
  });

  it("runs the full lifecycle: attribute → pay → retain → bonus → payout", async () => {
    const code = `${RUN.toUpperCase()}-REP`.toLowerCase();
    const trainers = await Promise.all([1, 2, 3].map(makeTrainer));
    for (const t of trainers) {
      expect(await attributeReferral({ user: t, subscriberType: "TRAINER", cookieCode: code })).toMatchObject({ attributed: true });
    }
    // Second attribution of the same user is refused by the unique index path.
    expect(await attributeReferral({ user: trainers[0], subscriberType: "TRAINER", cookieCode: code })).toMatchObject({
      reason: "already_referred",
    });

    // Plan edit: only the 4th (later) referral sees the new rate.
    await updatePlan(created.plan, { ...terms, trainerCommissionValue: 9900 }, ADMIN);
    const late = await makeTrainer(4);
    await attributeReferral({ user: late, subscriberType: "TRAINER", cookieCode: code });
    const snapshots = await prisma.referral.findMany({ where: { contractorId: created.contractor }, orderBy: { createdAt: "asc" } });
    expect(snapshots.map((r) => r.commissionValue)).toEqual([5000, 5000, 5000, 9900]);

    // $0 trial invoice: nothing. First real payment: commission. Replay: no duplicate.
    expect(await recordReferralInvoicePayment(invoice(1, 0, 0))).toBe(false);
    for (const i of [1, 2, 3]) expect(await recordReferralInvoicePayment(invoice(i, 1))).toBe(true);
    await recordReferralInvoicePayment(invoice(1, 1));
    await recordReferralInvoicePayment(invoice(1, 2)); // renewal
    const r1 = await prisma.referral.findUniqueOrThrow({ where: { referredUserId: trainers[0].id } });
    expect(r1).toMatchObject({ status: "CONVERTED", paidInvoiceCount: 2, totalPaidCents: 7998, firstPaidAmountCents: 3999 });
    let commissions = await prisma.commission.findMany({ where: { contractorId: created.contractor } });
    expect(commissions.map((c) => c.amountCents)).toEqual([5000, 5000, 5000]);

    // Retention: subs live in Stripe, clock started 3 months ago.
    for (const t of trainers) {
      await prisma.trainerSubscription.update({
        where: { trainerId: t.id },
        data: { status: "ACTIVE", stripeSubscriptionId: `sub_${t.clerkId}` },
      });
    }
    await prisma.referral.updateMany({
      where: { referredUserId: { in: trainers.map((t) => t.id) } },
      data: { retentionStartAt: new Date(Date.now() - 95 * 24 * 60 * 60 * 1000) },
    });
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue({ status: "active" } as any);

    const first = await sweepReferrals();
    expect(first).toMatchObject({ retained: 3, bonusesAwarded: 1, errors: 0 });
    // Late trainer has no subscription row change (still trialing, unpaid) → untouched.
    expect(await sweepReferrals()).toMatchObject({ retained: 0, bonusesAwarded: 0 });

    const detail = (await getContractorDetail(created.contractor))!;
    expect(detail.counts).toMatchObject({ total: 4, paying: 3, retained: 3 });
    expect(detail.retention).toEqual([
      expect.objectContaining({ required: 2, qualified: 1, bonusesEarned: 1, bonusCents: 20000 }),
    ]);
    expect(detail.balances).toEqual({ earnedCents: 35000, unpaidCents: 35000, paidCents: 0 });

    const overview = await getReferralOverview();
    const row = overview.rows.find((r) => r.id === created.contractor)!;
    expect(row.balances.unpaidCents).toBe(35000);
    expect(row.counts.total).toBe(4);

    // Void one, pay the rest, then reverse the payout.
    commissions = await prisma.commission.findMany({ where: { contractorId: created.contractor }, orderBy: { earnedAt: "asc" } });
    await voidCommission(commissions[0].id, "refunded");
    const unpaid = commissions.slice(1).map((c) => c.id);
    const payout = await recordPayout(
      { contractorId: created.contractor, commissionIds: unpaid, method: "PayPal", reference: null, note: null, paidAt: new Date() },
      ADMIN
    );
    expect(payout.amountCents).toBe(30000);
    expect((await getContractorDetail(created.contractor))!.balances).toEqual({ earnedCents: 30000, unpaidCents: 0, paidCents: 30000 });
    await expect(voidCommission(unpaid[0], "nope")).rejects.toThrow(/Only unpaid/);

    await reversePayout(payout.id, ADMIN);
    expect((await getContractorDetail(created.contractor))!.balances).toEqual({ earnedCents: 30000, unpaidCents: 30000, paidCents: 0 });
    await expect(reversePayout(payout.id, ADMIN)).rejects.toThrow(/already reversed/);
  }, 60_000);
});
