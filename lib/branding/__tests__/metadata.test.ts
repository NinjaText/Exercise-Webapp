import { describe, it, expect } from "vitest";
import { DEFAULT_BRANDING, resolveBranding, type BrandingRecord } from "@/lib/branding/resolve";
import { PRODUCT_ICONS, brandIconsMetadata, brandViewport } from "@/lib/branding/metadata";

function record(overrides: Partial<BrandingRecord> = {}): BrandingRecord {
  return {
    clerkOrgId: "org_1",
    name: "Acme Physio",
    tagline: "Move better",
    brandingEnabled: true,
    brandDisplayName: "Acme",
    brandPrimaryColor: "#1d4ed8",
    brandLogoOnLightUrl: null,
    brandLogoOnDarkUrl: null,
    brandMarkUrl: null,
    brandFaviconUrl: null,
    brandAppleIconUrl: null,
    ...overrides,
  };
}

const ASSET = "https://assets.example.com/branding/org_teal";

describe("PRODUCT_ICONS (root layout)", () => {
  it("declares the product favicon via config, not the app/ file convention", () => {
    expect(PRODUCT_ICONS).toEqual({ icon: [{ url: "/favicon.ico", sizes: "any" }] });
  });
});

describe("brandIconsMetadata (platform layout)", () => {
  it("omits the icons key entirely when unbranded so the root icons are inherited", () => {
    // Next merges per key present (`for key in metadata`); `icons: undefined`
    // would resolve to null and wipe the root favicon.
    const out = brandIconsMetadata(DEFAULT_BRANDING);
    expect(out).toEqual({});
    expect("icons" in out).toBe(false);
  });

  it("omits icons when branding is on but no favicon was uploaded", () => {
    expect("icons" in brandIconsMetadata({ ...DEFAULT_BRANDING, enabled: true })).toBe(false);
  });

  it("returns a full replacement (no product favicon) when branded", () => {
    const out = brandIconsMetadata({
      ...DEFAULT_BRANDING,
      enabled: true,
      faviconUrl: `${ASSET}/x-favicon-32.png`,
      appleIconUrl: `${ASSET}/x-apple-180.png`,
    });
    expect(out).toEqual({
      icons: {
        icon: [{ url: `${ASSET}/x-favicon-32.png`, sizes: "32x32", type: "image/png" }],
        apple: [{ url: `${ASSET}/x-apple-180.png`, sizes: "180x180" }],
      },
    });
    expect(JSON.stringify(out)).not.toContain("/favicon.ico");
  });

  it("leaves apple undefined when only the favicon exists", () => {
    const out = brandIconsMetadata({
      ...DEFAULT_BRANDING,
      enabled: true,
      faviconUrl: `${ASSET}/x-favicon-32.png`,
    });
    expect(out.icons).toEqual({
      icon: [{ url: `${ASSET}/x-favicon-32.png`, sizes: "32x32", type: "image/png" }],
      apple: undefined,
    });
  });
});

describe("brandViewport (platform layout generateViewport)", () => {
  it("omits themeColor entirely for an unbranded org", () => {
    const out = brandViewport(DEFAULT_BRANDING);
    expect(out).toEqual({});
    expect("themeColor" in out).toBe(false);
  });

  it("omits themeColor when branding is enabled but no brand color was set (tokens null)", () => {
    const b = resolveBranding(record({ brandPrimaryColor: null }));
    expect(b.tokens).toBeNull();
    const out = brandViewport(b);
    expect(out).toEqual({});
    expect("themeColor" in out).toBe(false);
  });

  it("returns themeColor only when branding is enabled and a color produced tokens", () => {
    const b = resolveBranding(record());
    expect(b.tokens).not.toBeNull();
    expect(brandViewport(b)).toEqual({ themeColor: b.themeColor });
  });
});
