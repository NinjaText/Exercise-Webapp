import { describe, it, expect, vi } from "vitest";
import { formatStripeAmount, parseDollarsToCents, centsToDollars } from "../money";

describe("formatStripeAmount", () => {
  it("formats a two-decimal currency (USD) from cents", () => {
    expect(formatStripeAmount(4900, "usd")).toBe("$49.00");
  });

  it("formats a zero-decimal currency (JPY) from whole units, not cents", () => {
    // Stripe sends JPY amounts in whole yen, not sub-units. Dividing by a
    // hardcoded 100 would silently render "¥10" for an actual ¥1,000 charge.
    expect(formatStripeAmount(1000, "jpy")).toBe("¥1,000");
  });

  it("formats a three-decimal currency (KWD) from thousandths", () => {
    // Intl separates the ISO code from the amount with a non-breaking space
    // (U+00A0), not a regular space.
    expect(formatStripeAmount(1000, "kwd")).toBe("KWD 1.000");
  });

  it("formats a zero amount", () => {
    expect(formatStripeAmount(0, "usd")).toBe("$0.00");
  });

  it("falls back to a plain numeric amount instead of throwing on an invalid currency code", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => formatStripeAmount(500, "NOTACURRENCY")).not.toThrow();
    expect(formatStripeAmount(500, "NOTACURRENCY")).toBe("500 NOTACURRENCY");
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });
});

describe("parseDollarsToCents", () => {
  it.each([
    ["14.99", 1499],
    ["14.9", 1490],
    ["14", 1400],
    [" $14.99 ", 1499],
    ["0.5", 50],
    ["10000", 1_000_000],
    // 0.1 + 0.2 style float bugs: 19.99 * 100 = 1998.9999999999998
    ["19.99", 1999],
    ["1.15", 115],
  ])("%s -> %i cents", (input, cents) => {
    expect(parseDollarsToCents(input)).toBe(cents);
  });
  it.each(["", "abc", "14.999", "-5", "1e3", ".5", "14.", "1,000", "12abc"])("rejects %j", (input) => {
    expect(parseDollarsToCents(input)).toBeNull();
  });
});

describe("centsToDollars", () => {
  it("formats integer cents as a plain dollar string", () => {
    expect(centsToDollars(1499)).toBe("14.99");
    expect(centsToDollars(3000)).toBe("30.00");
    expect(centsToDollars(5)).toBe("0.05");
  });
});
