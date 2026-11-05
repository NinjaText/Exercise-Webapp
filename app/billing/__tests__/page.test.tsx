import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(async () => ({ userId: "clerk_1" })) }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`);
  }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    memberSubscription: { findUnique: vi.fn() },
    trainerSubscription: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/org-capabilities.server", () => ({ getOrgForUser: vi.fn(), getCapabilitiesForUser: vi.fn() }));
vi.mock("@/lib/services/club-member.service", () => ({ ensureMemberSubscription: vi.fn() }));
vi.mock("@/components/billing/pricing-cards", () => ({
  PricingCards: (p: { trialEligible?: boolean }) => <i data-trial={String(Boolean(p.trialEligible))} />,
}));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ get: () => undefined })) }));
vi.mock("@/lib/services/branding.service", () => ({
  getOrgBranding: vi.fn(async () => ({ enabled: false, displayName: "MIA Performance", logoOnLightUrl: null, logoOnDarkUrl: null, markUrl: null })),
}));
vi.mock("../member-billing-view", () => ({ MemberBillingView: () => null }));

import { prisma } from "@/lib/prisma";
import { getOrgForUser, getCapabilitiesForUser } from "@/lib/org-capabilities.server";
import { getUserCapabilities } from "@/lib/org-capabilities";
import { ensureMemberSubscription } from "@/lib/services/club-member.service";
import BillingPage from "../page";
import { renderToStaticMarkup } from "react-dom/server";

const club = { clerkOrgId: "org_club", type: "CLUB", trialDays: 7 };
const member = { id: "u1", role: "CLIENT", clerkOrgId: "org_club" };
const props = { searchParams: Promise.resolve({}) };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.user.findUnique).mockResolvedValue(member as any);
  vi.mocked(getOrgForUser).mockResolvedValue(club as any);
});

describe("/billing member branch", () => {
  it("creates the missing trial row and renders it", async () => {
    const created = { userId: "u1", status: "TRIALING" };
    vi.mocked(prisma.memberSubscription.findUnique).mockResolvedValueOnce(null).mockResolvedValueOnce(created as any);

    const el = (await BillingPage(props)) as any;

    expect(ensureMemberSubscription).toHaveBeenCalledWith("u1", club);
    expect(el.props.sub).toBe(created);
    expect(el.props.org).toBe(club);
  });

  it("does not touch an existing row", async () => {
    const existing = { userId: "u1", status: "ACTIVE" };
    vi.mocked(prisma.memberSubscription.findUnique).mockResolvedValue(existing as any);

    const el = (await BillingPage(props)) as any;

    expect(ensureMemberSubscription).not.toHaveBeenCalled();
    expect(el.props.sub).toBe(existing);
  });

  it("sends trainer-org clients to the dashboard without creating anything", async () => {
    vi.mocked(getOrgForUser).mockResolvedValue({ clerkOrgId: "org_t", type: null } as any);
    await expect(BillingPage(props)).rejects.toThrow("REDIRECT:/dashboard");
    expect(ensureMemberSubscription).not.toHaveBeenCalled();
  });
});

describe("/billing trainer branch", () => {
  const trainer = { id: "t1", role: "TRAINER", clerkOrgId: "org_t" };

  beforeEach(() => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(trainer as any);
    vi.mocked(prisma.trainerSubscription.findUnique).mockResolvedValue(null);
  });

  it("renders plans for a trainer-org trainer (unchanged)", async () => {
    vi.mocked(getCapabilitiesForUser).mockResolvedValue(
      getUserCapabilities({ orgType: "TRAINER", role: "TRAINER", coachingActive: false })
    );
    await expect(BillingPage(props)).resolves.toBeTruthy();
    expect(getCapabilitiesForUser).toHaveBeenCalledWith(trainer);
  });

  it("sends a club trainer (never pays) to the dashboard", async () => {
    vi.mocked(getCapabilitiesForUser).mockResolvedValue(
      getUserCapabilities({ orgType: "CLUB", role: "TRAINER", coachingActive: false })
    );
    await expect(BillingPage(props)).rejects.toThrow("REDIRECT:/dashboard");
    expect(prisma.trainerSubscription.findUnique).not.toHaveBeenCalled();
  });

  describe("7-day card-required trial", () => {
    const trainerCaps = () =>
      vi.mocked(getCapabilitiesForUser).mockResolvedValue(
        getUserCapabilities({ orgType: "TRAINER", role: "TRAINER", coachingActive: false })
      );
    const base = { stripeCustomerId: "cus_1", stripeSubscriptionId: null, trialUsedAt: null, plan: "STARTER" };

    it("a fresh trainer is asked to start the trial, never told it ended", async () => {
      trainerCaps();
      vi.mocked(prisma.trainerSubscription.findUnique).mockResolvedValue({ ...base, status: "TRIALING", trialEndsAt: new Date(0) } as any);
      const html = renderToStaticMarkup(
        (await BillingPage({ searchParams: Promise.resolve({ reason: "checkout_required" }) })) as any
      );
      expect(html).toContain("Start your 7-day free trial");
      expect(html).toContain("Card required");
      expect(html).not.toContain("trial has ended");
      expect(html).toContain('data-trial="true"');
    });

    it("an expired legacy trial is told it ended and gets no second trial", async () => {
      trainerCaps();
      vi.mocked(prisma.trainerSubscription.findUnique).mockResolvedValue({ ...base, status: "TRIALING", trialEndsAt: new Date("2026-01-01") } as any);
      const html = renderToStaticMarkup(
        (await BillingPage({ searchParams: Promise.resolve({ reason: "trial_expired" }) })) as any
      );
      expect(html).toContain("Your free trial has ended");
      expect(html).toContain('data-trial="false"');
    });

    it("a trainer already trialing in Stripe goes to settings to manage it", async () => {
      trainerCaps();
      vi.mocked(prisma.trainerSubscription.findUnique).mockResolvedValue({ ...base, status: "TRIALING", stripeSubscriptionId: "sub_1", trialEndsAt: new Date(Date.now() + 86400_000) } as any);
      await expect(BillingPage(props)).rejects.toThrow("REDIRECT:/settings/billing");
    });
  });
});
