import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/actions/branding-actions", () => ({
  confirmBrandAsset: vi.fn(),
  removeBrandAsset: vi.fn(),
}));

import { LogoUploader, type LogoUploaderProps } from "../logo-uploader";

const OWN = "https://r2.example/branding/org_1/logo-on-light-abcdef12.png";
const LEGACY = "https://img.clerk.com/some-old-logo.png";
const LEGACY_NOTE =
  "Your previous logo is no longer shown anywhere. Upload it here to use it in the app and on PDFs.";

function render(overrides: Partial<LogoUploaderProps> = {}) {
  return renderToStaticMarkup(
    <LogoUploader
      kind="logo-on-light"
      label="Logo on light background"
      hint="Shown on light surfaces."
      surface="light"
      currentUrl={null}
      currentIsOwn={false}
      {...overrides}
    />,
  );
}

describe("LogoUploader", () => {
  it("renders the current image for our own asset URL, with Replace and Remove", () => {
    const html = render({ currentUrl: OWN, currentIsOwn: true });
    expect(html).toContain(`<img src="${OWN}"`);
    expect(html).toContain("object-contain");
    expect(html).toContain("Replace");
    expect(html).toContain("Remove");
    expect(html).not.toContain(LEGACY_NOTE);
  });

  it("shows the legacy note and never renders an external URL as an image", () => {
    const html = render({ currentUrl: LEGACY, currentIsOwn: false });
    expect(html).not.toContain("<img");
    expect(html).not.toContain(LEGACY);
    expect(html).toContain(LEGACY_NOTE);
  });

  it("renders an empty state with an Upload button and no Remove when there is no logo", () => {
    const html = render();
    expect(html).not.toContain("<img");
    expect(html).toContain("No image yet");
    expect(html).toContain("Upload");
    expect(html).not.toContain("Remove");
    expect(html).not.toContain(LEGACY_NOTE);
  });

  it("labels an accessible file input limited to the accepted types", () => {
    const html = render();
    expect(html).toMatch(/<label[^>]*for="brand-asset-logo-on-light"/);
    expect(html).toMatch(/<input[^>]*type="file"[^>]*id="brand-asset-logo-on-light"|<input[^>]*id="brand-asset-logo-on-light"[^>]*type="file"/);
    expect(html).toContain('accept="image/png,image/jpeg,image/webp"');
    expect(html).toContain('aria-describedby="brand-asset-logo-on-light-hint"');
    expect(html).toContain('aria-live="polite"');
  });

  it("puts the image box on the matching surface", () => {
    expect(render({ surface: "light" })).toContain("bg-card");
    expect(render({ surface: "dark", kind: "logo-on-dark" })).toContain("bg-sidebar");
  });
});
