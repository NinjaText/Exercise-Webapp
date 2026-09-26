import { describe, expect, it } from "vitest";
import {
  clampChroma,
  formatHex,
  oklch,
  parse,
  rgb,
  wcagContrast,
  type Color,
} from "culori";
import {
  BRAND_TOKEN_NAMES_DARK,
  BRAND_TOKEN_NAMES_LIGHT,
  deriveBrandTokens,
} from "../tokens";
import { BrandColorError } from "../types";
import { DEFAULT_PRIMARY_HEX } from "../defaults";

/**
 * Parses an emitted token string back into a culori color, so every contrast
 * assertion also exercises `fmtOklch`'s output (not the internal triple).
 */
function p(css: string): Color {
  const c = parse(css);
  if (!c) throw new Error(`culori could not parse emitted token "${css}"`);
  return c;
}

/**
 * Composites a translucent token (e.g. dark `brand-soft`,
 * `oklch(… / 14%)`) over an opaque surface the way a browser does: simple
 * source-over alpha blending in gamma-encoded sRGB. Written independently of
 * the implementation on purpose.
 */
function over(css: string, surfaceCss: string): Color {
  const top = rgb(p(css))!;
  const bottom = rgb(p(surfaceCss))!;
  const a = top.alpha ?? 1;
  return {
    mode: "rgb",
    r: top.r * a + bottom.r * (1 - a),
    g: top.g * a + bottom.g * (1 - a),
    b: top.b * a + bottom.b * (1 - a),
  };
}

const ratio = (a: Color, b: Color) => wcagContrast(a, b);

// Fixed (never-overridden) surfaces from app/globals.css.
const LIGHT_SIDEBAR_FOREGROUND = "oklch(0.92 0.01 264)";
const LIGHT_SIDEBAR_ACCENT_FOREGROUND = "oklch(0.95 0.01 264)";
const DARK_SIDEBAR_FOREGROUND = "oklch(0.985 0 0)";
const DARK_SIDEBAR_ACCENT_FOREGROUND = "oklch(0.985 0 0)";
const DARK_BACKGROUND = "oklch(0.145 0 0)";
const DARK_CARD = "oklch(0.205 0 0)";

/** Brief grid: hue 0..330 step 30 × l × c, gamut-clamped, as hex input. */
function gridHexes(): { hex: string; label: string }[] {
  const out: { hex: string; label: string }[] = [];
  for (let h = 0; h <= 330; h += 30) {
    for (const l of [0.3, 0.45, 0.6, 0.75]) {
      for (const c of [0.02, 0.12, 0.2]) {
        const clamped = clampChroma({ mode: "oklch", l, c, h }, "oklch");
        out.push({ hex: formatHex(clamped), label: `h=${h} l=${l} c=${c}` });
      }
    }
  }
  return out;
}

describe("deriveBrandTokens — whitelist", () => {
  it("emits exactly the spec §5.2 light token names, nothing extra or missing", () => {
    const t = deriveBrandTokens(DEFAULT_PRIMARY_HEX);
    expect(Object.keys(t.light)).toEqual([...BRAND_TOKEN_NAMES_LIGHT]);
  });

  it("emits exactly the spec §5.2 dark token names (no ring/accent/sidebar-border/sidebar-ring)", () => {
    const t = deriveBrandTokens(DEFAULT_PRIMARY_HEX);
    expect(Object.keys(t.dark)).toEqual([...BRAND_TOKEN_NAMES_DARK]);
    for (const omitted of [
      "ring",
      "accent",
      "accent-foreground",
      "sidebar-border",
      "sidebar-ring",
    ]) {
      expect(BRAND_TOKEN_NAMES_DARK as readonly string[]).not.toContain(omitted);
    }
  });

  it("never emits a never-overridable token", () => {
    const forbidden = [
      "background",
      "foreground",
      "card",
      "popover",
      "muted",
      "secondary",
      "border",
      "border-strong",
      "input",
      "destructive",
      "success",
      "info",
      "warning",
      "danger",
      "neutral",
      "chart-1",
      "chart-3",
      "chart-4",
      "chart-5",
      "sidebar-foreground",
      "sidebar-accent-foreground",
      "radius",
    ];
    const t = deriveBrandTokens("#1d4ed8");
    for (const name of [...Object.keys(t.light), ...Object.keys(t.dark)]) {
      expect(forbidden.some((f) => name === f || name.startsWith(`${f}-`))).toBe(
        false,
      );
    }
  });

  it("emits every value as a strict oklch() string", () => {
    const t = deriveBrandTokens("#1d4ed8");
    const re = /^oklch\(\d\.\d{3} \d\.\d{3} \d{1,3}\.\d{3}( \/ \d{1,3}%)?\)$/;
    for (const v of [...Object.values(t.light), ...Object.values(t.dark)]) {
      expect(v).toMatch(re);
    }
  });
});

describe("deriveBrandTokens — contrast invariants over the hue × l × c grid", () => {
  const grid = gridHexes();

  it.each(grid)("light set is WCAG-AA safe for $label ($hex)", ({ hex }) => {
    const t = deriveBrandTokens(hex).light;
    expect(ratio(p(t.primary), p(t["primary-foreground"]))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(p(t["sidebar-primary"]), p(t.sidebar))).toBeGreaterThanOrEqual(4.5);
    expect(
      ratio(p(t["sidebar-primary"]), p(t["sidebar-primary-foreground"])),
    ).toBeGreaterThanOrEqual(4.5);
    expect(ratio(p(t["brand-foreground"]), p(t["brand-soft"]))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(p(t["accent-foreground"]), p(t.accent))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(p(LIGHT_SIDEBAR_FOREGROUND), p(t.sidebar))).toBeGreaterThanOrEqual(4.5);
    expect(
      ratio(p(LIGHT_SIDEBAR_ACCENT_FOREGROUND), p(t["sidebar-accent"])),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it.each(grid)("dark set is WCAG-AA safe for $label ($hex)", ({ hex }) => {
    const t = deriveBrandTokens(hex).dark;
    expect(ratio(p(t.primary), p(t["primary-foreground"]))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(p(t["sidebar-primary"]), p(t.sidebar))).toBeGreaterThanOrEqual(4.5);
    expect(
      ratio(p(t["sidebar-primary"]), p(t["sidebar-primary-foreground"])),
    ).toBeGreaterThanOrEqual(4.5);
    // Dark brand-soft is translucent: measure it composited over both
    // surfaces it sits on.
    for (const surface of [DARK_BACKGROUND, DARK_CARD]) {
      expect(
        ratio(p(t["brand-foreground"]), over(t["brand-soft"], surface)),
      ).toBeGreaterThanOrEqual(4.5);
    }
    expect(ratio(p(DARK_SIDEBAR_FOREGROUND), p(t.sidebar))).toBeGreaterThanOrEqual(4.5);
    expect(
      ratio(p(DARK_SIDEBAR_ACCENT_FOREGROUND), p(t["sidebar-accent"])),
    ).toBeGreaterThanOrEqual(4.5);
  });
});

describe("deriveBrandTokens — reproduces the product's existing tokens", () => {
  const t = deriveBrandTokens(DEFAULT_PRIMARY_HEX);

  function near(
    css: string,
    target: { l: number; c: number; h: number },
    tol = { l: 0.02, c: 0.02, h: 3 },
  ) {
    const o = oklch(p(css))!;
    expect(Math.abs(o.l - target.l)).toBeLessThanOrEqual(tol.l);
    expect(Math.abs(o.c - target.c)).toBeLessThanOrEqual(tol.c);
    const dh = Math.abs((((o.h ?? 0) - target.h + 540) % 360) - 180);
    expect(dh).toBeLessThanOrEqual(tol.h);
  }

  it("--primary ≈ oklch(0.47 0.19 264)", () => {
    near(t.light.primary, { l: 0.47, c: 0.19, h: 264 });
  });
  it("--sidebar ≈ oklch(0.18 0.04 264)", () => {
    near(t.light.sidebar, { l: 0.18, c: 0.04, h: 264 });
  });
  it("--sidebar-gradient-end ≈ globals.css oklch(0.15 0.04 264) / dark oklch(0.12 0.03 264)", () => {
    near(t.light["sidebar-gradient-end"], { l: 0.15, c: 0.04, h: 264 });
    near(t.dark["sidebar-gradient-end"], { l: 0.12, c: 0.03, h: 264 });
  });
  it("--brand-soft ≈ oklch(0.95 0.03 264)", () => {
    near(t.light["brand-soft"], { l: 0.95, c: 0.03, h: 264 });
  });
  it("--sidebar-primary ≈ oklch(0.65 0.15 264)", () => {
    near(t.light["sidebar-primary"], { l: 0.65, c: 0.15, h: 264 });
  });
  it("does not adjust the product's own primary", () => {
    expect(t.meta.adjusted).toBe(false);
    expect(t.meta.primaryHex).toBe(DEFAULT_PRIMARY_HEX);
    expect(t.meta.primaryForeground).toBe("light");
  });
});

describe("deriveBrandTokens — adjustment reporting (spec §5.3)", () => {
  // Spec §5.3 only adjusts `primary` when BOTH white and oklch(0.13 0.02 H)
  // miss 4.5:1. The brief's example `#8ab4f8` does not qualify: near-black
  // on it is 9.55:1, so it keeps its color with dark text. `#337bba` sits in
  // the narrow band where white = 4.484:1 and near-black = 4.484:1 — it
  // genuinely triggers the adjust step.
  it("adjusts a color where neither white nor near-black reaches 4.5:1", () => {
    const t = deriveBrandTokens("#337bba");
    expect(t.meta.adjusted).toBe(true);
    expect(t.meta.adjustedFromHex).toBe("#337bba");
    expect(t.meta.inputHex).toBe("#337bba");
    expect(t.meta.primaryHex).not.toBe(t.meta.inputHex);
    expect(t.meta.primaryForeground).toBe("light");
    expect(t.meta.contrastOnPrimary).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps primary AA-safe across the narrow both-fail lightness band at every hue", () => {
    // The band where white and near-black both miss 4.5:1 is ~0.01 L wide
    // around L≈0.56–0.58, so the coarse grid never hits it. Sweep it densely.
    let adjustedCount = 0;
    for (let h = 0; h < 360; h += 15) {
      for (let l = 0.54; l <= 0.62; l += 0.002) {
        const hex = formatHex(clampChroma({ mode: "oklch", l, c: 0.1, h }, "oklch"));
        const t = deriveBrandTokens(hex);
        if (t.meta.adjusted) adjustedCount++;
        expect(
          ratio(p(t.light.primary), p(t.light["primary-foreground"])),
        ).toBeGreaterThanOrEqual(4.5);
        expect(t.meta.contrastOnPrimary).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(adjustedCount).toBeGreaterThan(0);
  });

  it("does not adjust the pastel #8ab4f8 — it passes with dark text", () => {
    const t = deriveBrandTokens("#8ab4f8");
    expect(t.meta.adjusted).toBe(false);
    expect(t.meta.adjustedFromHex).toBeUndefined();
    expect(t.meta.primaryHex).toBe("#8ab4f8");
    expect(t.meta.primaryForeground).toBe("dark");
    expect(t.meta.contrastOnPrimary).toBeGreaterThanOrEqual(4.5);
  });

  it("does not adjust #1d4ed8 (white passes)", () => {
    const t = deriveBrandTokens("#1d4ed8");
    expect(t.meta.adjusted).toBe(false);
    expect(t.meta.adjustedFromHex).toBeUndefined();
    expect(t.meta.primaryHex).toBe("#1d4ed8");
    expect(t.meta.primaryForeground).toBe("light");
  });

  it("normalizes the input hex into meta.inputHex", () => {
    expect(deriveBrandTokens(" #1D4ED8 ").meta.inputHex).toBe("#1d4ed8");
  });
});

describe("deriveBrandTokens — guardrail and validation", () => {
  it.each(["#050505", "#fafafa"])("throws BrandColorError(out-of-range) for %s", (hex) => {
    expect(() => deriveBrandTokens(hex)).toThrow(BrandColorError);
    try {
      deriveBrandTokens(hex);
    } catch (e) {
      expect((e as BrandColorError).code).toBe("out-of-range");
    }
  });

  it("throws BrandColorError(invalid-hex) for a non-hex string", () => {
    expect(() => deriveBrandTokens("blue")).toThrow(BrandColorError);
    try {
      deriveBrandTokens("blue");
    } catch (e) {
      expect((e as BrandColorError).code).toBe("invalid-hex");
    }
  });
});

describe("deriveBrandTokens — determinism", () => {
  it("returns deeply equal results for the same input", () => {
    expect(deriveBrandTokens("#337bba")).toEqual(deriveBrandTokens("#337bba"));
    expect(deriveBrandTokens("#1d4ed8")).toEqual(deriveBrandTokens("#1d4ed8"));
  });
});
