import { describe, it, expect } from "vitest";
import { brandColorErrorMessage, deriveBrandTokens, isUsableBrandColor } from "../tokens";
import { BrandColorError } from "../types";

describe("isUsableBrandColor", () => {
  it("treats null (use the default color) as usable", () => {
    expect(isUsableBrandColor(null)).toBe(true);
  });

  it("accepts a color that passes as-is", () => {
    expect(isUsableBrandColor("#1d4ed8")).toBe(true);
  });

  it("accepts a color the engine only has to adjust", () => {
    expect(isUsableBrandColor("#337bba")).toBe(true);
  });

  it("rejects near-white and near-black colors (the lightness guardrail)", () => {
    expect(isUsableBrandColor("#fafafa")).toBe(false);
    expect(isUsableBrandColor("#050505")).toBe(false);
  });

  it("rejects an unparseable value", () => {
    expect(isUsableBrandColor("not-a-color")).toBe(false);
  });
});

describe("brandColorErrorMessage", () => {
  it("is null for a usable color or null", () => {
    expect(brandColorErrorMessage(null)).toBeNull();
    expect(brandColorErrorMessage("#1d4ed8")).toBeNull();
    expect(brandColorErrorMessage("#337bba")).toBeNull();
  });

  it("returns the engine's BrandColorError message for a guardrail failure", () => {
    let thrown: unknown;
    try {
      deriveBrandTokens("#fafafa");
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(BrandColorError);
    expect(brandColorErrorMessage("#fafafa")).toBe((thrown as BrandColorError).message);
  });

  it("returns the invalid-hex message for an unparseable value", () => {
    expect(brandColorErrorMessage("not-a-color")).toBe(new BrandColorError("invalid-hex").message);
  });
});
