/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma/Stripe mocks */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    referral: { findUnique: vi.fn(), create: vi.fn() },
    contractor: { findUnique: vi.fn() },
    trainerSubscription: { findUnique: vi.fn() },
    memberSubscription: { findUnique: vi.fn() },
  },
}));

import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { attributeReferral, attributeReferralFromRequest } from "../attribution";

const user = { id: "u1", email: "new@client.com", firstName: "Ana", lastName: "Diaz", billingExemptAt: null };
const plan = {
  id: "p1",
  name: "Standard",
  trainerCommissionType: "FIXED",
  trainerCommissionValue: 5000,
  individualCommissionType: "PERCENT",
  individualCommissionValue: 2000,
  retentionBonusCents: 20000,
  retentionRequiredCount: 4,
  retentionMonths: 2,
  retentionScope: "TRAINERS",
};
const contractor = { id: "c1", email: "rep@mia.com", isActive: true, referralCode: "JORDAN-7K3Q", plan };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.referral.findUnique).mockResolvedValue(null);
  vi.mocked(prisma.contractor.findUnique).mockResolvedValue(contractor as any);
  vi.mocked(prisma.trainerSubscription.findUnique).mockResolvedValue({ stripeSubscriptionId: null } as any);
  vi.mocked(prisma.memberSubscription.findUnique).mockResolvedValue(null);
  vi.mocked(prisma.referral.create).mockResolvedValue({ id: "r1" } as any);
  delete process.env.BILLING_EXEMPT_EMAILS;
  delete process.env.SUPER_ADMIN_EMAILS;
});

describe("attributeReferral", () => {
  it("creates a referral with the plan terms frozen onto it", async () => {
    const res = await attributeReferral({ user, subscriberType: "TRAINER", cookieCode: "jordan-7k3q" });
    expect(res).toEqual({ attributed: true, referralId: "r1", contractorId: "c1" });
    expect(prisma.contractor.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { referralCode: "JORDAN-7K3Q" } }));
    expect(prisma.referral.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          contractorId: "c1",
          referredUserId: "u1",
          referredName: "Ana Diaz",
          subscriberType: "TRAINER",
          source: "link",
          status: "SIGNED_UP",
          planId: "p1",
          commissionType: "FIXED",
          commissionValue: 5000,
          retentionBonusCents: 20000,
          retentionRequiredCount: 4,
          retentionMonths: 2,
          firstPaidAt: null,
          retentionBonusId: null,
        }),
      })
    );
  });

  it("prefers a typed code over the cookie and records it as typed", async () => {
    await attributeReferral({ user, subscriberType: "TRAINER", typedCode: "other-code", cookieCode: "JORDAN-7K3Q" });
    expect(prisma.contractor.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { referralCode: "OTHER-CODE" } }));
    expect(vi.mocked(prisma.referral.create).mock.calls[0][0].data).toMatchObject({ source: "code" });
  });

  it("treats a typed code equal to the cookie (pre-filled) as a link referral", async () => {
    await attributeReferral({ user, subscriberType: "TRAINER", typedCode: "JORDAN-7K3Q", cookieCode: "JORDAN-7K3Q" });
    expect(vi.mocked(prisma.referral.create).mock.calls[0][0].data).toMatchObject({ source: "link" });
  });

  it.each([
    ["no code", {}, "no_code"],
    ["malformed code", { cookieCode: "!!" }, "no_code"],
  ])("skips with %s", async (_l, extra, reason) => {
    expect(await attributeReferral({ user, subscriberType: "TRAINER", ...extra })).toEqual({ attributed: false, reason });
    expect(prisma.referral.create).not.toHaveBeenCalled();
  });

  it("skips unknown and inactive contractors", async () => {
    vi.mocked(prisma.contractor.findUnique).mockResolvedValueOnce(null);
    expect(await attributeReferral({ user, subscriberType: "TRAINER", cookieCode: "NOPE-1" })).toMatchObject({ reason: "unknown_code" });
    vi.mocked(prisma.contractor.findUnique).mockResolvedValueOnce({ ...contractor, isActive: false } as any);
    expect(await attributeReferral({ user, subscriberType: "TRAINER", cookieCode: "JORDAN-7K3Q" })).toMatchObject({
      reason: "inactive_contractor",
    });
  });

  it("refuses self-referral", async () => {
    const res = await attributeReferral({ user: { ...user, email: "REP@mia.com" }, subscriberType: "TRAINER", cookieCode: "JORDAN-7K3Q" });
    expect(res).toMatchObject({ reason: "self_referral" });
  });

  it("keeps the first attribution", async () => {
    vi.mocked(prisma.referral.findUnique).mockResolvedValue({ id: "old" } as any);
    expect(await attributeReferral({ user, subscriberType: "TRAINER", cookieCode: "JORDAN-7K3Q" })).toMatchObject({
      reason: "already_referred",
    });
  });

  it("does not claim an account that already had a Stripe subscription", async () => {
    vi.mocked(prisma.memberSubscription.findUnique).mockResolvedValue({ stripeSubscriptionId: "sub_old" } as any);
    expect(await attributeReferral({ user, subscriberType: "INDIVIDUAL", cookieCode: "JORDAN-7K3Q" })).toMatchObject({
      reason: "existing_customer",
    });
  });

  it("never attributes complimentary accounts", async () => {
    process.env.BILLING_EXEMPT_EMAILS = "new@client.com";
    expect(await attributeReferral({ user, subscriberType: "TRAINER", cookieCode: "JORDAN-7K3Q" })).toMatchObject({ reason: "exempt" });
  });

  it("treats a concurrent duplicate as already referred", async () => {
    vi.mocked(prisma.referral.create).mockRejectedValue(Object.assign(new Error("dup"), { code: "P2002" }));
    expect(await attributeReferral({ user, subscriberType: "TRAINER", cookieCode: "JORDAN-7K3Q" })).toMatchObject({
      reason: "already_referred",
    });
  });
});

describe("attributeReferralFromRequest", () => {
  it("reads the cookie and Clerk metadata, clears the cookie, and never throws", async () => {
    const del = vi.fn();
    vi.mocked(cookies).mockResolvedValue({ get: () => ({ value: "JORDAN-7K3Q" }), delete: del } as any);
    const res = await attributeReferralFromRequest({
      user,
      subscriberType: "TRAINER",
      clerkUnsafeMetadata: { referralCode: "typed-1" },
      clearCookie: true,
    });
    expect(res).toMatchObject({ attributed: true });
    expect(prisma.contractor.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { referralCode: "TYPED-1" } }));
    expect(del).toHaveBeenCalled();

    vi.mocked(prisma.referral.findUnique).mockRejectedValue(new Error("db down"));
    await expect(
      attributeReferralFromRequest({ user, subscriberType: "TRAINER", clerkUnsafeMetadata: null })
    ).resolves.toBeNull();
  });
});
