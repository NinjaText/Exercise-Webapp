import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({
  user: { id: "u1", role: "TRAINER", clerkOrgId: null } as Record<string, unknown>,
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(async () => ({ userId: "clerk_1" })) }));
vi.mock("@clerk/nextjs", () => ({ SignOutButton: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(async () => mocks.user) },
    trainerSubscription: { findUnique: vi.fn(async () => ({ status: "CANCELED", trialEndsAt: new Date(0) })) },
    memberSubscription: { findUnique: vi.fn(async () => ({ status: "CANCELED", trialEndsAt: new Date(0) })) },
  },
}));
vi.mock("@/lib/native/server", () => ({ getNativeInfo: vi.fn() }));
vi.mock("@/lib/org-capabilities.server", () => ({
  getCapabilitiesForUser: vi.fn(async () => ({ trainerBilling: true })),
  getOrgForUser: vi.fn(async () => ({ id: "org1" })),
}));
vi.mock("@/lib/org-capabilities", () => ({ getOrgCapabilities: () => ({ billing: "member" }) }));
vi.mock("@/lib/services/club-member.service", () => ({ ensureMemberSubscription: vi.fn() }));
vi.mock("@/lib/services/branding.service", () => ({
  getOrgBranding: vi.fn(async () => {
    throw new Error("no branding in tests");
  }),
}));
vi.mock("@/components/branding/brand-style", () => ({ BrandStyle: () => null }));
vi.mock("@/components/branding/org-identity", () => ({ OrgIdentity: () => null }));
vi.mock("@/components/billing/pricing-cards", () => ({ PricingCards: () => "PRICING_CARDS" }));
vi.mock("../member-billing-view", () => ({ MemberBillingView: () => "MEMBER_BILLING" }));

import { getNativeInfo } from "@/lib/native/server";
import BillingPage from "../page";

const render = async (reason = "trial_expired") =>
  renderToStaticMarkup(await BillingPage({ searchParams: Promise.resolve({ reason }) }));

describe("billing page", () => {
  beforeEach(() => {
    mocks.user = { id: "u1", role: "TRAINER", clerkOrgId: null };
  });

  it("renders the neutral attention screen, not pricing, for a trainer inside the native shell", async () => {
    vi.mocked(getNativeInfo).mockResolvedValue({ isNative: true, platform: "ios", appVersion: "1.0.0" });
    const html = await render();
    expect(html).toContain("Your free trial has ended.");
    expect(html).not.toContain("PRICING_CARDS");
    expect(html).not.toMatch(/\$\d/);
  });

  it("renders the attention screen, not member billing, for a club member inside the native shell", async () => {
    mocks.user = { id: "u2", role: "CLIENT", clerkOrgId: "org_1" };
    vi.mocked(getNativeInfo).mockResolvedValue({ isNative: true, platform: "android", appVersion: "1.0.0" });
    const html = await render("payment_failed");
    expect(html).toContain("problem with your last subscription payment");
    expect(html).not.toContain("MEMBER_BILLING");
  });

  it("still renders pricing on the web", async () => {
    vi.mocked(getNativeInfo).mockResolvedValue({ isNative: false });
    expect(await render()).toContain("PRICING_CARDS");
  });

  it("still renders member billing on the web", async () => {
    mocks.user = { id: "u2", role: "CLIENT", clerkOrgId: "org_1" };
    vi.mocked(getNativeInfo).mockResolvedValue({ isNative: false });
    expect(await render()).toContain("MEMBER_BILLING");
  });
});
