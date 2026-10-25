import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(async () => ({ userId: "clerk_1" })) }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`);
  }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: vi.fn() }, trainerSubscription: { findUnique: vi.fn() } },
}));
vi.mock("@/lib/org-capabilities.server", () => ({ getCapabilitiesForUser: vi.fn() }));
vi.mock("@/components/onboarding/onboarding-form", () => ({ OnboardingForm: () => null }));
vi.mock("@/components/auth/auth-shell", () => ({ AuthShell: () => null }));

import { prisma } from "@/lib/prisma";
import { getCapabilitiesForUser } from "@/lib/org-capabilities.server";
import { getUserCapabilities } from "@/lib/org-capabilities";
import OnboardingPage from "../page";

const caps = (orgType: "CLUB" | "TRAINER", role: "TRAINER" | "CLIENT") =>
  getUserCapabilities({ orgType, role, coachingActive: false });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("/onboarding", () => {
  it("shows the form to a new user", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    await expect(OnboardingPage()).resolves.toBeTruthy();
  });

  it("lets an onboarded trainer-org trainer with no subscription finish setup", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "t1", role: "TRAINER", onboarded: true } as any);
    vi.mocked(getCapabilitiesForUser).mockResolvedValue(caps("TRAINER", "TRAINER"));
    vi.mocked(prisma.trainerSubscription.findUnique).mockResolvedValue(null);
    await expect(OnboardingPage()).resolves.toBeTruthy();
  });

  it("sends an onboarded trainer with a subscription to the dashboard", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "t1", role: "TRAINER", onboarded: true } as any);
    vi.mocked(getCapabilitiesForUser).mockResolvedValue(caps("TRAINER", "TRAINER"));
    vi.mocked(prisma.trainerSubscription.findUnique).mockResolvedValue({ id: "s1" } as any);
    await expect(OnboardingPage()).rejects.toThrow(/^REDIRECT:\/dashboard$/);
  });

  it("sends a club house coach (never billed) to the dashboard", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "t1", role: "TRAINER", onboarded: true } as any);
    vi.mocked(getCapabilitiesForUser).mockResolvedValue(caps("CLUB", "TRAINER"));
    await expect(OnboardingPage()).rejects.toThrow(/^REDIRECT:\/dashboard$/);
    expect(prisma.trainerSubscription.findUnique).not.toHaveBeenCalled();
  });

  it("sends an onboarded client to the dashboard", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "c1", role: "CLIENT", onboarded: true } as any);
    await expect(OnboardingPage()).rejects.toThrow(/^REDIRECT:\/dashboard$/);
  });
});
