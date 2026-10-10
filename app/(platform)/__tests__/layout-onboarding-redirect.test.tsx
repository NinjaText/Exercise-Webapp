import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(async () => ({ userId: "clerk_1", orgId: "org_x" })) }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`);
  }),
}));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: vi.fn() } } }));
vi.mock("@/lib/org-capabilities.server", () => ({ getCapabilitiesForUser: vi.fn() }));
vi.mock("@/lib/current-user", () => ({ isSuperAdmin: vi.fn() }));
vi.mock("@/components/layout/sidebar", () => ({ Sidebar: () => null }));
vi.mock("@/components/layout/header", () => ({ Header: () => null }));
vi.mock("@/lib/services/inbox.service", () => ({ getUnreadVoiceNoteCount: vi.fn() }));
vi.mock("@/components/search/search-provider", () => ({ SearchProvider: () => null }));
vi.mock("@/components/search/command-palette", () => ({ CommandPalette: () => null }));
vi.mock("@/components/layout/breadcrumb-context", () => ({ BreadcrumbProvider: () => null }));
vi.mock("@/components/layout/mobile-tab-bar", () => ({ MobileTabBar: () => null }));
vi.mock("@/components/billing/member-trial-banner", () => ({ MemberTrialBanner: () => null }));
vi.mock("@/components/branding/brand-style", () => ({ BrandStyle: () => null }));
vi.mock("@/lib/services/branding.service", () => ({ getCurrentBranding: vi.fn(), getOrgBranding: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getCapabilitiesForUser } from "@/lib/org-capabilities.server";
import { getUserCapabilities } from "@/lib/org-capabilities";
import PlatformLayout from "../layout";

const caps = (orgType: "CLUB" | "TRAINER", role: "TRAINER" | "CLIENT") =>
  getUserCapabilities({ orgType, role, coachingActive: false });

function run() {
  return PlatformLayout({ children: null });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("platform layout onboarding redirects", () => {
  it("sends an un-onboarded TRAINER in a club org to /onboarding like any trainer", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "t1", role: "TRAINER", clerkOrgId: "org_club", onboarded: false } as any);
    vi.mocked(getCapabilitiesForUser).mockResolvedValue(caps("CLUB", "TRAINER"));
    await expect(run()).rejects.toThrow(/^REDIRECT:\/onboarding$/);
  });

  it("keeps sending an un-onboarded trainer-org trainer to /onboarding (regression)", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "t1", role: "TRAINER", clerkOrgId: "org_t", onboarded: false } as any);
    vi.mocked(getCapabilitiesForUser).mockResolvedValue(caps("TRAINER", "TRAINER"));
    await expect(run()).rejects.toThrow(/^REDIRECT:\/onboarding$/);
  });

  it("keeps sending an un-onboarded client to /onboarding/client", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "c1", role: "CLIENT", clerkOrgId: "org_club", onboarded: false } as any);
    vi.mocked(getCapabilitiesForUser).mockResolvedValue(caps("CLUB", "CLIENT"));
    await expect(run()).rejects.toThrow(/^REDIRECT:\/onboarding\/client$/);
  });

  it("sends a deactivated user (removed trainer) to /account-deactivated, not /billing", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "t1", role: "TRAINER", clerkOrgId: null, onboarded: true, isActive: false } as any);
    vi.mocked(getCapabilitiesForUser).mockResolvedValue(caps("TRAINER", "TRAINER"));
    await expect(run()).rejects.toThrow(/^REDIRECT:\/account-deactivated$/);
  });
});
