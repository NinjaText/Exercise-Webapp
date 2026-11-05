import { describe, it, expect } from "vitest";
import { evaluateAccess, evaluateMemberAccess, memberTrialBannerDays, trialDaysLeft } from "@/lib/billing/access";

const now = new Date("2026-10-01T12:00:00Z");
const future = new Date("2026-10-05T12:00:00Z");
const past = new Date("2026-09-30T12:00:00Z");

describe("evaluateAccess", () => {
  it.each([
    ["no subscription", null, "trial_expired"],
    ["trialing, not expired", { status: "TRIALING", trialEndsAt: future }, "ok"],
    ["trialing, expired", { status: "TRIALING", trialEndsAt: past }, "trial_expired"],
    ["trialing, ends exactly now", { status: "TRIALING", trialEndsAt: now }, "ok"],
    ["active", { status: "ACTIVE", trialEndsAt: past }, "ok"],
    ["canceled", { status: "CANCELED", trialEndsAt: future }, "trial_expired"],
    ["past due", { status: "PAST_DUE", trialEndsAt: past }, "payment_failed"],
    ["unpaid", { status: "UNPAID", trialEndsAt: past }, "payment_failed"],
  ] as const)("%s → %s", (_label, sub, expected) => {
    expect(evaluateAccess(sub as any, now)).toBe(expected);
  });
});

describe("trialDaysLeft", () => {
  it("rounds partial days up", () => {
    expect(trialDaysLeft({ status: "TRIALING", trialEndsAt: new Date("2026-10-02T13:00:00Z") }, now)).toBe(2);
  });
  it("is null when not trialing or expired", () => {
    expect(trialDaysLeft(null, now)).toBeNull();
    expect(trialDaysLeft({ status: "ACTIVE", trialEndsAt: future }, now)).toBeNull();
    expect(trialDaysLeft({ status: "TRIALING", trialEndsAt: past }, now)).toBeNull();
  });
});

describe("member access with a subscription scheduled at trial end", () => {
  const scheduled = { status: "TRIALING", trialEndsAt: past, stripeSubscriptionId: "sub_1" } as const;

  it("keeps access while Stripe converts the trial (webhook lag)", () => {
    expect(evaluateMemberAccess(scheduled, now)).toBe("ok");
  });
  it("falls back to the shared rule otherwise", () => {
    expect(evaluateMemberAccess({ status: "TRIALING", trialEndsAt: past, stripeSubscriptionId: null }, now)).toBe("trial_expired");
    expect(evaluateMemberAccess({ status: "PAST_DUE", trialEndsAt: past, stripeSubscriptionId: "sub_1" }, now)).toBe("payment_failed");
    expect(evaluateMemberAccess(null, now)).toBe("trial_expired");
  });
  it("hides the 'subscribe' trial banner once they've subscribed", () => {
    expect(memberTrialBannerDays({ ...scheduled, trialEndsAt: future }, now)).toBeNull();
    expect(memberTrialBannerDays({ status: "TRIALING", trialEndsAt: future, stripeSubscriptionId: null }, now)).toBe(4);
  });
  it("the shared (trainer) rule is unchanged", () => {
    expect(evaluateAccess(scheduled as any, now)).toBe("trial_expired");
  });
});

describe("card-required trial (7-day Stripe trial)", () => {
  // Imported lazily so the block reads top-down with the helpers it covers.
  it("a fresh row (NO_LOCAL_TRIAL, no Stripe sub) must check out — never 'trial ended'", async () => {
    const { evaluateTrainerAccess, NO_LOCAL_TRIAL, awaitingFirstCheckout } = await import("@/lib/billing/access");
    const fresh = { status: "TRIALING", trialEndsAt: NO_LOCAL_TRIAL, stripeSubscriptionId: null } as const;
    expect(awaitingFirstCheckout(fresh)).toBe(true);
    expect(evaluateTrainerAccess(fresh, now)).toBe("checkout_required");
    expect(evaluateMemberAccess(fresh, now)).toBe("checkout_required");
  });

  it("grandfathers an old card-less trial until it ends, then 'trial ended'", async () => {
    const { evaluateTrainerAccess } = await import("@/lib/billing/access");
    expect(evaluateTrainerAccess({ status: "TRIALING", trialEndsAt: future, stripeSubscriptionId: null }, now)).toBe("ok");
    expect(evaluateTrainerAccess({ status: "TRIALING", trialEndsAt: past, stripeSubscriptionId: null }, now)).toBe("trial_expired");
  });

  it("a Stripe-trialing trainer keeps access across the trial→paid webhook lag", async () => {
    const { evaluateTrainerAccess } = await import("@/lib/billing/access");
    expect(evaluateTrainerAccess({ status: "TRIALING", trialEndsAt: past, stripeSubscriptionId: "sub_1" }, now)).toBe("ok");
    expect(evaluateTrainerAccess({ status: "CANCELED", trialEndsAt: past, stripeSubscriptionId: "sub_1" }, now)).toBe("trial_expired");
  });

  it("one trial per account", async () => {
    const { isTrialEligible, NO_LOCAL_TRIAL } = await import("@/lib/billing/access");
    const fresh = { status: "TRIALING", trialEndsAt: NO_LOCAL_TRIAL, stripeSubscriptionId: null, trialUsedAt: null } as const;
    expect(isTrialEligible(fresh)).toBe(true);
    expect(isTrialEligible({ ...fresh, trialUsedAt: new Date() })).toBe(false);
    expect(isTrialEligible({ ...fresh, status: "CANCELED", stripeSubscriptionId: "sub_old" })).toBe(false);
    // An old card-less trial counts as the account's trial.
    expect(isTrialEligible({ ...fresh, trialEndsAt: past })).toBe(false);
  });
});
