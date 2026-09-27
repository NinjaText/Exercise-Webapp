import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_LIGHT_TOKENS } from "@/lib/branding/defaults";
import { deriveBrandTokens } from "@/lib/branding/tokens";
import { BrandPreview } from "../brand-preview";

function render(hex: string | null, displayName = "Acme Physio") {
  return renderToStaticMarkup(<BrandPreview hex={hex} displayName={displayName} />);
}

describe("BrandPreview", () => {
  it("while the typed color is incomplete, shows the default look and no warning about the previous color", () => {
    const html = renderToStaticMarkup(<BrandPreview hex="#fafafa" displayName="Teal Physio" incomplete />);
    expect(html).toContain("Finish entering a color");
    expect(html).not.toContain("near-white");
    expect(html).toContain(`--primary:${DEFAULT_LIGHT_TOKENS.primary}`);
  });

  it("themes the panel locally with the derived light tokens as inline custom properties", () => {
    const { light } = deriveBrandTokens("#1d4ed8");
    const html = render("#1d4ed8");

    expect(html).toMatch(/style="--primary:oklch\(/);
    expect(html).toContain(`--primary:${light.primary}`);
    expect(html).toContain(`--sidebar-primary:${light["sidebar-primary"]}`);
    expect(html).toContain(`--brand-soft:${light["brand-soft"]}`);
    expect(html).toContain("Acme Physio");
  });

  it("reports the real contrast ratio with a text pass label (not colour alone)", () => {
    const { meta } = deriveBrandTokens("#1d4ed8");
    const html = render("#1d4ed8");
    const shown = (Math.floor(meta.contrastOnPrimary * 10) / 10).toFixed(1);

    expect(html).toContain(`White text on your color: ${shown}:1`);
    expect(html).toContain("passes AA");
    expect(html).not.toContain("We darkened your color");
  });

  it("says dark text is used when the engine picks a dark foreground", () => {
    const { meta } = deriveBrandTokens("#8ab4f8");
    expect(meta.primaryForeground).toBe("dark");
    expect(render("#8ab4f8")).toContain("Dark text on your color:");
  });

  it("shows the adjustment notice with both hexes from the engine's meta", () => {
    const { meta } = deriveBrandTokens("#337bba");
    expect(meta.adjusted).toBe(true);
    const html = render("#337bba");

    expect(html).toContain("We darkened your color slightly");
    expect(html).toContain(meta.adjustedFromHex!);
    expect(html).toContain(meta.primaryHex);
    expect(html).toContain(`--primary:${deriveBrandTokens("#337bba").light.primary}`);
  });

  it("renders the guardrail message as non-alert text over the default tokens for a near-white color", () => {
    let message = "";
    try {
      deriveBrandTokens("#fafafa");
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).not.toBe("");

    const html = render("#fafafa");
    expect(html).toContain(message);
    // The field (ColorField) owns the alert; the preview's live region just describes it.
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain("passes AA");
    // Pinned to the product default, never the org's live injected brand.
    for (const [name, value] of Object.entries(DEFAULT_LIGHT_TOKENS)) {
      expect(html).toContain(`--${name}:${value}`);
    }
  });

  it("pins the default look with the product default tokens inline when no color is set", () => {
    const html = render(null);

    // Inline defaults so the panel can't inherit the org's <style id="org-brand">.
    for (const [name, value] of Object.entries(DEFAULT_LIGHT_TOKENS)) {
      expect(html).toContain(`--${name}:${value}`);
    }
    expect(html).toContain("Showing the default look");
    expect(html).not.toContain("passes AA");
    expect(html).not.toContain("We darkened your color");
    expect(html).not.toContain('role="alert"');
    expect(html).toContain("Acme Physio");
  });
});
