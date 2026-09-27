import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BRAND_CSS_RE } from "@/lib/branding/css";
import { resolveBranding, type BrandingRecord } from "@/lib/branding/resolve";
import { BrandStyle } from "../brand-style";

const TEAL: BrandingRecord = {
  clerkOrgId: "org_teal",
  name: "Teal Physio",
  tagline: null,
  brandingEnabled: true,
  brandDisplayName: null,
  brandPrimaryColor: "#0f766e",
  brandLogoOnLightUrl: null,
  brandLogoOnDarkUrl: null,
  brandMarkUrl: null,
  brandFaviconUrl: null,
  brandAppleIconUrl: null,
};

describe("BrandStyle", () => {
  it("renders nothing for product defaults", () => {
    expect(renderToStaticMarkup(<BrandStyle branding={resolveBranding(null)} />)).toBe("");
  });

  it("renders nothing when branding is disabled", () => {
    const off = resolveBranding({ ...TEAL, brandingEnabled: false });
    expect(renderToStaticMarkup(<BrandStyle branding={off} />)).toBe("");
  });

  it("emits <style id=\"org-brand\"> whose content passes BRAND_CSS_RE", () => {
    const branding = resolveBranding(TEAL);
    const html = renderToStaticMarkup(<BrandStyle branding={branding} />);
    const match = html.match(/^<style id="org-brand">([\s\S]*)<\/style>$/);
    expect(match).not.toBeNull();
    const css = match![1];
    expect(css).toBe(branding.css);
    expect(css).toMatch(BRAND_CSS_RE);
    // :root selectors apply document-wide, so Radix portals on <body> are themed too.
    // :not(.dark) keeps the light block from beating globals.css's .dark{} in
    // document order under <html class="dark">.
    expect(css.startsWith(":root:not(.dark){")).toBe(true);
    expect(css).toContain("}:root.dark{");
    expect(css).toContain("--sidebar-gradient-end:");
  });
});
