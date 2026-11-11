/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma/Stripe mocks */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/services/coaching.service", () => ({ COACHING_PURCHASE_TYPE: "member_coaching" }));
vi.mock("@/lib/stripe", () => ({
  stripe: { subscriptions: { retrieve: vi.fn() }, invoices: { list: vi.fn() } },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    referral: { findMany: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
    commission: { create: vi.fn(), findUnique: vi.fn() },
    trainerSubscription: { findMany: vi.fn() },
    memberSubscription: { findMany: vi.fn() },
  },
}));

import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { sweepReferrals } from "../sweep";

const NOW = new Date("2026-11-11T12:00:00Z");

const ref = (over: Record<string, unknown>) => ({
  id: "r1",
  contractorId: "c1",
  referredUserId: "u1",
  subscriberType: "TRAINER",
  status: "CONVERTED",
  retentionBonusCents: 20000,
  retentionRequiredCount: 2,
  retentionMonths: 2,
  retentionStartAt: new Date("2026-09-01T00:00:00Z"),
  ...over,
});

function setup(open: unknown[], subs: unknown[], retained: unknown[] = []) {
  vi.mocked(prisma.referral.findMany).mockImplementation((async (args: any) =>
    args.where.status?.in ? open : retained) as any);
  vi.mocked(prisma.trainerSubscription.findMany).mockResolvedValue(subs as any);
  vi.mocked(prisma.memberSubscription.findMany).mockResolvedValue([]);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.referral.updateMany).mockResolvedValue({ count: 1 });
  vi.mocked(prisma.commission.create).mockResolvedValue({ id: "bonus1" } as any);
});

describe("sweepReferrals", () => {
  it("marks a referral RETAINED only after the period, and only when Stripe says active", async () => {
    setup(
      [ref({ id: "due" }), ref({ id: "early", referredUserId: "u2", retentionStartAt: new Date("2026-10-01T00:00:00Z") })],
      [
        { trainerId: "u1", status: "ACTIVE", stripeSubscriptionId: "sub_1" },
        { trainerId: "u2", status: "ACTIVE", stripeSubscriptionId: "sub_2" },
      ]
    );
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue({ status: "active" } as any);

    const res = await sweepReferrals(NOW);

    expect(stripe.subscriptions.retrieve).toHaveBeenCalledTimes(1);
    expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith("sub_1");
    expect(prisma.referral.updateMany).toHaveBeenCalledWith({
      where: { id: "due", status: "CONVERTED" },
      data: { status: "RETAINED", retainedAt: NOW },
    });
    expect(res.retained).toBe(1);
  });

  it("does not retain a past-due subscription (checked again tomorrow)", async () => {
    setup([ref({})], [{ trainerId: "u1", status: "PAST_DUE", stripeSubscriptionId: "sub_1" }]);
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue({ status: "past_due" } as any);
    const res = await sweepReferrals(NOW);
    expect(res).toMatchObject({ retained: 0, churned: 0 });
  });

  it("churns canceled subscriptions and deleted accounts", async () => {
    setup(
      [ref({ id: "canceled" }), ref({ id: "gone", referredUserId: "deleted", status: "SIGNED_UP" })],
      [{ trainerId: "u1", status: "CANCELED", stripeSubscriptionId: "sub_1" }]
    );
    const res = await sweepReferrals(NOW);
    expect(res.churned).toBe(2);
    expect(stripe.subscriptions.retrieve).not.toHaveBeenCalled();
  });

  it("backfills a missed first payment from Stripe", async () => {
    setup([ref({ status: "SIGNED_UP", retentionStartAt: null })], [{ trainerId: "u1", status: "ACTIVE", stripeSubscriptionId: "sub_1" }]);
    vi.mocked(stripe.invoices.list).mockResolvedValue({
      data: [
        { id: "in_2", amount_paid: 3999, currency: "usd", created: 1_790_000_000, status_transitions: { paid_at: 1_790_000_000 } },
        { id: "in_0", amount_paid: 0, currency: "usd", created: 1_780_000_000, status_transitions: { paid_at: 1_780_000_000 } },
      ],
    } as any);
    vi.mocked(prisma.referral.findUnique).mockResolvedValue({ id: "r1", firstPaidInvoiceId: "other" } as any);

    const res = await sweepReferrals(NOW);
    expect(stripe.invoices.list).toHaveBeenCalledWith({ subscription: "sub_1", status: "paid", limit: 24 });
    expect(res.backfilledPayments).toBe(1);
    expect(res.churned).toBe(0);
  });

  it("awards one bonus per full group and links the referrals to it", async () => {
    setup(
      [],
      [],
      [
        { id: "a", contractorId: "c1", retainedAt: new Date("2026-10-01"), retentionBonusCents: 20000, retentionRequiredCount: 2, retentionMonths: 2 },
        { id: "b", contractorId: "c1", retainedAt: new Date("2026-10-02"), retentionBonusCents: 20000, retentionRequiredCount: 2, retentionMonths: 2 },
        { id: "c", contractorId: "c1", retainedAt: new Date("2026-10-03"), retentionBonusCents: 20000, retentionRequiredCount: 2, retentionMonths: 2 },
      ]
    );
    const res = await sweepReferrals(NOW);
    expect(res.bonusesAwarded).toBe(1);
    expect(prisma.commission.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: "RETENTION_BONUS",
          amountCents: 20000,
          sourceKey: "retention:c1:a,b",
          referralIds: ["a", "b"],
          description: "Retention bonus — 2 referrals retained 2 months ($200.00)",
        }),
      })
    );
    expect(prisma.referral.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { in: ["a", "b"] } }), data: { retentionBonusId: "bonus1" } })
    );
  });

  it("repairs a bonus created by an interrupted run instead of duplicating it", async () => {
    setup([], [], [
      { id: "a", contractorId: "c1", retainedAt: new Date("2026-10-01"), retentionBonusCents: 100, retentionRequiredCount: 1, retentionMonths: 1 },
    ]);
    vi.mocked(prisma.commission.create).mockRejectedValue(Object.assign(new Error("dup"), { code: "P2002" }));
    vi.mocked(prisma.commission.findUnique).mockResolvedValue({ id: "existing" } as any);
    const res = await sweepReferrals(NOW);
    expect(res).toMatchObject({ bonusesAwarded: 0, errors: 0 });
    expect(prisma.referral.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { retentionBonusId: "existing" } }));
  });
});
