/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma/Stripe mocks */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/services/coaching.service", () => ({ COACHING_PURCHASE_TYPE: "member_coaching" }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    referral: { findUnique: vi.fn(), updateMany: vi.fn() },
    commission: { create: vi.fn() },
    trainerSubscription: { findUnique: vi.fn() },
    memberSubscription: { findFirst: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { applyPaidInvoice, recordReferralInvoicePayment } from "../payments";

const invoice = (over: Record<string, unknown> = {}) =>
  ({
    id: "in_1",
    customer: "cus_1",
    amount_paid: 3999,
    currency: "usd",
    created: 1_800_000_000,
    status_transitions: { paid_at: 1_800_000_100 },
    parent: { subscription_details: { subscription: "sub_1", metadata: { purchaseType: "trainer_subscription" } } },
    ...over,
  }) as any;

const referral = (over: Record<string, unknown> = {}) => ({
  id: "r1",
  contractorId: "c1",
  referredName: "Ana Diaz",
  subscriberType: "TRAINER",
  commissionType: "PERCENT",
  commissionValue: 2000,
  firstPaidAmountCents: 3999,
  firstPaidInvoiceId: "in_1",
  firstPaidAt: new Date(1_800_000_100_000),
  currency: "usd",
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.trainerSubscription.findUnique).mockResolvedValue({ trainerId: "u1" } as any);
  vi.mocked(prisma.memberSubscription.findFirst).mockResolvedValue(null);
  vi.mocked(prisma.referral.updateMany).mockResolvedValue({ count: 1 });
  vi.mocked(prisma.referral.findUnique).mockImplementation((async (args: any) =>
    args.where.referredUserId ? { id: "r1" } : referral()) as any);
  vi.mocked(prisma.commission.create).mockResolvedValue({ id: "cm1" } as any);
});

describe("recordReferralInvoicePayment", () => {
  it("converts the referral and creates the signup commission on the first paid invoice", async () => {
    expect(await recordReferralInvoicePayment(invoice())).toBe(true);

    const [counters, first] = vi.mocked(prisma.referral.updateMany).mock.calls.map((c) => c[0]);
    expect(counters).toMatchObject({
      where: { id: "r1", NOT: { paidInvoiceIds: { has: "in_1" } } },
      data: { paidInvoiceIds: { push: "in_1" }, paidInvoiceCount: { increment: 1 }, totalPaidCents: { increment: 3999 } },
    });
    expect(first.data).toMatchObject({
      status: "CONVERTED",
      firstPaidInvoiceId: "in_1",
      firstPaidAmountCents: 3999,
      retentionStartAt: new Date(1_800_000_100_000),
    });
    expect(prisma.commission.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          contractorId: "c1",
          kind: "SIGNUP",
          amountCents: 800,
          sourceKey: "signup:r1",
          referralIds: ["r1"],
          description: "Signup — Ana Diaz (trainer, 20% of $39.99)",
        }),
      })
    );
  });

  it("ignores $0 invoices (trials, 100% coupons)", async () => {
    expect(await recordReferralInvoicePayment(invoice({ amount_paid: 0 }))).toBe(false);
    expect(prisma.referral.updateMany).not.toHaveBeenCalled();
  });

  it("ignores coaching invoices on a member's customer", async () => {
    const coaching = invoice({
      parent: { subscription_details: { subscription: "sub_c", metadata: { purchaseType: "member_coaching" } } },
    });
    expect(await recordReferralInvoicePayment(coaching)).toBe(false);
  });

  it("ignores invoices for accounts nobody referred", async () => {
    vi.mocked(prisma.referral.findUnique).mockResolvedValue(null);
    expect(await recordReferralInvoicePayment(invoice())).toBe(false);
  });

  it("resolves club members by their membership customer", async () => {
    vi.mocked(prisma.trainerSubscription.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.memberSubscription.findFirst).mockResolvedValue({ userId: "m1" } as any);
    await recordReferralInvoicePayment(invoice());
    expect(prisma.referral.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { referredUserId: "m1" } }));
  });
});

describe("applyPaidInvoice", () => {
  const facts = { invoiceId: "in_2", amountPaidCents: 3999, currency: "usd", paidAt: new Date("2026-12-01T00:00:00Z") };

  it("a renewal only bumps counters — no second commission", async () => {
    vi.mocked(prisma.referral.updateMany)
      .mockResolvedValueOnce({ count: 1 }) // counters
      .mockResolvedValueOnce({ count: 0 }) // already converted
      .mockResolvedValueOnce({ count: 0 }); // not churned
    await applyPaidInvoice("r1", facts);
    expect(prisma.commission.create).not.toHaveBeenCalled();
  });

  it("re-converts a churned referral and restarts its retention clock", async () => {
    vi.mocked(prisma.referral.updateMany).mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    await applyPaidInvoice("r1", facts);
    expect(vi.mocked(prisma.referral.updateMany).mock.calls[2][0]).toEqual({
      where: { id: "r1", status: "CHURNED" },
      data: { status: "CONVERTED", retentionStartAt: facts.paidAt, churnedAt: null },
    });
  });

  it("a replayed first invoice repairs a missing commission without duplicating it", async () => {
    vi.mocked(prisma.referral.updateMany).mockResolvedValue({ count: 0 });
    vi.mocked(prisma.commission.create).mockRejectedValue(Object.assign(new Error("dup"), { code: "P2002" }));
    await expect(applyPaidInvoice("r1", { ...facts, invoiceId: "in_1" })).resolves.toBeUndefined();
    expect(prisma.commission.create).toHaveBeenCalledTimes(1);
  });

  it("creates no commission when the referral's terms pay nothing", async () => {
    vi.mocked(prisma.referral.findUnique).mockResolvedValue(referral({ commissionType: "NONE", commissionValue: 0 }) as any);
    await applyPaidInvoice("r1", { ...facts, invoiceId: "in_1" });
    expect(prisma.commission.create).not.toHaveBeenCalled();
  });
});
