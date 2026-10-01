import { describe, it, expect } from "vitest";
import { nullOrUnset } from "../mongo-null";

describe("nullOrUnset", () => {
  it("matches a field that is null or was never written", () => {
    expect(nullOrUnset("stripeSubscriptionId")).toEqual({
      OR: [{ stripeSubscriptionId: null }, { stripeSubscriptionId: { isSet: false } }],
    });
  });
});
