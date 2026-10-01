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
// member-billing's membership-ended cascade imports it; not exercised here.
vi.mock("@/lib/services/coaching.service", () => ({ cancelCoachingForEndedMembership: vi.fn() }));

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { POST } from "../route";

const user = { id: "u1", role: "CLIENT", clerkOrgId: "org_1", email: "m@x.com", firstName: "Mo", lastName: "Lee" };
const club = { clerkOrgId: "org_1", type: "CLUB", stripePriceId: "price_1" };
const DAY_MS = 24 * 60 * 60 * 1000;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue({ userId: "clerk_1" } as any);
  vi.mocked(prisma.user.findUnique).mockResolvedValue(user as any);
  vi.mocked(prisma.organization.findUnique).mockResolvedValue(club as any);
  vi.mocked(prisma.memberSubscription.findUnique).mockResolvedValue({
    status: "TRIALING", stripeCustomerId: null, trialEndsAt: new Date(Date.now() - DAY_MS),
  } as any);
  vi.mocked(stripe.customers.create).mockResolvedValue({ id: "cus_new" } as any);
  vi.mocked(stripe.checkout.sessions.create).mockResolvedValue({ url: "https://stripe.test/c" } as any);
});

describe("POST /api/checkout/member", () => {
  it("403 for a deactivated member (activeUserOnly)", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...user, isActive: false } as any);
    expect((await POST()).status).toBe(403);
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("403 for a client in a trainer org", async () => {
    vi.mocked(prisma.organization.findUnique).mockResolvedValue({ clerkOrgId: "org_1", type: null } as any);
    expect((await POST()).status).toBe(403);
  });

  it("409 when already ACTIVE", async () => {
    vi.mocked(prisma.memberSubscription.findUnique).mockResolvedValue({ status: "ACTIVE" } as any);
    expect((await POST()).status).toBe(409);
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("409 when they already subscribed during their trial (no second subscription)", async () => {
    vi.mocked(prisma.memberSubscription.findUnique).mockResolvedValue({
      status: "TRIALING", stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1", trialEndsAt: new Date(Date.now() + 5 * DAY_MS),
    } as any);
    expect((await POST()).status).toBe(409);
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("409 when PAST_DUE with an existing subscription", async () => {
    vi.mocked(prisma.memberSubscription.findUnique).mockResolvedValue({
      status: "PAST_DUE", stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1",
    } as any);
    const res = await POST();
    expect(res.status).toBe(409);
    expect(await res.text()).toContain("Manage billing");
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("reuses an existing Stripe customer", async () => {
    vi.mocked(prisma.memberSubscription.findUnique).mockResolvedValue({ status: "CANCELED", stripeCustomerId: "cus_1" } as any);
    await POST();
    expect(stripe.customers.create).not.toHaveBeenCalled();
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(expect.objectContaining({ customer: "cus_1" }));
  });

  it("creates a customer with an idempotency key and tags the session", async () => {
    const res = await POST();
    expect(res.status).toBe(200);
    expect(stripe.customers.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: "m@x.com" }),
      { idempotencyKey: "member-customer-u1" }
    );
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(expect.objectContaining({
      customer: "cus_new",
      metadata: { purchaseType: "member_subscription", userId: "u1" },
      subscription_data: { metadata: { purchaseType: "member_subscription", userId: "u1" } },
    }));
  });

  it("keeps the rest of an active trial when subscribing early", async () => {
    const trialEndsAt = new Date(Date.now() + 10 * DAY_MS);
    vi.mocked(prisma.memberSubscription.findUnique).mockResolvedValue({
      status: "TRIALING", stripeCustomerId: "cus_1", trialEndsAt,
    } as any);
    await POST();
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(expect.objectContaining({
      subscription_data: {
        metadata: { purchaseType: "member_subscription", userId: "u1" },
        trial_end: Math.floor(trialEndsAt.getTime() / 1000),
      },
    }));
  });

  it.each([
    ["a trial ending within 48h", { status: "TRIALING", trialEndsAt: new Date(Date.now() + DAY_MS) }],
    ["an expired trial", { status: "TRIALING", trialEndsAt: new Date(Date.now() - DAY_MS) }],
    ["a canceled member", { status: "CANCELED", trialEndsAt: new Date(Date.now() + 10 * DAY_MS) }],
  ])("bills immediately for %s", async (_label, row) => {
    vi.mocked(prisma.memberSubscription.findUnique).mockResolvedValue({ stripeCustomerId: "cus_1", ...row } as any);
    await POST();
    const arg = vi.mocked(stripe.checkout.sessions.create).mock.calls[0][0] as any;
    expect(arg.subscription_data).not.toHaveProperty("trial_end");
  });
});
