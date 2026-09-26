import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { resolveBranding, type BrandingRecord } from "@/lib/branding/resolve";

const mockGetSellablePackageBySlug = vi.fn();
const mockNotFound = vi.fn(() => {
  // Mirrors Next's real `notFound`: it never returns, it throws.
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("@/lib/native/server", () => ({ getNativeInfo: vi.fn(async () => ({ isNative: false })) }));
vi.mock("@/lib/services/sellable-package.service", () => ({
  getSellablePackageBySlug: mockGetSellablePackageBySlug,
}));
vi.mock("next/navigation", () => ({ notFound: mockNotFound }));
vi.mock("../buy-button", () => ({
  BuyButton: () => React.createElement("div", { "data-testid": "buy-button" }),
}));

// Imported after the mocks above so the module under test picks them up.
const { default: SalesPage, generateMetadata } = await import("../page");

const brandedRecord: BrandingRecord = {
  clerkOrgId: "org_123",
  name: "Acme Physio LLC",
  tagline: "Move well.",
  brandingEnabled: true,
  brandDisplayName: "Acme Physio",
  brandPrimaryColor: "#1d4ed8",
  brandLogoOnLightUrl: null,
  brandLogoOnDarkUrl: null,
  brandMarkUrl: null,
  brandFaviconUrl: null,
  brandAppleIconUrl: null,
};

const brandedBranding = resolveBranding(brandedRecord);
const unbrandedBranding = resolveBranding(null);

const basePkg = {
  id: "pkg1",
  slug: "golf-back-pain",
  name: "Golf Back Pain Program",
  description: "Fix your swing without pain.",
  priceInCents: 7999,
  programTemplateId: "tmpl1",
  upsell: null,
  trainer: { clerkOrgId: "org_123" },
};

vi.mock("@/lib/services/branding.service", () => ({
  getOrgBranding: vi.fn(),
}));
import { getOrgBranding } from "@/lib/services/branding.service";
const mockGetOrgBranding = vi.mocked(getOrgBranding);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SalesPage", () => {
  it("calls notFound when the package does not exist", async () => {
    mockGetSellablePackageBySlug.mockResolvedValue(null);

    await expect(SalesPage({ params: Promise.resolve({ slug: "nope" }) })).rejects.toThrow(
      "NEXT_NOT_FOUND"
    );
  });

  it("looks up branding by the seller's org and renders the identity block above the package name", async () => {
    mockGetSellablePackageBySlug.mockResolvedValue(basePkg);
    mockGetOrgBranding.mockResolvedValue(brandedBranding);

    const html = renderToStaticMarkup(
      await SalesPage({ params: Promise.resolve({ slug: "golf-back-pain" }) })
    );

    expect(mockGetOrgBranding).toHaveBeenCalledWith("org_123");
    expect(html).toContain("Acme Physio");
    expect(html).toContain("Golf Back Pain Program");
    // Identity block renders before the package name in document order.
    expect(html.indexOf("Acme Physio")).toBeLessThan(html.indexOf("Golf Back Pain Program"));
    // BrandStyle emits the derived theme <style> tag.
    expect(html).toContain('id="org-brand"');
  });

  it("falls back to product identity and no <style> tag for an unbranded seller", async () => {
    mockGetSellablePackageBySlug.mockResolvedValue(basePkg);
    mockGetOrgBranding.mockResolvedValue(unbrandedBranding);

    const html = renderToStaticMarkup(
      await SalesPage({ params: Promise.resolve({ slug: "golf-back-pain" }) })
    );

    expect(html).toContain("INMOTUS RX");
    expect(html).not.toContain('id="org-brand"');
  });

  it("passes null when the trainer has no organization", async () => {
    mockGetSellablePackageBySlug.mockResolvedValue({
      ...basePkg,
      trainer: { clerkOrgId: null },
    });
    mockGetOrgBranding.mockResolvedValue(unbrandedBranding);

    await SalesPage({ params: Promise.resolve({ slug: "golf-back-pain" }) });

    expect(mockGetOrgBranding).toHaveBeenCalledWith(null);
  });
});

describe("generateMetadata", () => {
  it("titles the page with the package name and the seller's brand", async () => {
    mockGetSellablePackageBySlug.mockResolvedValue(basePkg);
    mockGetOrgBranding.mockResolvedValue(brandedBranding);

    const metadata = await generateMetadata({ params: Promise.resolve({ slug: "golf-back-pain" }) });

    // `absolute`: app/p has no layout, so a plain string would get the root
    // template appended ("… | Acme Physio | INMOTUS RX").
    expect(metadata.title).toEqual({ absolute: "Golf Back Pain Program | Acme Physio" });
  });

  it("uses the seller's brand favicon and apple icon", async () => {
    mockGetSellablePackageBySlug.mockResolvedValue(basePkg);
    mockGetOrgBranding.mockResolvedValue({
      ...brandedBranding,
      faviconUrl: "https://assets.test/branding/org_123/favicon-32.png",
      appleIconUrl: "https://assets.test/branding/org_123/apple-180.png",
    });

    const metadata = await generateMetadata({ params: Promise.resolve({ slug: "golf-back-pain" }) });

    expect(metadata.icons).toEqual({
      icon: [{ url: "https://assets.test/branding/org_123/favicon-32.png", sizes: "32x32", type: "image/png" }],
      apple: [{ url: "https://assets.test/branding/org_123/apple-180.png", sizes: "180x180" }],
    });
  });

  it("leaves icons unset (root product favicon) without a brand favicon", async () => {
    mockGetSellablePackageBySlug.mockResolvedValue(basePkg);
    mockGetOrgBranding.mockResolvedValue(unbrandedBranding);

    const metadata = await generateMetadata({ params: Promise.resolve({ slug: "golf-back-pain" }) });

    expect("icons" in metadata).toBe(false);
    expect(metadata.title).toEqual({ absolute: "Golf Back Pain Program | INMOTUS RX" });
  });

  it("returns an empty metadata object when the package does not exist", async () => {
    mockGetSellablePackageBySlug.mockResolvedValue(null);

    const metadata = await generateMetadata({ params: Promise.resolve({ slug: "nope" }) });

    expect(metadata).toEqual({});
    expect(mockGetOrgBranding).not.toHaveBeenCalled();
  });
});
