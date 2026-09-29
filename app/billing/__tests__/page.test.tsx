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
vi.mock("@/lib/org-capabilities.server", () => ({ getOrgForUser: vi.fn() }));
vi.mock("@/lib/services/club-member.service", () => ({ ensureMemberSubscription: vi.fn() }));
vi.mock("@/components/billing/pricing-cards", () => ({ PricingCards: () => null }));
vi.mock("../member-billing-view", () => ({ MemberBillingView: () => null }));

import { prisma } from "@/lib/prisma";
import { getOrgForUser } from "@/lib/org-capabilities.server";
import { ensureMemberSubscription } from "@/lib/services/club-member.service";
import BillingPage from "../page";

const club = { clerkOrgId: "org_club", type: "CLUB", trialDays: 14 };
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
