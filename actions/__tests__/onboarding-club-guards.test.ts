import { describe, it, expect, vi, beforeEach } from "vitest";

const clerk = vi.hoisted(() => ({
  createOrganization: vi.fn(async () => ({ id: "org_new" })),
}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
  clerkClient: vi.fn(async () => ({ organizations: { createOrganization: clerk.createOrganization } })),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { upsert: vi.fn(), findUnique: vi.fn() },
    organization: { create: vi.fn() },
    trainerSubscription: { findUnique: vi.fn(), create: vi.fn() },
    clientProfile: { upsert: vi.fn() },
  },
}));
vi.mock("@/lib/services/audit-log.service", () => ({ logUserAudit: vi.fn(), AUDIT_ACTIONS: {} }));
vi.mock("@/lib/stripe", () => ({ stripe: { customers: { create: vi.fn(async () => ({ id: "cus_1" })) } } }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`);
  }),
}));
vi.mock("@/lib/org-capabilities.server", () => ({ getCapabilitiesForUser: vi.fn() }));

import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getCapabilitiesForUser } from "@/lib/org-capabilities.server";
import { getUserCapabilities } from "@/lib/org-capabilities";
import { completeTrainerOnboarding, completeClientOnboarding } from "../onboarding-actions";

const clubCaps = (role: "TRAINER" | "CLIENT") => getUserCapabilities({ orgType: "CLUB", role, coachingActive: false });
const trainerOrgCaps = getUserCapabilities({ orgType: "TRAINER", role: "TRAINER", coachingActive: false });
const trainerForm = { firstName: "A", lastName: "B", organizationName: "Clinic" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue({ userId: "clerk_1", orgId: null } as any);
  vi.mocked(currentUser).mockResolvedValue({ emailAddresses: [{ emailAddress: "a@x.com" }], imageUrl: "" } as any);
  vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
  vi.mocked(prisma.user.upsert).mockResolvedValue({ id: "u1" } as any);
  vi.mocked(prisma.trainerSubscription.findUnique).mockResolvedValue(null);
});

describe("completeTrainerOnboarding club guard", () => {
  it.each([["club house coach", "TRAINER"], ["club member", "CLIENT"]] as const)(
    "refuses an existing %s without creating an org",
    async (_l, role) => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "u1", role, clerkOrgId: "org_club" } as any);
      vi.mocked(getCapabilitiesForUser).mockResolvedValue(clubCaps(role));
      expect(await completeTrainerOnboarding(trainerForm)).toEqual({
        success: false,
        error: "This account already belongs to a club.",
      });
      expect(clerk.createOrganization).not.toHaveBeenCalled();
      expect(prisma.user.upsert).not.toHaveBeenCalled();
    }
  );

  it("first-time trainer-org signup is unchanged (regression)", async () => {
    await expect(completeTrainerOnboarding(trainerForm)).rejects.toThrow(/^REDIRECT:\/dashboard$/);
    expect(getCapabilitiesForUser).not.toHaveBeenCalled();
    expect(clerk.createOrganization).toHaveBeenCalledWith({ name: "Clinic", createdBy: "clerk_1" });
    expect(prisma.trainerSubscription.create).toHaveBeenCalled();
  });

  it("an existing trainer-org user may still finish signup", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "u1", role: "TRAINER", clerkOrgId: null } as any);
    vi.mocked(getCapabilitiesForUser).mockResolvedValue(trainerOrgCaps);
    await expect(completeTrainerOnboarding(trainerForm)).rejects.toThrow(/^REDIRECT:\/dashboard$/);
    expect(clerk.createOrganization).toHaveBeenCalled();
  });
});

describe("completeClientOnboarding", () => {
  it("creates a normal invited client (regression)", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "clerk_1", orgId: "org_t" } as any);
    await expect(completeClientOnboarding({ firstName: "A", lastName: "B" })).rejects.toThrow(/^REDIRECT:\/dashboard$/);
    expect(prisma.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ role: "CLIENT", clerkOrgId: "org_t" }) })
    );
  });
});
