import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/stripe", () => ({ stripe: { subscriptions: { retrieve: vi.fn() } } }));
vi.mock("@/lib/prisma", () => ({ prisma: { memberSubscription: { updateMany: vi.fn() } } }));

import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import {
  activateMemberFromCheckout, syncMemberSubscriptionFromStripe, markMemberCanceled, markMemberPastDue,
} from "../member-billing.service";

const sub = (status: string) => ({
  id: "sub_1", status, cancel_at_period_end: false,
  items: { data: [{ current_period_end: 1_800_000_000 }] },
}) as any;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.memberSubscription.updateMany).mockResolvedValue({ count: 1 });
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
      where: { stripeCustomerId: "cus_1", OR: [{ stripeSubscriptionId: null }, { stripeSubscriptionId: "sub_1" }] }, data: expect.objectContaining({ status: expected }),
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
      where: { stripeCustomerId: "cus_1", OR: [{ stripeSubscriptionId: null }, { stripeSubscriptionId: "sub_1" }] },
    }));
  });

  it("scopes cancel and past-due to the given subscription id", async () => {
    await markMemberCanceled("cus_1", "sub_old");
    expect(prisma.memberSubscription.updateMany).toHaveBeenLastCalledWith({
      where: { stripeCustomerId: "cus_1", OR: [{ stripeSubscriptionId: null }, { stripeSubscriptionId: "sub_old" }] },
      data: { status: "CANCELED" },
    });
    await markMemberPastDue("cus_1", "sub_old");
    expect(prisma.memberSubscription.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { stripeCustomerId: "cus_1", OR: [{ stripeSubscriptionId: null }, { stripeSubscriptionId: "sub_old" }] },
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
