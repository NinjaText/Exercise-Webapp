import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { resolveBranding, type BrandingRecord } from "@/lib/branding/resolve";

const mockGetPurchaseBySessionId = vi.fn();
const mockGetOrgBranding = vi.fn();

vi.mock("@/lib/services/program-purchase.service", () => ({
  getPurchaseBySessionId: mockGetPurchaseBySessionId,
}));
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: vi.fn(async () => ({
    signInTokens: { createSignInToken: vi.fn(async () => ({ token: "sign-in-token" })) },
  })),
}));
vi.mock("@/lib/services/branding.service", () => ({ getOrgBranding: mockGetOrgBranding }));
vi.mock("../claim-account", () => ({
  ClaimAccount: () => React.createElement("div", { "data-testid": "claim-account" }),
}));
vi.mock("../pending-status", () => ({
  PendingStatus: () => React.createElement("div", { "data-testid": "pending-status" }),
}));

// Imported after the mocks above so the module under test picks them up.
const { default: SuccessPage, generateMetadata } = await import("../page");

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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SuccessPage", () => {
  it("looks up branding by the purchase's org (via the cached loader) and renders the identity block", async () => {
    mockGetPurchaseBySessionId.mockResolvedValue({
      status: "PENDING",
      buyerClerkId: null,
      accountClaimedAt: null,
      buyerEmail: "buyer@example.com",
      orgId: "org_123",
    });
    mockGetOrgBranding.mockResolvedValue(brandedBranding);

    const html = renderToStaticMarkup(
      await SuccessPage({ searchParams: Promise.resolve({ session_id: "cs_test_1" }) })
    );

    expect(mockGetPurchaseBySessionId).toHaveBeenCalledWith("cs_test_1");
    expect(mockGetOrgBranding).toHaveBeenCalledWith("org_123");
    expect(html).toContain("Acme Physio");
    expect(html).toContain('id="org-brand"');
    expect(html).toContain('data-testid="pending-status"');
  });

  it("passes null branding when there is no purchase (unbranded product default)", async () => {
    mockGetPurchaseBySessionId.mockResolvedValue(null);
    mockGetOrgBranding.mockResolvedValue(unbrandedBranding);

    const html = renderToStaticMarkup(
      await SuccessPage({ searchParams: Promise.resolve({ session_id: "cs_missing" }) })
    );

    expect(mockGetOrgBranding).toHaveBeenCalledWith(null);
    expect(html).toContain("INMOTUS RX");
    expect(html).not.toContain('id="org-brand"');
  });

  it("passes null branding when there is no session_id at all, without calling the purchase loader", async () => {
    mockGetOrgBranding.mockResolvedValue(unbrandedBranding);

    await SuccessPage({ searchParams: Promise.resolve({}) });

    expect(mockGetPurchaseBySessionId).not.toHaveBeenCalled();
    expect(mockGetOrgBranding).toHaveBeenCalledWith(null);
  });
});

describe("generateMetadata", () => {
  it("titles the page with the purchase's org brand, via the same cached loader", async () => {
    mockGetPurchaseBySessionId.mockResolvedValue({ orgId: "org_123" });
    mockGetOrgBranding.mockResolvedValue(brandedBranding);

    const metadata = await generateMetadata({
      searchParams: Promise.resolve({ session_id: "cs_test_1" }),
    });

    expect(mockGetPurchaseBySessionId).toHaveBeenCalledWith("cs_test_1");
    expect(metadata.title).toEqual({ absolute: "Payment successful | Acme Physio" });
  });

  it("falls back to product branding with no session_id, without calling the purchase loader", async () => {
    mockGetOrgBranding.mockResolvedValue(unbrandedBranding);

    const metadata = await generateMetadata({ searchParams: Promise.resolve({}) });

    expect(mockGetPurchaseBySessionId).not.toHaveBeenCalled();
    expect(metadata.title).toEqual({ absolute: "Payment successful | INMOTUS RX" });
    expect("icons" in metadata).toBe(false);
  });

  it("uses the purchase org's brand favicon and apple icon", async () => {
    mockGetPurchaseBySessionId.mockResolvedValue({ orgId: "org_123" });
    mockGetOrgBranding.mockResolvedValue({
      ...brandedBranding,
      faviconUrl: "https://assets.test/branding/org_123/favicon-32.png",
      appleIconUrl: null,
    });

    const metadata = await generateMetadata({
      searchParams: Promise.resolve({ session_id: "cs_test_1" }),
    });

    expect(metadata.icons).toEqual({
      icon: [{ url: "https://assets.test/branding/org_123/favicon-32.png", sizes: "32x32", type: "image/png" }],
      apple: undefined,
    });
  });
});
