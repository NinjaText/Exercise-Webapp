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
vi.mock("@/lib/services/club-trainer.service", () => ({
  getClubTrainer: vi.fn(),
  CLUB_NOT_OPEN_MESSAGE: "This club isn't open yet. Please check back soon.",
}));
vi.mock("@/lib/services/club-member.service", () => ({
  enrollClubMember: vi.fn(),
  assignNextStarterProgram: vi.fn(),
}));
vi.mock("@/lib/services/branding.service", () => ({
  getOrgBranding: vi.fn(async () => ({ displayName: "Pine Valley" })),
}));
vi.mock("@/lib/ui/clerk-appearance", () => ({ clerkAuthAppearance: () => ({}) }));
vi.mock("@/lib/branding/types", () => ({ toViewModel: (b: unknown) => b }));
vi.mock("@/components/branding/brand-style", () => ({ BrandStyle: () => null }));
vi.mock("@/components/branding/org-identity", () => ({ OrgIdentity: () => null }));
vi.mock("@/lib/clubs/join-token", () => ({ JOIN_COOKIE: "club_join", verifyJoinToken: vi.fn(() => true) }));
vi.mock("../join-code-form", () => ({ JoinCodeForm: () => "JOIN_FORM" }));
vi.mock("../complete/activate-org", () => ({ ActivateOrg: () => "ACTIVATE" }));

import { getClubBySlug } from "@/lib/services/club.service";
import { getClubTrainer } from "@/lib/services/club-trainer.service";
import { enrollClubMember } from "@/lib/services/club-member.service";
import JoinClubPage from "../page";
import JoinCompletePage from "../complete/page";

const params = { params: Promise.resolve({ slug: "pine" }) };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getClubBySlug).mockResolvedValue({ clerkOrgId: "org_club" } as any);
  vi.mocked(getClubTrainer).mockResolvedValue({ id: "t1" } as any);
  vi.mocked(enrollClubMember).mockResolvedValue({ ok: true, userId: "u1" });
});

describe("/join/[slug] closed until the club trainer accepts", () => {
  it("shows the not-open message when the club has no trainer", async () => {
    vi.mocked(getClubTrainer).mockResolvedValue(null);
    const html = renderToStaticMarkup(await JoinClubPage(params));
    expect(html).toContain("This club isn&#x27;t open yet. Please check back soon.");
    expect(html).not.toContain("JOIN_FORM");
    expect(getClubTrainer).toHaveBeenCalledWith("org_club");
  });

  it("is open once the trainer exists", async () => {
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

  it("complete page refuses to enroll when the club has no trainer", async () => {
    vi.mocked(getClubTrainer).mockResolvedValue(null);
    const html = renderToStaticMarkup(await JoinCompletePage(params));
    expect(html).toContain("open yet");
    expect(enrollClubMember).not.toHaveBeenCalled();
  });

  it("complete page enrolls when the club has a trainer", async () => {
    const html = renderToStaticMarkup(await JoinCompletePage(params));
    expect(html).toContain("ACTIVATE");
    expect(enrollClubMember).toHaveBeenCalled();
  });
});
