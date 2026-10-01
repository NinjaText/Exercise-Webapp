import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    organization: { findUnique: vi.fn() },
    memberSubscription: { findUnique: vi.fn(), update: vi.fn() },
  },
}));
vi.mock("@/lib/stripe", () => ({
  stripe: {
    customers: { create: vi.fn() },
    checkout: { sessions: { create: vi.fn() } },
  },
}));
vi.mock("@/lib/services/coaching.service", () => ({
  COACHING_PURCHASE_TYPE: "member_coaching",
  getCoachingForUser: vi.fn(),
  expireOpenCoachingCheckouts: vi.fn(),
}));

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { expireOpenCoachingCheckouts, getCoachingForUser } from "@/lib/services/coaching.service";
import { POST } from "../route";

const user = { id: "u1", role: "CLIENT", clerkOrgId: "org_1", email: "m@x.com", firstName: "Mo", lastName: "Lee" };
const club = { clerkOrgId: "org_1", type: "CLUB", stripePriceId: "price_1", coachingStripePriceId: "price_coach" };
const DAY_MS = 24 * 60 * 60 * 1000;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue({ userId: "clerk_1" } as any);
  vi.mocked(prisma.user.findUnique).mockResolvedValue(user as any);
  vi.mocked(prisma.organization.findUnique).mockResolvedValue(club as any);
  vi.mocked(getCoachingForUser).mockResolvedValue({ status: "ACCEPTED", clerkOrgId: "org_1" } as any);
  vi.mocked(expireOpenCoachingCheckouts).mockReset().mockResolvedValue(0);
  vi.mocked(prisma.memberSubscription.findUnique).mockResolvedValue({
    status: "ACTIVE", stripeCustomerId: null, currentPeriodEnd: new Date(Date.now() + 5 * DAY_MS),
  } as any);
  vi.mocked(stripe.customers.create).mockResolvedValue({ id: "cus_new" } as any);
  vi.mocked(stripe.checkout.sessions.create).mockResolvedValue({ url: "https://stripe.test/c" } as any);
});

describe("POST /api/checkout/coaching", () => {
  it("401 when signed out", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as any);
    expect((await POST()).status).toBe(401);
  });

  it("403 for a client in a trainer org", async () => {
    vi.mocked(prisma.organization.findUnique).mockResolvedValue({ clerkOrgId: "org_1", type: null, coachingStripePriceId: "price_coach" } as any);
    expect((await POST()).status).toBe(403);
  });

  it("403 when the club has no coaching price", async () => {
    vi.mocked(prisma.organization.findUnique).mockResolvedValue({ ...club, coachingStripePriceId: null } as any);
    expect((await POST()).status).toBe(403);
  });

  it("403 for a trainer", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...user, role: "TRAINER" } as any);
    expect((await POST()).status).toBe(403);
  });

  it.each([null, { status: "REQUESTED" }, { status: "DECLINED" }, { status: "CANCELED" }])(
    "409 when coaching is not accepted (%j)",
    async (row) => {
      vi.mocked(getCoachingForUser).mockResolvedValue(row as any);
      expect((await POST()).status).toBe(409);
      expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
    }
  );

  it.each(["ACTIVE", "PAST_DUE"])("409 when coaching is already %s (no double subscription)", async (status) => {
    vi.mocked(getCoachingForUser).mockResolvedValue({ status, stripeSubscriptionId: "sub_c" } as any);
    expect((await POST()).status).toBe(409);
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("409 when the membership is not in good standing", async () => {
    vi.mocked(prisma.memberSubscription.findUnique).mockResolvedValue({ status: "UNPAID", stripeCustomerId: "cus_1" } as any);
    expect((await POST()).status).toBe(409);
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("reuses an existing Stripe customer", async () => {
    vi.mocked(prisma.memberSubscription.findUnique).mockResolvedValue({ status: "ACTIVE", stripeCustomerId: "cus_1" } as any);
    expect((await POST()).status).toBe(200);
    expect(stripe.customers.create).not.toHaveBeenCalled();
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(expect.objectContaining({ customer: "cus_1" }));
  });

  it("creates a customer with the shared idempotency key and persists it, without touching status", async () => {
    await POST();
    expect(stripe.customers.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: "m@x.com" }),
      { idempotencyKey: "member-customer-u1" }
    );
    expect(prisma.memberSubscription.update).toHaveBeenCalledWith({
      where: { userId: "u1" },
      data: { stripeCustomerId: "cus_new" },
    });
  });

  it("creates a coaching subscription session with coaching metadata", async () => {
    const res = await POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://stripe.test/c" });
    const args = vi.mocked(stripe.checkout.sessions.create).mock.calls[0][0] as any;
    expect(args.mode).toBe("subscription");
    expect(args.line_items).toEqual([{ price: "price_coach", quantity: 1 }]);
    expect(args.metadata).toEqual({ purchaseType: "member_coaching", userId: "u1" });
    expect(args.subscription_data.metadata).toEqual({ purchaseType: "member_coaching", userId: "u1" });
    expect(args.subscription_data.trial_end).toBeUndefined();
    expect(args.success_url).toContain("/billing/success?coaching=1");
    expect(args.cancel_url).toContain("/dashboard");
  });

  it("403 for a deactivated member (activeUserOnly)", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...user, isActive: false } as any);
    expect((await POST()).status).toBe(403);
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("409 when the accepted offer belongs to a different club", async () => {
    vi.mocked(getCoachingForUser).mockResolvedValue({ status: "ACCEPTED", clerkOrgId: "org_other" } as any);
    expect((await POST()).status).toBe(409);
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("expires the customer's open coaching checkouts before creating a new one", async () => {
    vi.mocked(prisma.memberSubscription.findUnique).mockResolvedValue({ status: "ACTIVE", stripeCustomerId: "cus_1" } as any);
    expect((await POST()).status).toBe(200);
    expect(expireOpenCoachingCheckouts).toHaveBeenCalledWith("cus_1");
    expect(vi.mocked(expireOpenCoachingCheckouts).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(stripe.checkout.sessions.create).mock.invocationCallOrder[0]
    );
  });

  it("503 and no new session when the old ones can't be expired", async () => {
    vi.mocked(expireOpenCoachingCheckouts).mockRejectedValue(new Error("stripe down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await POST()).status).toBe(503);
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });
});
