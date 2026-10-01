import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("@clerk/nextjs", () => ({ SignUp: (p: { forceRedirectUrl: string }) => `SIGNUP:${p.forceRedirectUrl}` }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`);
  }),
}));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: vi.fn() } } }));
vi.mock("@/lib/org-capabilities.server", () => ({ getOrgForUser: vi.fn() }));
vi.mock("@/lib/services/club-trainer.service", () => ({
  ensureClubTrainerUser: vi.fn(),
  resolveClubTrainerInvite: vi.fn(),
  revokeRefusedTrainerMembership: vi.fn(),
}));
vi.mock("@/lib/services/branding.service", () => ({
  getOrgBranding: vi.fn(async () => ({ displayName: "Pine Valley" })),
}));
vi.mock("@/lib/branding/types", () => ({ toViewModel: (b: unknown) => b }));
vi.mock("@/components/branding/brand-style", () => ({ BrandStyle: () => null }));
vi.mock("@/components/branding/org-identity", () => ({ OrgIdentity: () => null }));
vi.mock("@/components/onboarding/club-trainer-onboarding-form", () => ({
  ClubTrainerOnboardingForm: (p: { clubName: string }) => `FORM:${p.clubName}`,
}));

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getOrgForUser } from "@/lib/org-capabilities.server";
import {
  ensureClubTrainerUser,
  resolveClubTrainerInvite,
  revokeRefusedTrainerMembership,
} from "@/lib/services/club-trainer.service";
import { getOrgBranding } from "@/lib/services/branding.service";
import { ClubError } from "@/lib/services/club-error";
import Page from "../page";

const club = { clerkOrgId: "org_club", type: "CLUB" };
const trainer = { id: "t1", role: "TRAINER", clerkOrgId: "org_club", onboarded: false, firstName: "", lastName: "" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue({ userId: "clerk_t" } as any);
  vi.mocked(prisma.user.findUnique).mockResolvedValue(trainer as any);
  vi.mocked(getOrgForUser).mockResolvedValue(club as any);
  vi.mocked(resolveClubTrainerInvite).mockResolvedValue(null);
  vi.mocked(ensureClubTrainerUser).mockImplementation((async () => prisma.user.findUnique({} as any)) as any);
});

async function html() {
  return renderToStaticMarkup(await Page());
}

describe("/onboarding/club-trainer", () => {
  it("renders SignUp for a signed-out visitor", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as any);
    expect(await html()).toContain("SIGNUP:/onboarding/club-trainer");
  });

  it("renders the branded name form for an un-onboarded club trainer", async () => {
    expect(await html()).toContain("FORM:Pine Valley");
    expect(getOrgBranding).toHaveBeenCalledWith("org_club");
  });

  it("runs an existing club trainer row through ensureClubTrainerUser (repairs the transfer)", async () => {
    await html();
    expect(ensureClubTrainerUser).toHaveBeenCalledWith("clerk_t", club);
    expect(resolveClubTrainerInvite).not.toHaveBeenCalled();
  });

  it("sends an onboarded club trainer to the dashboard", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...trainer, onboarded: true } as any);
    await expect(Page()).rejects.toThrow("REDIRECT:/dashboard");
  });

  it("creates the row from the Clerk invite when the webhook hasn't yet", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(resolveClubTrainerInvite).mockResolvedValue(club as any);
    vi.mocked(ensureClubTrainerUser).mockResolvedValue(trainer as any);
    expect(await html()).toContain("FORM:");
    expect(ensureClubTrainerUser).toHaveBeenCalledWith("clerk_t", club);
  });

  it("refuses when the account belongs elsewhere", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(resolveClubTrainerInvite).mockResolvedValue(club as any);
    vi.mocked(ensureClubTrainerUser).mockRejectedValue(new ClubError("trainer_email_taken"));
    const out = await html();
    expect(out).toContain("isn&#x27;t a club trainer");
    expect(out).not.toContain("FORM:");
    expect(revokeRefusedTrainerMembership).toHaveBeenCalledWith("clerk_t", "org_club");
  });

  it("revokes the club seat when an existing account of another org accepted the invite", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...trainer, clerkOrgId: "org_t" } as any);
    vi.mocked(getOrgForUser).mockResolvedValueOnce({ clerkOrgId: "org_t", type: null } as any);
    vi.mocked(resolveClubTrainerInvite).mockResolvedValue(club as any);
    vi.mocked(ensureClubTrainerUser).mockRejectedValue(new ClubError("trainer_email_taken"));
    expect(await html()).toContain("isn&#x27;t a club trainer");
    expect(revokeRefusedTrainerMembership).toHaveBeenCalledWith("clerk_t", "org_club");
  });

  it("refuses a user with no club trainer invite", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    expect(await html()).toContain("isn&#x27;t a club trainer");
    expect(ensureClubTrainerUser).not.toHaveBeenCalled();
    expect(revokeRefusedTrainerMembership).not.toHaveBeenCalled();
  });

  it("refuses a trainer-org trainer and a club member", async () => {
    vi.mocked(getOrgForUser).mockResolvedValue({ clerkOrgId: "org_t", type: null } as any);
    expect(await html()).toContain("isn&#x27;t a club trainer");
    expect(ensureClubTrainerUser).not.toHaveBeenCalled();
    vi.mocked(getOrgForUser).mockResolvedValue(club as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...trainer, role: "CLIENT" } as any);
    expect(await html()).toContain("isn&#x27;t a club trainer");
  });
});
