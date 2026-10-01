import { describe, it, expect } from "vitest";
import { priceFormField, priceSummary } from "../price-fields";

describe("priceFormField", () => {
  it("pre-fills a USD monthly price as dollars", () => {
    expect(priceFormField({ status: "ok", amountCents: 1499, label: "$14.99/mo", usdMonthly: true })).toEqual({
      amount: "14.99",
    });
  });
  it("leaves the field empty with a keep note when Stripe couldn't be read", () => {
    expect(priceFormField({ status: "unavailable" })).toEqual({
      amount: "",
      note: "Couldn't load the current price from Stripe. Leave empty to keep it unchanged, or enter a new amount.",
    });
  });
  it("leaves a non-USD/monthly price empty with a keep note naming it", () => {
    const f = priceFormField({ status: "ok", amountCents: 10000, label: "$100.00/year", usdMonthly: false });
    expect(f.amount).toBe("");
    expect(f.note).toContain("$100.00/year");
  });
  it("a tiered/custom price: empty field with a replace note, not 'couldn't load'", () => {
    expect(priceFormField({ status: "unsupported" })).toEqual({
      amount: "",
      note: "Current Stripe price isn't a simple monthly amount — enter one to replace it.",
    });
  });
  it("no price: empty field, no note (empty means none)", () => {
    expect(priceFormField({ status: "none" })).toEqual({ amount: "" });
  });
});

describe("priceSummary", () => {
  it.each([
    [{ status: "ok", amountCents: 1499, label: "$14.99/mo", usdMonthly: true }, "$14.99/mo"],
    [{ status: "none" }, "—"],
    [{ status: "unavailable" }, "Unavailable"],
    [{ status: "unsupported" }, "Custom"],
  ] as const)("%j -> %s", (view, text) => {
    expect(priceSummary(view)).toBe(text);
  });
});
