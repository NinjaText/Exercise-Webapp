import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { contrast, hexToOklch, WHITE } from "@/lib/branding/color";
import { DEFAULT_BRANDING } from "@/lib/branding/resolve";
import { deriveBrandTokens } from "@/lib/branding/tokens";
import type { ResolvedBranding } from "@/lib/branding/types";
import { pdfTextAccent, resolvePdfBranding } from "../pdf-branding";

const R2 = "https://cdn.example.com";
const OWN_LOGO = `${R2}/branding/org_1/logo-on-light-abc.png`;

const org = { name: "Acme Physio", tagline: "Move better, live better" };

function enabled(overrides: Partial<ResolvedBranding> = {}): ResolvedBranding {
  return {
    ...DEFAULT_BRANDING,
    enabled: true,
    orgId: "clerk_org_1",
    displayName: "Acme Brand",
    tagline: "Move better, live better",
    primaryHex: "#1d4ed8",
    // A color was set and produced tokens — only presence is read by
    // `resolvePdfBranding`, so this doesn't need to match `primaryHex`.
    tokens: deriveBrandTokens("#1d4ed8"),
    logoOnLightUrl: OWN_LOGO,
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubEnv("CLOUDFLARE_R2_PUBLIC_URL", R2);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolvePdfBranding", () => {
  it("returns no name, tagline, logo or accent when there is no org and branding is off", () => {
    expect(resolvePdfBranding(null, DEFAULT_BRANDING)).toEqual({
      organizationName: undefined,
      tagline: undefined,
      logoUrl: null,
      accentHex: null,
    });
  });

  it("keeps the organization's own name and tagline when branding is disabled (never INMOTUS RX)", () => {
    const result = resolvePdfBranding(org, DEFAULT_BRANDING);
    expect(result.organizationName).toBe("Acme Physio");
    expect(result.tagline).toBe("Move better, live better");
    expect(result.organizationName).not.toBe(DEFAULT_BRANDING.displayName);
  });

  it("uses no logo and no accent (product look) when branding is disabled", () => {
    const result = resolvePdfBranding(org, DEFAULT_BRANDING);
    expect(result.logoUrl).toBeNull();
    expect(result.accentHex).toBeNull();
  });

  it("maps a null tagline to undefined", () => {
    expect(resolvePdfBranding({ ...org, tagline: null }, DEFAULT_BRANDING).tagline).toBeUndefined();
  });

  it("uses displayName, the own-asset logo and the accent when branding is enabled", () => {
    expect(resolvePdfBranding(org, enabled())).toEqual({
      organizationName: "Acme Brand",
      tagline: "Move better, live better",
      logoUrl: OWN_LOGO,
      accentHex: "#1d4ed8",
    });
  });

  it("takes the tagline from the organization row when branding is enabled", () => {
    const result = resolvePdfBranding({ ...org, tagline: "Row tagline" }, enabled({ tagline: null }));
    expect(result.tagline).toBe("Row tagline");
  });

  it("falls back to the resolved tagline when the org row is missing", () => {
    expect(resolvePdfBranding(null, enabled()).tagline).toBe("Move better, live better");
  });

  it("never uses an external (legacy Clerk) logo URL", () => {
    const result = resolvePdfBranding(
      org,
      enabled({ logoOnLightUrl: "https://img.clerk.com/legacy-logo.png" }),
    );
    expect(result.logoUrl).toBeNull();
  });

  it("uses no logo when branding is enabled but no logo is uploaded", () => {
    expect(resolvePdfBranding(org, enabled({ logoOnLightUrl: null })).logoUrl).toBeNull();
  });

  it("darkens a low-contrast accent so it is readable as text on white", () => {
    const result = resolvePdfBranding(org, enabled({ primaryHex: "#f59e0b" }));
    expect(result.accentHex).not.toBe("#f59e0b");
    expect(result.accentHex).toMatch(/^#[0-9a-f]{6}$/);
    expect(contrast(hexToOklch(result.accentHex!), WHITE)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the document's default accent (null) when branding is enabled but no color was set", () => {
    const result = resolvePdfBranding(org, enabled({ tokens: null }));
    expect(result.accentHex).toBeNull();
    // Name, tagline and logo are unaffected — only the accent is withheld.
    expect(result.organizationName).toBe("Acme Brand");
    expect(result.logoUrl).toBe(OWN_LOGO);
  });
});

describe("pdfTextAccent", () => {
  it("returns an accent that already passes 4.5:1 on white unchanged", () => {
    expect(pdfTextAccent("#1d4ed8")).toBe("#1d4ed8");
  });

  it("darkens a light accent until the hex itself reaches 4.5:1 on white", () => {
    for (const hex of ["#f59e0b", "#22c55e", "#38bdf8", "#ec4899"]) {
      const out = pdfTextAccent(hex);
      expect(out).toMatch(/^#[0-9a-f]{6}$/);
      expect(contrast(hexToOklch(out!), WHITE)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps the accent's hue family when darkening", () => {
    const before = hexToOklch("#22c55e");
    const after = hexToOklch(pdfTextAccent("#22c55e")!);
    expect(Math.abs(after.h - before.h)).toBeLessThan(10);
    expect(after.l).toBeLessThan(before.l);
  });

  it("returns null for an unparseable value", () => {
    expect(pdfTextAccent("oklch(0.5 0.1 200)")).toBeNull();
    expect(pdfTextAccent("not-a-color")).toBeNull();
  });
});
