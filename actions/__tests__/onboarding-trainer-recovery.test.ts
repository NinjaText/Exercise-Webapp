import { describe, it, expect, vi, beforeEach } from "vitest";

const clerk = vi.hoisted(() => ({
  createOrganization: vi.fn(async () => ({ id: "org_new" })),
}));
const stripeCustomers = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
  clerkClient: vi.fn(async () => ({ organizations: { createOrganization: clerk.createOrganization } })),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { upsert: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    organization: { create: vi.fn(), findUnique: vi.fn() },
    trainerSubscription: { findUnique: vi.fn(), create: vi.fn() },
  },
}));
vi.mock("@/lib/services/audit-log.service", () => ({ logUserAudit: vi.fn(), AUDIT_ACTIONS: {} }));
vi.mock("@/lib/stripe", () => ({ stripe: { customers: stripeCustomers } }));
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
import { completeTrainerOnboarding } from "../onboarding-actions";

const trainerForm = { firstName: "A", lastName: "B", organizationName: "Clinic" };
const trainerOrgCaps = getUserCapabilities({ orgType: "TRAINER", role: "TRAINER", coachingActive: false });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue({ userId: "clerk_1", orgId: null } as any);
  vi.mocked(currentUser).mockResolvedValue({ emailAddresses: [{ emailAddress: "a@x.com" }], imageUrl: "" } as any);
  vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
  vi.mocked(prisma.user.upsert).mockResolvedValue({ id: "u1" } as any);
  vi.mocked(prisma.organization.findUnique).mockResolvedValue(null);
  vi.mocked(prisma.trainerSubscription.findUnique).mockResolvedValue(null);
  stripeCustomers.create.mockResolvedValue({ id: "cus_1" });
});

describe("completeTrainerOnboarding failure recovery", () => {
  it("never marks the trainer onboarded when the Stripe customer can't be created", async () => {
    stripeCustomers.create.mockRejectedValue(new Error("Stripe unreachable"));

    const result = await completeTrainerOnboarding(trainerForm);

    expect(result).toEqual({ success: false, error: "Failed to set up organization. Please try again." });
    const upsert = vi.mocked(prisma.user.upsert).mock.calls[0][0] as any;
    expect(upsert.create.onboarded).toBe(false);
    expect(upsert.update.onboarded).toBeUndefined();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("marks the trainer onboarded only after the trial subscription exists", async () => {
    await expect(completeTrainerOnboarding(trainerForm)).rejects.toThrow(/^REDIRECT:\/dashboard$/);

    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { onboarded: true } });
    const subOrder = vi.mocked(prisma.trainerSubscription.create).mock.invocationCallOrder[0];
    const onboardedOrder = vi.mocked(prisma.user.update).mock.invocationCallOrder[0];
    expect(subOrder).toBeLessThan(onboardedOrder);
  });

  it("reuses the org from a failed attempt instead of creating a second one", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "u1", role: "TRAINER", clerkOrgId: "org_prev" } as any);
    vi.mocked(getCapabilitiesForUser).mockResolvedValue(trainerOrgCaps);
    vi.mocked(prisma.organization.findUnique).mockResolvedValue({ clerkOrgId: "org_prev" } as any);

    await expect(completeTrainerOnboarding(trainerForm)).rejects.toThrow(/^REDIRECT:\/dashboard$/);

    expect(clerk.createOrganization).not.toHaveBeenCalled();
    expect(prisma.organization.create).not.toHaveBeenCalled();
    const upsert = vi.mocked(prisma.user.upsert).mock.calls[0][0] as any;
    expect(upsert.update.clerkOrgId).toBe("org_prev");
    expect(prisma.trainerSubscription.create).toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { onboarded: true } });
  });

  it("does not reuse an org the user is only a client of", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "u1", role: "CLIENT", clerkOrgId: "org_trainer" } as any);
    vi.mocked(getCapabilitiesForUser).mockResolvedValue(
      getUserCapabilities({ orgType: "TRAINER", role: "CLIENT", coachingActive: false })
    );
    vi.mocked(prisma.organization.findUnique).mockResolvedValue({ clerkOrgId: "org_trainer" } as any);

    await expect(completeTrainerOnboarding(trainerForm)).rejects.toThrow(/^REDIRECT:\/dashboard$/);

    expect(clerk.createOrganization).toHaveBeenCalled();
  });
});
