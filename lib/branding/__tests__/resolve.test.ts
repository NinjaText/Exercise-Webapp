import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BRAND_CSS_RE } from "../css";
import { DEFAULT_DISPLAY_NAME, DEFAULT_PRIMARY_HEX } from "../defaults";
import {
  BRANDING_SELECT,
  DEFAULT_BRANDING,
  resolveBranding,
  type BrandingRecord,
} from "../resolve";
import { deriveBrandTokens } from "../tokens";

const R2 = "https://assets.example-r2.dev";

function record(overrides: Partial<BrandingRecord> = {}): BrandingRecord {
  return {
    clerkOrgId: "org_1",
    name: "Acme Physio",
    tagline: "Move better",
    brandingEnabled: true,
    brandDisplayName: "Acme",
    brandPrimaryColor: "#1d4ed8",
    brandLogoOnLightUrl: `${R2}/branding/org_1/logo-on-light-1.png`,
    brandLogoOnDarkUrl: `${R2}/branding/org_1/logo-on-dark-1.png`,
    brandMarkUrl: `${R2}/branding/org_1/mark-1.png`,
    brandFaviconUrl: `${R2}/branding/org_1/favicon-1.png`,
    brandAppleIconUrl: `${R2}/branding/org_1/apple-icon-1.png`,
    ...overrides,
  };
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubEnv("CLOUDFLARE_R2_PUBLIC_URL", R2);
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  warn.mockRestore();
});

describe("DEFAULT_BRANDING", () => {
  it("is the product default with no style emitted", () => {
    expect(DEFAULT_BRANDING).toEqual({
      enabled: false,
      orgId: null,
      displayName: DEFAULT_DISPLAY_NAME,
      tagline: null,
      primaryHex: DEFAULT_PRIMARY_HEX,
      logoOnLightUrl: null,
      logoOnDarkUrl: null,
      markUrl: null,
      faviconUrl: null,
      appleIconUrl: null,
      tokens: null,
      css: null,
      themeColor: DEFAULT_PRIMARY_HEX,
    });
  });

  it("is frozen", () => {
    expect(Object.isFrozen(DEFAULT_BRANDING)).toBe(true);
  });
});

describe("BRANDING_SELECT", () => {
  it("selects exactly the BrandingRecord fields", () => {
    expect(Object.keys(BRANDING_SELECT).sort()).toEqual(Object.keys(record()).sort());
    expect(Object.values(BRANDING_SELECT).every((v) => v === true)).toBe(true);
  });
});

describe("resolveBranding", () => {
  it("null → defaults", () => {
    expect(resolveBranding(null)).toEqual(DEFAULT_BRANDING);
  });

  it("brandingEnabled=false with everything set → defaults", () => {
    expect(resolveBranding(record({ brandingEnabled: false }))).toEqual(DEFAULT_BRANDING);
  });

  it("enabled + valid color → derived tokens, css, names and own-bucket logos", () => {
    const r = resolveBranding(record());
    const expected = deriveBrandTokens("#1d4ed8");
    expect(r.enabled).toBe(true);
    expect(r.orgId).toBe("org_1");
    expect(r.displayName).toBe("Acme");
    expect(r.tagline).toBe("Move better");
    expect(r.tokens).toEqual(expected);
    expect(r.css).not.toBeNull();
    expect(r.css).toMatch(BRAND_CSS_RE);
    expect(r.css).toContain(expected.light.primary);
    expect(r.primaryHex).toBe(expected.meta.primaryHex);
    expect(r.themeColor).toBe(expected.meta.primaryHex);
    expect(r.logoOnLightUrl).toBe(`${R2}/branding/org_1/logo-on-light-1.png`);
    expect(r.logoOnDarkUrl).toBe(`${R2}/branding/org_1/logo-on-dark-1.png`);
    expect(r.markUrl).toBe(`${R2}/branding/org_1/mark-1.png`);
    expect(r.faviconUrl).toBe(`${R2}/branding/org_1/favicon-1.png`);
    expect(r.appleIconUrl).toBe(`${R2}/branding/org_1/apple-icon-1.png`);
    expect(warn).not.toHaveBeenCalled();
  });

  it("displayName falls back to name when brandDisplayName is null or blank", () => {
    expect(resolveBranding(record({ brandDisplayName: null })).displayName).toBe("Acme Physio");
    expect(resolveBranding(record({ brandDisplayName: "   " })).displayName).toBe("Acme Physio");
  });

  it("displayName falls back to the product name when both are blank", () => {
    expect(resolveBranding(record({ brandDisplayName: null, name: "" })).displayName).toBe(
      DEFAULT_DISPLAY_NAME,
    );
  });

  it("tagline null/blank → null", () => {
    expect(resolveBranding(record({ tagline: null })).tagline).toBeNull();
    expect(resolveBranding(record({ tagline: "  " })).tagline).toBeNull();
  });

  it("enabled + invalid hex → no tokens/css (product look), enabled stays true, warns, name/logos still apply", () => {
    const r = resolveBranding(record({ brandPrimaryColor: "#zzzzzz" }));
    expect(r.enabled).toBe(true);
    expect(r.tokens).toBeNull();
    expect(r.css).toBeNull();
    expect(r.primaryHex).toBe(DEFAULT_PRIMARY_HEX);
    expect(r.themeColor).toBe(DEFAULT_PRIMARY_HEX);
    expect(r.displayName).toBe("Acme");
    expect(r.logoOnLightUrl).not.toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("enabled + out-of-guardrail color (hand-edited row) → no tokens/css, never throws", () => {
    let r!: ReturnType<typeof resolveBranding>;
    expect(() => {
      r = resolveBranding(record({ brandPrimaryColor: "#fafafa" }));
    }).not.toThrow();
    expect(r.enabled).toBe(true);
    expect(r.tokens).toBeNull();
    expect(r.css).toBeNull();
    expect(r.primaryHex).toBe(DEFAULT_PRIMARY_HEX);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("enabled + absent color → no tokens/css (product look from globals.css), without warning", () => {
    const r = resolveBranding(record({ brandPrimaryColor: null }));
    expect(r.enabled).toBe(true);
    expect(r.tokens).toBeNull();
    expect(r.css).toBeNull();
    expect(r.primaryHex).toBe(DEFAULT_PRIMARY_HEX);
    expect(r.themeColor).toBe(DEFAULT_PRIMARY_HEX);
    expect(warn).not.toHaveBeenCalled();
  });

  it("an external logo URL resolves to null", () => {
    const r = resolveBranding(record({ brandLogoOnLightUrl: "https://example.com/logo.png" }));
    expect(r.logoOnLightUrl).toBeNull();
    expect(r.logoOnDarkUrl).not.toBeNull();
  });

  it("all asset URLs resolve to null when R2 public URL is unset", () => {
    vi.stubEnv("CLOUDFLARE_R2_PUBLIC_URL", "");
    const r = resolveBranding(record());
    expect(r.logoOnLightUrl).toBeNull();
    expect(r.logoOnDarkUrl).toBeNull();
    expect(r.markUrl).toBeNull();
    expect(r.faviconUrl).toBeNull();
    expect(r.appleIconUrl).toBeNull();
  });
});
