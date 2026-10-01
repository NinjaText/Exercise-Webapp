import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AuthShell, AUTH_FORM_WIDTH_CLASS } from "../auth-shell";
import type { BrandingViewModel } from "@/lib/branding/types";

const productBranding: BrandingViewModel = {
  enabled: false,
  displayName: "INMOTUS RX",
  logoOnLightUrl: null,
  logoOnDarkUrl: null,
  markUrl: null,
};

const orgBranding: BrandingViewModel = {
  enabled: true,
  displayName: "Peak Physio",
  logoOnLightUrl: null,
  logoOnDarkUrl: null,
  markUrl: null,
};

function render(props: Partial<React.ComponentProps<typeof AuthShell>> = {}) {
  return renderToStaticMarkup(
    <AuthShell branding={orgBranding} headline="Welcome back" subhead="Sign in to continue" {...props}>
      <form data-testid="the-form" />
    </AuthShell>,
  );
}

/**
 * Returns the outer markup of the first element carrying `data-slot="<name>"`
 * (balanced on its own tag name; the test env has no DOM parser).
 */
function slot(html: string, name: string): string {
  const attr = html.indexOf(`data-slot="${name}"`);
  if (attr === -1) return "";
  const start = html.lastIndexOf("<", attr);
  const tag = /^<([a-z0-9]+)/.exec(html.slice(start))![1];
  const re = new RegExp(`<${tag}[\\s>]|</${tag}>`, "g");
  re.lastIndex = start;
  let depth = 0;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[0].startsWith("</") ? -1 : 1;
    if (depth === 0) return html.slice(start, m.index + m[0].length);
  }
  return html.slice(start);
}

describe("AuthShell", () => {
  it("renders a full-height 2/5 + 3/5 split with a brand panel hidden on mobile", () => {
    const html = render();
    expect(html).toContain('data-slot="auth-shell"');
    expect(html).toContain("min-h-dvh");
    expect(html).toContain("lg:grid-cols-5");
    const brand = slot(html, "auth-brand-panel");
    expect(brand).not.toBe("");
    expect(brand).toContain("lg:col-span-2");
    const brandClass = /^<div[^>]*class="([^"]*)"/.exec(brand)![1];
    expect(brandClass).toMatch(/(^|\s)hidden(\s|$)/);
    expect(brandClass).toMatch(/(^|\s)lg:flex(\s|$)/);
    expect(brand).toContain("bg-sidebar-gradient");
  });

  it("keeps the brand content sticky and unclipped (overflow lives on the decoration only)", () => {
    const html = render({ bullets: ["a", "b", "c"] });
    const brand = slot(html, "auth-brand-panel");
    const tokens = (el: string) => /^<div[^>]*class="([^"]*)"/.exec(el)![1].split(/\s+/);
    const panel = tokens(brand);
    expect(panel).not.toContain("overflow-hidden");
    expect(panel).toContain("min-h-dvh");
    const decoration = slot(brand, "auth-brand-decoration");
    expect(tokens(decoration)).toEqual(expect.arrayContaining(["absolute", "inset-0", "overflow-hidden"]));
    expect(decoration).toContain('aria-hidden="true"');
    const content = tokens(slot(brand, "auth-brand-content"));
    expect(content).toEqual(expect.arrayContaining(["lg:sticky", "lg:top-0", "min-h-dvh", "self-start"]));
    expect(content).not.toContain("h-dvh");
    expect(content.some((t) => t.startsWith("overflow"))).toBe(false);
  });

  it("shows the org's display name in the brand panel and the mobile header", () => {
    const html = render();
    expect(slot(html, "auth-brand-panel")).toContain("Peak Physio");
    expect(slot(html, "auth-mobile-header")).toContain("Peak Physio");
  });

  it("falls back to the product identity when branding is disabled", () => {
    const html = render({ branding: productBranding });
    expect(slot(html, "auth-brand-panel")).toContain("INMOTUS RX");
  });

  it("puts the form in the right column, top-aligned (not vertically centred)", () => {
    const html = render();
    const panel = slot(html, "auth-panel");
    expect(panel).toContain("lg:col-span-3");
    const column = slot(html, "auth-form-column");
    expect(column).toContain('data-testid="the-form"');
    expect(panel).toContain('data-slot="auth-form-column"');
    expect(slot(html, "auth-brand-panel")).not.toContain("the-form");
    // Neither the panel nor <main> centres its content vertically.
    const panelTag = /^<div[^>]*>/.exec(panel)![0];
    const mainTag = /<main[^>]*>/.exec(panel)![0];
    for (const tag of [panelTag, mainTag]) {
      expect(tag).not.toContain("justify-center");
      expect(tag).not.toContain("items-center");
    }
    expect(mainTag).toMatch(/lg:pt-\d+/);
  });

  it("uses the headline as the page's h1 and renders subhead and bullets", () => {
    const html = render({ bullets: ["Plans in minutes", "Track adherence", "Message clients"] });
    expect(html).toMatch(/<h1[^>]*>Welcome back<\/h1>/);
    expect(html).toContain("Sign in to continue");
    const brand = slot(html, "auth-brand-panel");
    expect(brand).toContain("Plans in minutes");
    expect(brand).toContain("Track adherence");
    expect(brand).toContain("Message clients");
    expect((brand.match(/<li/g) ?? []).length).toBe(3);
  });

  it("only one headline is visible per breakpoint", () => {
    const html = render();
    const h1s = html.match(/<h1[^>]*>/g) ?? [];
    expect(h1s).toHaveLength(2);
    const mobileHeading = slot(html, "auth-mobile-heading");
    expect(/^<div[^>]*>/.exec(mobileHeading)![0]).toContain("lg:hidden");
    expect(mobileHeading).toMatch(/<h1[^>]*>Welcome back<\/h1>/);
    expect(slot(html, "auth-brand-panel")).toMatch(/<h1[^>]*>/);
  });

  it('headingMode="form" renders no h1 and no mobile heading from the shell', () => {
    const html = render({ headingMode: "form" });
    expect(html).not.toMatch(/<h1/);
    expect(html).not.toContain('data-slot="auth-mobile-heading"');
    expect(slot(html, "auth-brand-panel")).toContain("Welcome back");
    expect(slot(html, "auth-brand-panel")).toContain("Sign in to continue");
    expect(html).toContain('data-testid="the-form"');
  });

  it("caps the form column at 520px, or 640px when wide", () => {
    expect(slot(render(), "auth-form-column")).toContain("max-w-[520px]");
    expect(slot(render({ size: "wide" }), "auth-form-column")).toContain("max-w-[640px]");
    expect(Object.keys(AUTH_FORM_WIDTH_CLASS).sort()).toEqual(["default", "wide"]);
  });

  it("renders a default legal footer at the bottom of the right panel, replaceable or removable", () => {
    const def = slot(render(), "auth-footer");
    expect(def).toContain('href="/privacy"');
    expect(def).toContain('href="/terms"');
    expect(slot(render(), "auth-panel")).toContain('data-slot="auth-footer"');

    const custom = slot(render({ footer: <span>Need help?</span> }), "auth-footer");
    expect(custom).toContain("Need help?");
    expect(custom).not.toContain("/privacy");

    expect(render({ footer: null })).not.toContain('data-slot="auth-footer"');
  });

  it("pads the right panel for device safe areas", () => {
    const panel = slot(render(), "auth-panel");
    expect(panel).toContain("var(--safe-top)");
    expect(panel).toContain("var(--safe-bottom)");
  });
});
