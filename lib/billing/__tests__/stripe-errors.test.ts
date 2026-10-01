import { describe, it, expect, vi, afterEach } from "vitest";
import { isStripeSubscriptionAlreadyCanceled } from "../stripe-errors";

afterEach(() => vi.restoreAllMocks());

describe("isStripeSubscriptionAlreadyCanceled", () => {
  it("treats resource_missing as cancelled and warns with the prefix", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const err = Object.assign(new Error("No such subscription: sub_1"), { code: "resource_missing" });
    expect(isStripeSubscriptionAlreadyCanceled(err, "sub_1", "[test]")).toBe(true);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/^\[test\] Stripe returned resource_missing for subscription sub_1/));
  });

  it.each([
    "No such subscription: sub_1",
    "This subscription is already canceled.",
    "Subscription already cancelled",
  ])("matches the message %j", (message) => {
    expect(isStripeSubscriptionAlreadyCanceled(new Error(message), "sub_1", "[test]")).toBe(true);
  });

  it("rejects other errors and non-errors", () => {
    expect(isStripeSubscriptionAlreadyCanceled(new Error("network"), "sub_1", "[test]")).toBe(false);
    expect(isStripeSubscriptionAlreadyCanceled(Object.assign(new Error("x"), { code: "card_declined" }), "s", "[t]")).toBe(false);
    expect(isStripeSubscriptionAlreadyCanceled(null, "sub_1", "[test]")).toBe(false);
    expect(isStripeSubscriptionAlreadyCanceled("oops", "sub_1", "[test]")).toBe(false);
  });
});
