import { describe, it, expect } from "vitest";
import {
  hexColorSchema,
  displayNameSchema,
  brandingSettingsSchema,
  assetKindSchema,
} from "../branding";

describe("hexColorSchema", () => {
  it("accepts a 6-digit hex and normalizes to lower-case", () => {
    const result = hexColorSchema.safeParse("#1D4ED8");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("#1d4ed8");
  });

  it("accepts a 3-digit shorthand hex and expands it", () => {
    const result = hexColorSchema.safeParse("#abc");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("#aabbcc");
  });

  it("trims whitespace before validating", () => {
    const result = hexColorSchema.safeParse("  #1d4ed8  ");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("#1d4ed8");
  });

  it("rejects an invalid hex string", () => {
    const result = hexColorSchema.safeParse("not-a-color");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Enter a color like #1d4ed8");
    }
  });

  it("rejects a hex string with the wrong number of digits", () => {
    const result = hexColorSchema.safeParse("#1d4ed");
    expect(result.success).toBe(false);
  });

  it("rejects a hex string with invalid characters", () => {
    const result = hexColorSchema.safeParse("#gggggg");
    expect(result.success).toBe(false);
  });
});

describe("displayNameSchema", () => {
  it("accepts a normal display name", () => {
    const result = displayNameSchema.safeParse("Acme Fitness");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("Acme Fitness");
  });

  it("trims surrounding whitespace", () => {
    const result = displayNameSchema.safeParse("  Acme Fitness  ");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("Acme Fitness");
  });

  it("rejects an empty string with a friendly message", () => {
    const result = displayNameSchema.safeParse("");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Enter a display name");
    }
  });

  it("rejects a string that is only whitespace", () => {
    const result = displayNameSchema.safeParse("   ");
    expect(result.success).toBe(false);
  });

  it("accepts a name at the 60 character limit", () => {
    const result = displayNameSchema.safeParse("a".repeat(60));
    expect(result.success).toBe(true);
  });

  it("rejects a name over the 60 character limit with a friendly message", () => {
    const result = displayNameSchema.safeParse("a".repeat(61));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Keep it to 60 characters or fewer");
    }
  });

  it("rejects control characters", () => {
    const result = displayNameSchema.safeParse("Acme\u0007Fitness");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("No control or formatting characters");
    }
  });

  it.each([
    ["U+202E right-to-left override", "Acme\u202EFitness"],
    ["U+200B zero-width space", "Acme\u200BFitness"],
    ["U+FEFF byte-order mark", "Acme\uFEFFFitness"],
    ["U+2066 left-to-right isolate", "Acme\u2066Fitness"],
  ])("rejects Unicode format characters (%s)", (_label, value) => {
    const result = displayNameSchema.safeParse(value);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("No control or formatting characters");
    }
  });

  it.each([
    ["woman lifting weights", "Lift Club \u{1F3CB}\uFE0F\u200D\u2640\uFE0F"],
    ["family", "Family Fit \u{1F468}\u200D\u{1F469}\u200D\u{1F467}"],
  ])("keeps joined (U+200D ZWJ) emoji (%s)", (_label, value) => {
    expect(value).toContain("\u200D");
    expect(displayNameSchema.safeParse(value).success).toBe(true);
  });

  it.each([
    ["only ZWJs", "\u200D\u200D"],
    ["ZWJ between spaces", " \u200D "],
  ])("rejects a name with nothing visible (%s)", (_label, value) => {
    const result = displayNameSchema.safeParse(value);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Enter a display name");
    }
  });

  it("still keeps a lone joined emoji", () => {
    expect(displayNameSchema.safeParse("\u{1F3CB}\uFE0F\u200D\u2640\uFE0F").success).toBe(true);
  });

  it("keeps emoji with a variation selector (U+FE0F is Mn, not Cf)", () => {
    expect("🏋️").toContain("\uFE0F");
    const result = displayNameSchema.safeParse("Lift Club 🏋️");
    expect(result.success).toBe(true);
  });
});

describe("brandingSettingsSchema", () => {
  const base = {
    brandingEnabled: true,
    brandDisplayName: "Acme Fitness",
    brandPrimaryColor: "#1d4ed8",
  };

  it("accepts a fully populated valid object", () => {
    const result = brandingSettingsSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        brandingEnabled: true,
        brandDisplayName: "Acme Fitness",
        brandPrimaryColor: "#1d4ed8",
      });
    }
  });

  it("accepts null for brandDisplayName and brandPrimaryColor", () => {
    const result = brandingSettingsSchema.safeParse({
      brandingEnabled: false,
      brandDisplayName: null,
      brandPrimaryColor: null,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.brandDisplayName).toBeNull();
      expect(result.data.brandPrimaryColor).toBeNull();
    }
  });

  it("rejects a missing brandingEnabled", () => {
    const result = brandingSettingsSchema.safeParse({
      brandDisplayName: "Acme",
      brandPrimaryColor: "#1d4ed8",
    });
    expect(result.success).toBe(false);
  });

  it("strips unknown keys instead of rejecting", () => {
    const result = brandingSettingsSchema.safeParse({
      ...base,
      unknownField: "should be stripped",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("unknownField");
    }
  });

  it("rejects an invalid hex within the composed schema", () => {
    const result = brandingSettingsSchema.safeParse({
      ...base,
      brandPrimaryColor: "not-a-color",
    });
    expect(result.success).toBe(false);
  });
});

describe("assetKindSchema", () => {
  it("accepts each of the three valid kinds", () => {
    for (const kind of ["logo-on-light", "logo-on-dark", "mark"]) {
      expect(assetKindSchema.safeParse(kind).success).toBe(true);
    }
  });

  it("rejects an unknown kind", () => {
    const result = assetKindSchema.safeParse("banner");
    expect(result.success).toBe(false);
  });
});
