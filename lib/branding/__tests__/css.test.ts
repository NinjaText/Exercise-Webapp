import { describe, expect, it } from "vitest";
import {
  BRAND_TOKEN_NAMES_DARK,
  BRAND_TOKEN_NAMES_LIGHT,
  deriveBrandTokens,
} from "../tokens";
import { assertOklchLiteral, BRAND_CSS_RE, buildBrandCss } from "../css";
import type { BrandTokens } from "../types";

const SAMPLE_HEXES = ["#204ec3", "#1d4ed8", "#8ab4f8", "#e11d48", "#16a34a", "#777777", "#f59e0b"];

function clone(t: BrandTokens): BrandTokens {
  return { light: { ...t.light }, dark: { ...t.dark }, meta: { ...t.meta } };
}

function propertyNames(css: string, block: "light" | "dark"): string[] {
  const [lightBlock, darkBlock] = css.split(":root.dark");
  const src = block === "light" ? lightBlock : darkBlock;
  return [...src.matchAll(/--([a-z0-9-]+):/g)].map((m) => m[1]);
}

describe("buildBrandCss", () => {
  it.each(SAMPLE_HEXES)("output for %s matches BRAND_CSS_RE", (hex) => {
    const css = buildBrandCss(deriveBrandTokens(hex));
    expect(css).toMatch(BRAND_CSS_RE);
  });

  it("emits every whitelisted token once, in whitelist order, and nothing else", () => {
    const css = buildBrandCss(deriveBrandTokens("#1d4ed8"));
    expect(propertyNames(css, "light")).toEqual([...BRAND_TOKEN_NAMES_LIGHT]);
    expect(propertyNames(css, "dark")).toEqual([...BRAND_TOKEN_NAMES_DARK]);
  });

  it("starts with :root:not(.dark){ and has exactly one :root.dark block", () => {
    const css = buildBrandCss(deriveBrandTokens("#1d4ed8"));
    expect(css.startsWith(":root:not(.dark){--primary:oklch(")).toBe(true);
    expect(css.split(":root.dark{")).toHaveLength(2);
    expect(css.endsWith(";}")).toBe(true);
  });

  it("contains no dangerous sequences or whitespace other than single spaces inside oklch()", () => {
    const css = buildBrandCss(deriveBrandTokens("#1d4ed8"));
    for (const bad of ["<", ">", '"', "'", "\n", "\r", "\t", "/*", "*/", "url(", "expression(", "@", "\\", "!important"]) {
      expect(css).not.toContain(bad);
    }
  });

  it("uses the dark primary (lighter) in the dark block", () => {
    const t = deriveBrandTokens("#1d4ed8");
    const css = buildBrandCss(t);
    expect(css).toContain(`:root.dark{--primary:${t.dark.primary};`);
  });

  it("throws when a token value is an injection attempt", () => {
    const t = clone(deriveBrandTokens("#1d4ed8"));
    t.light.primary = "red; } body { display:none";
    expect(() => buildBrandCss(t)).toThrow();
  });

  it("throws when a dark token value is an injection attempt", () => {
    const t = clone(deriveBrandTokens("#1d4ed8"));
    t.dark["sidebar"] = "oklch(0.150 0.030 264.000)</style><script>alert(1)</script>";
    expect(() => buildBrandCss(t)).toThrow();
  });

  it("throws when a token is missing", () => {
    const t = clone(deriveBrandTokens("#1d4ed8"));
    delete (t.light as Record<string, string>)["ring"];
    expect(() => buildBrandCss(t)).toThrow();
  });

  it("throws when an unknown token name is present", () => {
    const t = clone(deriveBrandTokens("#1d4ed8"));
    (t.light as Record<string, string>)["background"] = "oklch(0.500 0.100 10.000)";
    expect(() => buildBrandCss(t)).toThrow();
    const d = clone(deriveBrandTokens("#1d4ed8"));
    (d.dark as Record<string, string>)["ring"] = "oklch(0.500 0.100 10.000)";
    expect(() => buildBrandCss(d)).toThrow();
  });
});

describe("assertOklchLiteral", () => {
  it.each([
    "oklch(0.470 0.190 264.000)",
    "oklch(1.000 0.000 0.000)",
    "oklch(0.000 0.000 359.999)",
    "oklch(0.600 0.150 12.345 / 14%)",
    "oklch(0.600 0.150 12.345 / 0%)",
    "oklch(0.600 0.150 12.345 / 100%)",
  ])("accepts %s", (v) => {
    expect(() => assertOklchLiteral(v)).not.toThrow();
  });

  it.each([
    "red",
    "",
    "oklch(0.47 0.19 264)",
    "oklch(0.470 0.190 264.000);",
    " oklch(0.470 0.190 264.000)",
    "oklch(0.470 0.190 264.000) ",
    "oklch(0.470  0.190 264.000)",
    "oklch(1.500 0.190 264.000)",
    "oklch(0.470 0.190 360.000)",
    "oklch(0.470 0.190 1000.000)",
    "oklch(0.470 0.190 264.000 / 101%)",
    "oklch(0.470 0.190 264.000 / 5.5%)",
    "oklch(0.470 0.190 264.000 / 007%)",
    "oklch(-0.470 0.190 264.000)",
    "oklch(0.470 0.190 NaN)",
    "oklch(0.470 0.190 264.000)\n",
    "oklch(0.470 0.190 264.000)}body{x:y",
  ])("rejects %j", (v) => {
    expect(() => assertOklchLiteral(v)).toThrow();
  });

  it("rejects non-strings", () => {
    expect(() => assertOklchLiteral(undefined)).toThrow();
    expect(() => assertOklchLiteral(0.5)).toThrow();
    expect(() => assertOklchLiteral(null)).toThrow();
  });
});

describe("BRAND_CSS_RE", () => {
  const good = buildBrandCss(deriveBrandTokens("#1d4ed8"));

  it("rejects an unknown property name", () => {
    expect(good.replace("--ring:", "--background:")).not.toMatch(BRAND_CSS_RE);
  });

  it("rejects a light-only token in the dark block", () => {
    const [light, dark] = good.split(":root.dark{");
    expect(`${light}:root.dark{--ring:oklch(0.500 0.100 10.000);${dark}`).not.toMatch(BRAND_CSS_RE);
  });

  it("rejects a missing dark block, trailing content and newlines", () => {
    expect(good.split(":root.dark{")[0]).not.toMatch(BRAND_CSS_RE);
    expect(`${good}body{display:none}`).not.toMatch(BRAND_CSS_RE);
    expect(`${good}\n`).not.toMatch(BRAND_CSS_RE);
    expect(good.replace(";}:root", ";}\n:root")).not.toMatch(BRAND_CSS_RE);
  });

  it("rejects a value with an injected token", () => {
    expect(good.replace("--primary:oklch(", "--primary:red;--x:oklch(")).not.toMatch(BRAND_CSS_RE);
  });
});
