import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(async () => ({ userId: "clerk_1" })) }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`);
  }),
}));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: vi.fn() } } }));
vi.mock("@/lib/org-capabilities.server", () => ({ getCapabilitiesForUser: vi.fn() }));
vi.mock("@/components/onboarding/onboarding-form", () => ({ OnboardingForm: () => "TRAINER_FORM" }));
vi.mock("@/lib/services/club-trainer.service", () => ({ resolveClubTrainerInvite: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getCapabilitiesForUser } from "@/lib/org-capabilities.server";
import { getUserCapabilities } from "@/lib/org-capabilities";
import { resolveClubTrainerInvite } from "@/lib/services/club-trainer.service";
import OnboardingPage from "../page";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveClubTrainerInvite).mockResolvedValue(null);
});

describe("/onboarding (trainer-org signup)", () => {
  it("redirects an un-onboarded club trainer to /onboarding/club-trainer", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "t1", role: "TRAINER", clerkOrgId: "org_club", onboarded: false } as any);
    vi.mocked(getCapabilitiesForUser).mockResolvedValue(getUserCapabilities({ orgType: "CLUB", role: "TRAINER", coachingActive: false }));
    await expect(OnboardingPage()).rejects.toThrow(/^REDIRECT:\/onboarding\/club-trainer$/);
  });

  it("renders the signup form for a new user and for a trainer-org trainer (regression)", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    await expect(OnboardingPage()).resolves.toBeTruthy();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "t1", role: "TRAINER", clerkOrgId: null, onboarded: false } as any);
    vi.mocked(getCapabilitiesForUser).mockResolvedValue(getUserCapabilities({ orgType: "TRAINER", role: "TRAINER", coachingActive: false }));
    await expect(OnboardingPage()).resolves.toBeTruthy();
  });

  it("renders the form in AuthShell's wide column with product branding", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    const html = renderToStaticMarkup(await OnboardingPage());
    expect(html).toContain('data-slot="auth-shell"');
    expect(html).toMatch(/data-slot="auth-form-column" data-size="wide"/);
    expect(html).toContain("TRAINER_FORM");
    expect(html).toContain("INMOTUS RX");
  });

  it("redirects an invited club trainer whose row the webhook hasn't created yet", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(resolveClubTrainerInvite).mockResolvedValue({ clerkOrgId: "org_club", type: "CLUB" } as any);
    await expect(OnboardingPage()).rejects.toThrow(/^REDIRECT:\/onboarding\/club-trainer$/);
    expect(resolveClubTrainerInvite).toHaveBeenCalledWith("clerk_1");
  });
});
