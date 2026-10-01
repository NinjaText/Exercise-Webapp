import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { resolveBranding, type BrandingRecord } from "@/lib/branding/resolve";

const mockAuth = vi.fn();
const mockFindUnique = vi.fn();
const mockRedirect = vi.fn((path: string) => {
  // Mirrors Next's real `redirect`: it never returns, it throws.
  throw new Error(`NEXT_REDIRECT:${path}`);
});
const mockGetOrgBranding = vi.fn();
const mockResolveClubTrainerInvite = vi.fn();

vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
vi.mock("@clerk/nextjs", () => ({
  SignUp: (p: { forceRedirectUrl: string; routing: string }) =>
    React.createElement("div", { "data-testid": "sign-up", "data-redirect": p.forceRedirectUrl, "data-routing": p.routing }),
}));
vi.mock("next/navigation", () => ({ redirect: mockRedirect }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: mockFindUnique } } }));
vi.mock("@/lib/services/branding.service", () => ({ getOrgBranding: mockGetOrgBranding }));
vi.mock("@/lib/services/club-trainer.service", () => ({ resolveClubTrainerInvite: mockResolveClubTrainerInvite }));
vi.mock("@/components/onboarding/client-onboarding-form", () => ({
  ClientOnboardingForm: () => React.createElement("div", { "data-testid": "onboarding-form" }),
}));

// Imported after the mocks above so the module under test picks them up.
const { default: ClientOnboardingPage } = await import("../page");

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
  mockResolveClubTrainerInvite.mockResolvedValue(null);
});

describe("ClientOnboardingPage", () => {
  it("renders Clerk's SignUp when unauthenticated, without touching branding", async () => {
    mockAuth.mockResolvedValue({ userId: null, orgId: null });

    const html = renderToStaticMarkup(await ClientOnboardingPage());

    expect(html).toContain('data-testid="sign-up"');
    expect(html).toContain('data-redirect="/onboarding/client"');
    expect(html).toContain('data-routing="hash"');
    expect(html).toContain('data-slot="auth-shell"');
    expect(mockFindUnique).not.toHaveBeenCalled();
    expect(mockGetOrgBranding).not.toHaveBeenCalled();
  });

  it("redirects an already-onboarded client to /dashboard", async () => {
    mockAuth.mockResolvedValue({ userId: "user_1", orgId: "org_2" });
    mockFindUnique.mockResolvedValue({ clerkOrgId: "org_2", onboarded: true });

    await expect(ClientOnboardingPage()).rejects.toThrow("NEXT_REDIRECT:/dashboard");
    expect(mockRedirect).toHaveBeenCalledWith("/dashboard");
  });

  it("looks up branding by the DB user's org, and personalizes copy/copyright when enabled", async () => {
    mockAuth.mockResolvedValue({ userId: "user_1", orgId: "org_stale_claim" });
    mockFindUnique.mockResolvedValue({ clerkOrgId: "org_123", onboarded: false });
    mockGetOrgBranding.mockResolvedValue(brandedBranding);

    const html = renderToStaticMarkup(await ClientOnboardingPage());

    expect(mockGetOrgBranding).toHaveBeenCalledWith("org_123");
    expect(html).toContain("so Acme Physio can personalize your exercise program");
    // AuthShell's brand-panel copyright line carries the org's name.
    expect(html).toContain("© Acme Physio");
    expect(html).not.toContain("your trainer can personalize");
    // BrandStyle emits the derived theme <style> tag.
    expect(html).toContain('id="org-brand"');
    // The panel follows the brand via the sidebar gradient tokens, not a
    // hard-coded hex gradient.
    expect(html).toContain("bg-sidebar-gradient");
    expect(html).not.toContain("#0f172a");
    // The step form sits in AuthShell's wide (640px) form column.
    expect(html).toMatch(/data-slot="auth-form-column" data-size="wide"/);
    expect(html).toContain('data-testid="onboarding-form"');
  });

  it("falls back to the session orgId when there is no DB user row yet (freshly invited client)", async () => {
    mockAuth.mockResolvedValue({ userId: "user_1", orgId: "org_from_claim" });
    mockFindUnique.mockResolvedValue(null);
    mockGetOrgBranding.mockResolvedValue(unbrandedBranding);

    await ClientOnboardingPage();

    expect(mockGetOrgBranding).toHaveBeenCalledWith("org_from_claim");
  });

  it("keeps the product copy and INMOTUS RX name when branding is disabled", async () => {
    mockAuth.mockResolvedValue({ userId: "user_1", orgId: "org_2" });
    mockFindUnique.mockResolvedValue({ clerkOrgId: "org_2", onboarded: false });
    mockGetOrgBranding.mockResolvedValue(unbrandedBranding);

    const html = renderToStaticMarkup(await ClientOnboardingPage());

    expect(html).toContain("so your trainer can personalize your exercise program");
    expect(html).toContain("© INMOTUS RX");
    expect(html).not.toContain('id="org-brand"');
  });

  it("sends an invited club trainer with no DB row to /onboarding/club-trainer", async () => {
    mockAuth.mockResolvedValue({ userId: "user_t", orgId: "org_club" });
    mockFindUnique.mockResolvedValue(null);
    mockResolveClubTrainerInvite.mockResolvedValue({ clerkOrgId: "org_club", type: "CLUB" });
    await expect(ClientOnboardingPage()).rejects.toThrow(/^NEXT_REDIRECT:\/onboarding\/club-trainer$/);
    expect(mockResolveClubTrainerInvite).toHaveBeenCalledWith("user_t");
  });

  it("does not look up trainer invites once the DB row exists", async () => {
    mockAuth.mockResolvedValue({ userId: "user_c", orgId: "org_123" });
    mockFindUnique.mockResolvedValue({ onboarded: false, clerkOrgId: "org_123" });
    mockGetOrgBranding.mockResolvedValue(unbrandedBranding);
    await ClientOnboardingPage();
    expect(mockResolveClubTrainerInvite).not.toHaveBeenCalled();
  });
});
