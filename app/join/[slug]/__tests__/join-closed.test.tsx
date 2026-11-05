import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`);
  }),
}));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ get: () => undefined })) }));
vi.mock("@clerk/nextjs", () => ({ SignUp: () => null }));
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(async () => ({ userId: "clerk_1" })) }));
vi.mock("@/lib/services/club.service", () => ({ getClubBySlug: vi.fn() }));
vi.mock("@/lib/services/club-member.service", () => ({
  enrollClubMember: vi.fn(),
  assignNextStarterProgram: vi.fn(),
  clubRequiresCardForTrial: (c: { trialRequiresCard?: boolean | null; stripePriceId?: string | null }) =>
    c.trialRequiresCard === true && Boolean(c.stripePriceId),
}));
vi.mock("@/lib/prisma", () => ({ prisma: { memberSubscription: { findUnique: vi.fn() } } }));
vi.mock("@/lib/services/branding.service", () => ({
  getOrgBranding: vi.fn(async () => ({ displayName: "Pine Valley" })),
}));
vi.mock("@/lib/ui/clerk-appearance", () => ({ clerkAuthAppearance: () => ({}) }));
vi.mock("@/lib/branding/types", () => ({ toViewModel: (b: unknown) => b }));
vi.mock("@/components/branding/brand-style", () => ({ BrandStyle: () => null }));
vi.mock("@/components/branding/org-identity", () => ({ OrgIdentity: () => null }));
vi.mock("@/lib/clubs/join-token", () => ({ JOIN_COOKIE: "club_join", verifyJoinToken: vi.fn(() => true) }));
vi.mock("../join-code-form", () => ({ JoinCodeForm: () => "JOIN_FORM" }));
vi.mock("../complete/activate-org", () => ({ ActivateOrg: ({ next }: { next?: string }) => `ACTIVATE:${next}` }));

import { getClubBySlug } from "@/lib/services/club.service";
import { enrollClubMember } from "@/lib/services/club-member.service";
import JoinClubPage from "../page";
import JoinCompletePage from "../complete/page";

const params = { params: Promise.resolve({ slug: "pine" }) };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getClubBySlug).mockResolvedValue({ clerkOrgId: "org_club" } as any);
  vi.mocked(enrollClubMember).mockResolvedValue({ ok: true, userId: "u1" });
});

describe("/join/[slug] is open for every club (the house coach always exists)", () => {
  it("shows the join flow without any trainer lookup", async () => {
    const html = renderToStaticMarkup(await JoinClubPage(params));
    expect(html).not.toContain("open yet");
  });

  it("renders the code form inside the AuthShell with the club headline when unverified", async () => {
    const { verifyJoinToken } = await import("@/lib/clubs/join-token");
    vi.mocked(verifyJoinToken).mockReturnValueOnce(false as any);
    const html = renderToStaticMarkup(await JoinClubPage(params));
    expect(html).toContain('data-slot="auth-shell"');
    expect(html).toContain("Join Pine Valley");
    expect(html).toContain("JOIN_FORM");
  });

  it("complete page enrolls the member", async () => {
    const html = renderToStaticMarkup(await JoinCompletePage(params));
    expect(html).toContain("ACTIVATE");
    expect(enrollClubMember).toHaveBeenCalled();
  });

  it("open-join clubs skip the access code", async () => {
    const { verifyJoinToken } = await import("@/lib/clubs/join-token");
    vi.mocked(verifyJoinToken).mockReturnValue(false as any);
    vi.mocked(getClubBySlug).mockResolvedValue({ clerkOrgId: "org_club", openJoin: true } as any);
    const html = renderToStaticMarkup(await JoinClubPage(params));
    expect(html).not.toContain("JOIN_FORM");
    const done = renderToStaticMarkup(await JoinCompletePage(params));
    expect(done).toContain("ACTIVATE:/onboarding/client");
    vi.mocked(verifyJoinToken).mockReturnValue(true as any);
  });

  it("card-required clubs go straight to membership checkout after enrolling", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(getClubBySlug).mockResolvedValue({ clerkOrgId: "org_club", trialRequiresCard: true, stripePriceId: "price_1" } as any);
    vi.mocked(prisma.memberSubscription.findUnique).mockResolvedValue({
      status: "TRIALING", stripeSubscriptionId: null, trialEndsAt: new Date(0),
    } as any);
    const html = renderToStaticMarkup(await JoinCompletePage(params));
    expect(html).toContain("ACTIVATE:/join/pine/checkout");
  });
});
