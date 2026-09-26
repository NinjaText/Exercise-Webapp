import { describe, expect, it } from "vitest";
import {
  HEX_RE,
  NEAR_BLACK,
  WHITE,
  adjustLightnessUntil,
  contrast,
  fmtOklch,
  hexToOklch,
  inGuardrail,
  normalizeHex,
  oklchToHex,
  pickForeground,
} from "../color";
import type { Oklch } from "../types";

describe("HEX_RE", () => {
  it("matches a lowercase 6-digit hex", () => {
    expect(HEX_RE.test("#4f46e5")).toBe(true);
  });

  it("rejects uppercase, short, and unprefixed hex", () => {
    expect(HEX_RE.test("#4F46E5")).toBe(false);
    expect(HEX_RE.test("#abc")).toBe(false);
    expect(HEX_RE.test("4f46e5")).toBe(false);
  });
});

describe("normalizeHex", () => {
  it("lower-cases an uppercase 3-digit hex and expands it", () => {
    expect(normalizeHex("#ABC")).toBe("#aabbcc");
  });

  it("trims whitespace and lower-cases a valid 6-digit hex", () => {
    expect(normalizeHex(" #4f46e5 ")).toBe("#4f46e5");
  });

  it("rejects a hex missing its # prefix", () => {
    expect(normalizeHex("4f46e5")).toBeNull();
  });

  it("rejects invalid hex characters", () => {
    expect(normalizeHex("#ggg")).toBeNull();
  });
});

describe("hexToOklch", () => {
  it("maps white to l ≈ 1", () => {
    expect(hexToOklch("#ffffff").l).toBeCloseTo(1, 5);
  });

  it("maps black to l ≈ 0", () => {
    expect(hexToOklch("#000000").l).toBeCloseTo(0, 5);
  });

  it("maps the brand indigo to its real hue (~277, not the eyeballed ~264)", () => {
    // culori: hexToOklch("#4f46e5") === oklch(0.5106 0.2301 276.97), verified
    // against Tailwind v4's own indigo-600 (oklch(0.511 0.262 276.966)) as a
    // cross-check that culori's sRGB->OKLCH conversion is correct.
    const { h } = hexToOklch("#4f46e5");
    expect(h).toBeGreaterThan(270);
    expect(h).toBeLessThan(280);
  });

  it("defaults h to 0 for an achromatic color", () => {
    expect(hexToOklch("#808080").h).toBe(0);
  });
});

describe("oklchToHex", () => {
  it("round-trips a gamut-safe color back to its hex", () => {
    expect(oklchToHex(hexToOklch("#204ec3"))).toBe("#204ec3");
  });
});

describe("contrast", () => {
  it("is ≈ 21 between pure black and pure white", () => {
    const black = hexToOklch("#000000");
    const white = hexToOklch("#ffffff");
    expect(contrast(black, white)).toBeCloseTo(21, 1);
  });
});

describe("pickForeground", () => {
  it("picks white (light) foreground for a dark, saturated blue", () => {
    const result = pickForeground(hexToOklch("#1d4ed8"));
    expect(result).not.toBeNull();
    expect(result?.kind).toBe("light");
    expect(result?.fg).toEqual(WHITE);
    expect(result?.ratio).toBeGreaterThanOrEqual(4.5);
  });

  it("picks near-black (dark) foreground for a light yellow", () => {
    const result = pickForeground(hexToOklch("#fde047"));
    expect(result).not.toBeNull();
    expect(result?.kind).toBe("dark");
    expect(result?.ratio).toBeGreaterThanOrEqual(4.5);
  });

  it("returns null for a verified mid-tone that fails both white and near-black at 4.5", () => {
    // #8ab4f8 (the brief's original guess for a color that "fails both")
    // does NOT actually fail both: contrast against white is 2.107 (fails)
    // but contrast against NEAR_BLACK is 9.547 (passes) — so it resolves to
    // a "dark" foreground, not null. Verified numerically instead:
    // hexToOklch("#42808a") -> oklch(0.5625 0.0657 209.10), whose contrast
    // against white is 4.4811 and against NEAR_BLACK(209.10) is 4.4803 —
    // both just under the 4.5 threshold, so pickForeground must return null.
    const bg = hexToOklch("#42808a");
    expect(contrast(bg, WHITE)).toBeLessThan(4.5);
    expect(contrast(bg, NEAR_BLACK(bg.h))).toBeLessThan(4.5);
    expect(pickForeground(bg)).toBeNull();
  });
});

describe("adjustLightnessUntil", () => {
  it("darkens a failing pastel until it reaches ≥ 4.5 against white, within 60 steps", () => {
    const pastel = hexToOklch("#8ab4f8");
    expect(contrast(pastel, WHITE)).toBeLessThan(4.5);

    const { color, steps } = adjustLightnessUntil(pastel, WHITE, 4.5, "darker");

    expect(steps).toBeGreaterThan(0);
    expect(steps).toBeLessThanOrEqual(60);
    expect(contrast(color, WHITE)).toBeGreaterThanOrEqual(4.5);
  });

  it("returns steps === 0 for a color that already passes", () => {
    const passing = hexToOklch("#1d4ed8");
    expect(contrast(passing, WHITE)).toBeGreaterThanOrEqual(4.5);

    const { color, steps } = adjustLightnessUntil(passing, WHITE, 4.5, "darker");

    expect(steps).toBe(0);
    expect(color).toEqual(passing);
  });
});

describe("inGuardrail", () => {
  it("accepts lightness within [0.25, 0.80]", () => {
    expect(inGuardrail({ l: 0.25, c: 0.1, h: 0 })).toBe(true);
    expect(inGuardrail({ l: 0.8, c: 0.1, h: 0 })).toBe(true);
    expect(inGuardrail({ l: 0.5, c: 0.1, h: 0 })).toBe(true);
  });

  it("rejects near-black and near-white lightness", () => {
    expect(inGuardrail({ l: 0.1, c: 0.1, h: 0 })).toBe(false);
    expect(inGuardrail({ l: 0.95, c: 0.1, h: 0 })).toBe(false);
  });
});

describe("fmtOklch", () => {
  const FORMAT_RE = /^oklch\(\d\.\d{3} \d\.\d{3} \d{1,3}\.\d{3}( \/ \d{1,3}%)?\)$/;

  it("formats without alpha", () => {
    const out = fmtOklch({ l: 0.47, c: 0.19, h: 264 });
    expect(out).toBe("oklch(0.470 0.190 264.000)");
    expect(out).toMatch(FORMAT_RE);
  });

  it("formats with an alpha percentage", () => {
    const out = fmtOklch({ l: 0.15, c: 0.04, h: 264 }, 14);
    expect(out).toBe("oklch(0.150 0.040 264.000 / 14%)");
    expect(out).toMatch(FORMAT_RE);
  });

  it("never emits NaN or exponential notation, even when h is undefined", () => {
    const broken = { l: 0.5, c: 0.1, h: undefined } as unknown as Oklch;
    const out = fmtOklch(broken);
    expect(out).not.toContain("NaN");
    expect(out).not.toContain("e-");
    expect(out).toMatch(FORMAT_RE);
  });

  it("normalizes a negative hue into [0, 360)", () => {
    const out = fmtOklch({ l: 0.5, c: 0.1, h: -10 });
    expect(out).toBe("oklch(0.500 0.100 350.000)");
    expect(out).toMatch(FORMAT_RE);
  });

  it("wraps a hue that rounds up to 360.000 back to 0.000", () => {
    // 359.9996 is already < 360, but toFixed(3) alone would round the
    // display string up to "360.000" — fmtOklch must catch that and print
    // 0.000, since its own contract (and FORMAT_RE) says hue is < 360.
    const out = fmtOklch({ l: 0.5, c: 0.1, h: 359.9996 });
    expect(out).toBe("oklch(0.500 0.100 0.000)");
    expect(out).toMatch(FORMAT_RE);
  });

  it("treats a NaN alpha as omitted (no alpha suffix)", () => {
    const out = fmtOklch({ l: 0.5, c: 0.1, h: 264 }, NaN);
    expect(out).toBe("oklch(0.500 0.100 264.000)");
    expect(out).not.toContain("NaN");
    expect(out).toMatch(FORMAT_RE);
  });

  it("treats an Infinity alpha as omitted (no alpha suffix)", () => {
    const out = fmtOklch({ l: 0.5, c: 0.1, h: 264 }, Infinity);
    expect(out).toBe("oklch(0.500 0.100 264.000)");
    expect(out).not.toContain("Infinity");
    expect(out).toMatch(FORMAT_RE);
  });

  it("rounds a fractional alpha to the nearest integer percent", () => {
    const out = fmtOklch({ l: 0.5, c: 0.1, h: 264 }, 14.6789);
    expect(out).toBe("oklch(0.500 0.100 264.000 / 15%)");
    expect(out).toMatch(FORMAT_RE);
  });

  it("clamps a negative alpha to 0%", () => {
    const out = fmtOklch({ l: 0.5, c: 0.1, h: 264 }, -5);
    expect(out).toBe("oklch(0.500 0.100 264.000 / 0%)");
    expect(out).toMatch(FORMAT_RE);
  });

  it("clamps an alpha over 100 to 100%", () => {
    const out = fmtOklch({ l: 0.5, c: 0.1, h: 264 }, 150);
    expect(out).toBe("oklch(0.500 0.100 264.000 / 100%)");
    expect(out).toMatch(FORMAT_RE);
  });
});
