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
