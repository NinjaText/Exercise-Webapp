import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/actions/branding-actions", () => ({
  resetBranding: vi.fn(),
  saveBrandingSettings: vi.fn(),
  confirmBrandAsset: vi.fn(),
  removeBrandAsset: vi.fn(),
}));

import { brandColorErrorMessage } from "@/lib/branding/tokens";
import type { BrandingSettings } from "@/actions/branding-actions";
import { BrandingForm } from "../branding-form";

function settings(overrides: Partial<BrandingSettings> = {}): BrandingSettings {
  return {
    brandingEnabled: true,
    brandDisplayName: null,
    brandPrimaryColor: null,
    orgName: "Acme Physio",
    assets: { logoOnLightUrl: null, logoOnDarkUrl: null, markUrl: null },
    ...overrides,
  };
}

function render(overrides: Partial<BrandingSettings> = {}) {
  return renderToStaticMarkup(<BrandingForm initial={settings(overrides)} />);
}

describe("BrandingForm", () => {
  it("shows the guardrail message under the color input, linked by aria-describedby", () => {
    const message = brandColorErrorMessage("#fafafa");
    expect(message).not.toBeNull();

    const html = render({ brandPrimaryColor: "#fafafa" });

    expect(html).toContain('aria-describedby="brandPrimaryColor-error"');
    expect(html).toMatch(
      new RegExp(`<p id="brandPrimaryColor-error" role="alert"[^>]*>${message!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</p>`),
    );
  });

  it("has no color error for a usable color", () => {
    const html = render({ brandPrimaryColor: "#1d4ed8" });
    expect(html).not.toContain("brandPrimaryColor-error");
  });

  it("renders the three logo slots, showing only the server-verified own asset as an image", () => {
    const html = renderToStaticMarkup(
      <BrandingForm
        initial={settings({
          assets: {
            logoOnLightUrl: "https://img.clerk.com/legacy.png",
            logoOnDarkUrl: "https://r2.example/branding/org_1/logo-on-dark-abcdef12.png",
            markUrl: null,
          },
        })}
        ownAssets={{ "logo-on-light": false, "logo-on-dark": true, mark: false }}
      />,
    );

    expect(html).toContain('id="brand-asset-logo-on-light"');
    expect(html).toContain('id="brand-asset-logo-on-dark"');
    expect(html).toContain('id="brand-asset-mark"');
    expect(html).not.toContain("Logo upload arrives");
    expect(html).toContain('<img src="https://r2.example/branding/org_1/logo-on-dark-abcdef12.png"');
    expect(html).not.toContain("img.clerk.com");
    expect(html).toContain("Your previous logo is no longer shown anywhere");
  });
});
