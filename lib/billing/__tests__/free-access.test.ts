import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    trainerSubscription: { findUnique: vi.fn(), update: vi.fn() },
    memberSubscription: { findUnique: vi.fn(), update: vi.fn() },
    user: { update: vi.fn() },
  },
}));
vi.mock("@/lib/stripe", () => ({ stripe: { subscriptions: { update: vi.fn() } } }));

import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { grantFreeAccess, revokeFreeAccess } from "../free-access";

const db = vi.mocked(prisma, true);
const subs = vi.mocked(stripe.subscriptions.update);

beforeEach(() => {
  vi.clearAllMocks();
  db.trainerSubscription.findUnique.mockResolvedValue(null);
  db.memberSubscription.findUnique.mockResolvedValue(null);
});

describe("grantFreeAccess", () => {
  it("stops a trialing trainer subscription from renewing, then flags the user", async () => {
    db.trainerSubscription.findUnique.mockResolvedValue({ id: "ts1", status: "TRIALING", stripeSubscriptionId: "sub_1" } as never);

    expect(await grantFreeAccess("u1", "  Partner clinic ")).toEqual({ stoppedSubscriptions: 1 });
    expect(subs).toHaveBeenCalledWith("sub_1", { cancel_at_period_end: true });
    expect(db.trainerSubscription.update).toHaveBeenCalledWith({ where: { id: "ts1" }, data: { cancelAtPeriodEnd: true } });
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { billingExemptAt: expect.any(Date), billingExemptNote: "Partner clinic" },
    });
  });

  it("stops a club membership too, and skips canceled or card-less subscriptions", async () => {
    db.trainerSubscription.findUnique.mockResolvedValue({ id: "ts1", status: "CANCELED", stripeSubscriptionId: "sub_old" } as never);
    db.memberSubscription.findUnique.mockResolvedValue({ id: "ms1", status: "ACTIVE", stripeSubscriptionId: "sub_m" } as never);

    expect(await grantFreeAccess("u1", "")).toEqual({ stoppedSubscriptions: 1 });
    expect(subs).toHaveBeenCalledTimes(1);
    expect(subs).toHaveBeenCalledWith("sub_m", { cancel_at_period_end: true });
    expect(db.memberSubscription.update).toHaveBeenCalled();
    expect(db.trainerSubscription.update).not.toHaveBeenCalled();
    expect(db.user.update.mock.calls[0][0].data).toMatchObject({ billingExemptNote: null });
  });

  it("works with no subscription at all (e.g. a no-card trial)", async () => {
    expect(await grantFreeAccess("u1", "")).toEqual({ stoppedSubscriptions: 0 });
    expect(subs).not.toHaveBeenCalled();
    expect(db.user.update).toHaveBeenCalled();
  });

  it("changes nothing when Stripe fails", async () => {
    db.trainerSubscription.findUnique.mockResolvedValue({ id: "ts1", status: "ACTIVE", stripeSubscriptionId: "sub_1" } as never);
    subs.mockRejectedValueOnce(new Error("network down"));

    await expect(grantFreeAccess("u1", "")).rejects.toThrow("network down");
    expect(db.user.update).not.toHaveBeenCalled();
    expect(db.trainerSubscription.update).not.toHaveBeenCalled();
  });

  it("treats an already-gone Stripe subscription as stopped", async () => {
    db.trainerSubscription.findUnique.mockResolvedValue({ id: "ts1", status: "ACTIVE", stripeSubscriptionId: "sub_1" } as never);
    subs.mockRejectedValueOnce(Object.assign(new Error("No such subscription: sub_1"), {}));

    expect(await grantFreeAccess("u1", "")).toEqual({ stoppedSubscriptions: 0 });
    expect(db.user.update).toHaveBeenCalled();
  });
});

describe("revokeFreeAccess", () => {
  it("clears the flag and leaves Stripe alone", async () => {
    await revokeFreeAccess("u1");
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { billingExemptAt: null, billingExemptNote: null } });
    expect(subs).not.toHaveBeenCalled();
  });
});
