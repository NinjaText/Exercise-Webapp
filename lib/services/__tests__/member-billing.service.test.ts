import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/stripe", () => ({
  stripe: {
    subscriptions: { retrieve: vi.fn(), cancel: vi.fn() },
    checkout: { sessions: { list: vi.fn(), expire: vi.fn() } },
  },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    memberSubscription: { updateMany: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
    memberCoaching: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/services/coaching.service", () => ({ cancelCoachingForEndedMembership: vi.fn() }));

import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { cancelCoachingForEndedMembership } from "@/lib/services/coaching.service";
import {
  activateMemberFromCheckout, syncMemberSubscriptionFromStripe, markMemberCanceled, markMemberPastDue,
  cancelMemberBillingForDeletion,
} from "../member-billing.service";

const sub = (status: string) => ({
  id: "sub_1", status, cancel_at_period_end: false,
  items: { data: [{ current_period_end: 1_800_000_000 }] },
}) as any;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.memberSubscription.updateMany).mockResolvedValue({ count: 1 });
  vi.mocked(prisma.memberSubscription.findMany).mockResolvedValue([{ userId: "u1" }] as any);
  vi.mocked(cancelCoachingForEndedMembership).mockReset().mockResolvedValue(undefined);
});

describe("member billing", () => {
  it("activates by userId from checkout metadata and stores Stripe ids", async () => {
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue(sub("active"));
    await activateMemberFromCheckout({
      customer: "cus_1", subscription: "sub_1", metadata: { purchaseType: "member_subscription", userId: "u1" },
    } as any);
    expect(prisma.memberSubscription.updateMany).toHaveBeenCalledWith({
      where: { userId: "u1" },
      data: expect.objectContaining({
        status: "ACTIVE", stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1",
        currentPeriodEnd: new Date(1_800_000_000 * 1000),
      }),
    });
  });

  it.each([
    ["active", "ACTIVE"], ["past_due", "PAST_DUE"], ["canceled", "CANCELED"], ["unpaid", "UNPAID"],
    ["trialing", "TRIALING"], ["incomplete_expired", "CANCELED"], ["paused", "UNPAID"], ["incomplete", "ACTIVE"],
  ])("syncs stripe %s → %s by customer", async (stripeStatus, expected) => {
    await syncMemberSubscriptionFromStripe("cus_1", sub(stripeStatus));
    expect(prisma.memberSubscription.updateMany).toHaveBeenCalledWith({
      where: { stripeCustomerId: "cus_1", OR: [{ stripeSubscriptionId: null }, { stripeSubscriptionId: { isSet: false } }, { stripeSubscriptionId: "sub_1" }] }, data: expect.objectContaining({ status: expected }),
    });
  });

  it("is a no-op (count 0) for customers that aren't members", async () => {
    vi.mocked(prisma.memberSubscription.updateMany).mockResolvedValue({ count: 0 });
    expect(await markMemberCanceled("cus_trainer", "sub_x")).toBe(0);
    expect(await markMemberPastDue("cus_trainer", null)).toBe(0);
  });

  it("scopes sync to the member's current subscription", async () => {
    await syncMemberSubscriptionFromStripe("cus_1", sub("active"));
    expect(prisma.memberSubscription.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { stripeCustomerId: "cus_1", OR: [{ stripeSubscriptionId: null }, { stripeSubscriptionId: { isSet: false } }, { stripeSubscriptionId: "sub_1" }] },
    }));
  });

  it("scopes cancel and past-due to the given subscription id", async () => {
    await markMemberCanceled("cus_1", "sub_old");
    expect(prisma.memberSubscription.updateMany).toHaveBeenLastCalledWith({
      where: { stripeCustomerId: "cus_1", OR: [{ stripeSubscriptionId: null }, { stripeSubscriptionId: { isSet: false } }, { stripeSubscriptionId: "sub_old" }] },
      data: { status: "CANCELED" },
    });
    await markMemberPastDue("cus_1", "sub_old");
    expect(prisma.memberSubscription.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { stripeCustomerId: "cus_1", OR: [{ stripeSubscriptionId: null }, { stripeSubscriptionId: { isSet: false } }, { stripeSubscriptionId: "sub_old" }] },
    }));
  });

  it("past-due with no subscription id matches by customer only", async () => {
    await markMemberPastDue("cus_1", null);
    expect(prisma.memberSubscription.updateMany).toHaveBeenCalledWith({
      where: { stripeCustomerId: "cus_1" }, data: { status: "PAST_DUE" },
    });
  });

  it("returns 0 without writing for an empty customer id", async () => {
    expect(await syncMemberSubscriptionFromStripe("", sub("active"))).toBe(0);
    expect(await markMemberCanceled("", "sub_1")).toBe(0);
    expect(await markMemberPastDue("", null)).toBe(0);
    expect(prisma.memberSubscription.updateMany).not.toHaveBeenCalled();
  });

  it("writes the real Stripe status on checkout (canceled stays CANCELED)", async () => {
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue(sub("canceled"));
    await activateMemberFromCheckout({
      customer: "cus_1", subscription: "sub_1", metadata: { userId: "u1" },
    } as any);
    expect(prisma.memberSubscription.updateMany).toHaveBeenCalledWith({
      where: { userId: "u1" }, data: expect.objectContaining({ status: "CANCELED" }),
    });
  });
});

describe("membership ended → coaching cascade", () => {
  const scope = { stripeCustomerId: "cus_1", OR: [{ stripeSubscriptionId: null }, { stripeSubscriptionId: { isSet: false } }, { stripeSubscriptionId: "sub_1" }] };

  it("markMemberCanceled ends coaching for the cancelled member(s)", async () => {
    expect(await markMemberCanceled("cus_1", "sub_1")).toBe(1);
    expect(prisma.memberSubscription.findMany).toHaveBeenCalledWith({
      where: { ...scope, status: "CANCELED" }, select: { userId: true },
    });
    expect(cancelCoachingForEndedMembership).toHaveBeenCalledWith("u1");
  });

  it.each(["canceled", "incomplete_expired"])("sync writing CANCELED (stripe %s) ends coaching", async (status) => {
    await syncMemberSubscriptionFromStripe("cus_1", sub(status));
    expect(cancelCoachingForEndedMembership).toHaveBeenCalledWith("u1");
  });

  it.each(["active", "past_due", "unpaid", "trialing"])("sync writing a non-cancel (stripe %s) leaves coaching alone", async (status) => {
    await syncMemberSubscriptionFromStripe("cus_1", sub(status));
    expect(cancelCoachingForEndedMembership).not.toHaveBeenCalled();
  });

  it("no matched member → no cascade", async () => {
    vi.mocked(prisma.memberSubscription.updateMany).mockResolvedValue({ count: 0 });
    await markMemberCanceled("cus_t", "sub_1");
    await syncMemberSubscriptionFromStripe("cus_t", sub("canceled"));
    expect(prisma.memberSubscription.findMany).not.toHaveBeenCalled();
    expect(cancelCoachingForEndedMembership).not.toHaveBeenCalled();
  });

  it("checkout that writes CANCELED ends coaching for that user; an active checkout doesn't", async () => {
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue(sub("canceled"));
    await activateMemberFromCheckout({ customer: "cus_1", subscription: "sub_1", metadata: { userId: "u1" } } as any);
    expect(prisma.memberSubscription.findMany).toHaveBeenCalledWith({
      where: { userId: "u1", status: "CANCELED" }, select: { userId: true },
    });
    expect(cancelCoachingForEndedMembership).toHaveBeenCalledWith("u1");

    vi.mocked(cancelCoachingForEndedMembership).mockClear();
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue(sub("active"));
    await activateMemberFromCheckout({ customer: "cus_1", subscription: "sub_1", metadata: { userId: "u1" } } as any);
    expect(cancelCoachingForEndedMembership).not.toHaveBeenCalled();
  });

  it("past-due never cascades", async () => {
    await markMemberPastDue("cus_1", "sub_1");
    expect(cancelCoachingForEndedMembership).not.toHaveBeenCalled();
  });

  it("a cascade failure is logged, not thrown, and the membership count is still returned", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(cancelCoachingForEndedMembership).mockRejectedValue(new Error("stripe down"));
    expect(await markMemberCanceled("cus_1", "sub_1")).toBe(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("coaching cascade failed for u1"), expect.any(Error));

    vi.mocked(prisma.memberSubscription.findMany).mockRejectedValue(new Error("db"));
    expect(await syncMemberSubscriptionFromStripe("cus_1", sub("canceled"))).toBe(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("cascade lookup failed"), expect.any(Error));
    error.mockRestore();
  });
});

describe("cancelMemberBillingForDeletion", () => {
  const membership = (extra: Record<string, unknown> = {}) =>
    ({ status: "ACTIVE", stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_member", ...extra }) as any;

  beforeEach(() => {
    for (const fn of [
      prisma.memberSubscription.findUnique, prisma.memberCoaching.findUnique,
      stripe.subscriptions.cancel, stripe.checkout.sessions.list, stripe.checkout.sessions.expire,
    ]) vi.mocked(fn as any).mockReset();
    vi.mocked(stripe.subscriptions.cancel).mockResolvedValue({} as any);
    vi.mocked(stripe.checkout.sessions.list).mockResolvedValue({ data: [] } as any);
    vi.mocked(stripe.checkout.sessions.expire).mockResolvedValue({} as any);
  });

  it("is a no-op for anyone without a membership (trainers, trainer-org clients)", async () => {
    vi.mocked(prisma.memberSubscription.findUnique).mockResolvedValue(null);
    await cancelMemberBillingForDeletion("u_trainer");
    expect(prisma.memberCoaching.findUnique).not.toHaveBeenCalled();
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
    expect(stripe.checkout.sessions.list).not.toHaveBeenCalled();
  });

  it("cancels both the coaching and the membership subscription, then expires open checkouts", async () => {
    vi.mocked(prisma.memberSubscription.findUnique).mockResolvedValue(membership());
    vi.mocked(prisma.memberCoaching.findUnique).mockResolvedValue({ status: "ACTIVE", stripeSubscriptionId: "sub_coach" } as any);
    vi.mocked(stripe.checkout.sessions.list).mockResolvedValue({ data: [{ id: "cs_open" }] } as any);

    await cancelMemberBillingForDeletion("u1");

    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith("sub_coach");
    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith("sub_member");
    expect(stripe.checkout.sessions.list).toHaveBeenCalledWith({ customer: "cus_1", status: "open", limit: 100 });
    expect(stripe.checkout.sessions.expire).toHaveBeenCalledWith("cs_open");
  });

  it("also cancels PAST_DUE coaching", async () => {
    vi.mocked(prisma.memberSubscription.findUnique).mockResolvedValue(membership({ stripeSubscriptionId: null, status: "TRIALING" }));
    vi.mocked(prisma.memberCoaching.findUnique).mockResolvedValue({ status: "PAST_DUE", stripeSubscriptionId: "sub_coach" } as any);
    await cancelMemberBillingForDeletion("u1");
    expect(vi.mocked(stripe.subscriptions.cancel).mock.calls).toEqual([["sub_coach"]]);
  });

  it("skips subscriptions that are already over (CANCELED membership, CANCELED/unpaid coaching)", async () => {
    vi.mocked(prisma.memberSubscription.findUnique).mockResolvedValue(membership({ status: "CANCELED" }));
    vi.mocked(prisma.memberCoaching.findUnique).mockResolvedValue({ status: "CANCELED", stripeSubscriptionId: "sub_old" } as any);
    await cancelMemberBillingForDeletion("u1");
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
  });

  it("treats an already-cancelled subscription as success", async () => {
    vi.mocked(prisma.memberSubscription.findUnique).mockResolvedValue(membership());
    vi.mocked(prisma.memberCoaching.findUnique).mockResolvedValue(null);
    vi.mocked(stripe.subscriptions.cancel).mockRejectedValue(
      Object.assign(new Error("No such subscription: sub_member"), { code: "resource_missing" })
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(cancelMemberBillingForDeletion("u1")).resolves.toBeUndefined();
  });

  it("throws on any other Stripe failure, before expiring checkouts", async () => {
    vi.mocked(prisma.memberSubscription.findUnique).mockResolvedValue(membership());
    vi.mocked(prisma.memberCoaching.findUnique).mockResolvedValue({ status: "ACTIVE", stripeSubscriptionId: "sub_coach" } as any);
    vi.mocked(stripe.subscriptions.cancel).mockRejectedValue(new Error("stripe down"));
    await expect(cancelMemberBillingForDeletion("u1")).rejects.toThrow("stripe down");
    expect(stripe.checkout.sessions.list).not.toHaveBeenCalled();
  });

  it("does not fail the deletion when expiring checkouts fails", async () => {
    vi.mocked(prisma.memberSubscription.findUnique).mockResolvedValue(membership());
    vi.mocked(prisma.memberCoaching.findUnique).mockResolvedValue(null);
    vi.mocked(stripe.checkout.sessions.list).mockRejectedValue(new Error("stripe blip"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(cancelMemberBillingForDeletion("u1")).resolves.toBeUndefined();
    expect(err).toHaveBeenCalled();
  });
});
