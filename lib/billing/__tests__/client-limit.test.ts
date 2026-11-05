import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { count: vi.fn(), findMany: vi.fn() },
    trainerSubscription: { findUnique: vi.fn(), findFirst: vi.fn() },
  },
}));
vi.mock("@/lib/services/invitation.service", () => ({ getOrgInvitations: vi.fn() }));
vi.mock("@/lib/org-capabilities.server", () => ({ getCapabilitiesForUser: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getOrgInvitations } from "@/lib/services/invitation.service";
import { getCapabilitiesForUser } from "@/lib/org-capabilities.server";
import { getUserCapabilities } from "@/lib/org-capabilities";
import { checkClientLimit, evaluateClientLimit } from "@/lib/billing/client-limit";

const trainer = { id: "t1", role: "TRAINER" as const, clerkOrgId: "org_t", email: "coach@x.com" };
const trainerCaps = getUserCapabilities({ orgType: "TRAINER", role: "TRAINER", coachingActive: false });
const clubCaps = getUserCapabilities({ orgType: "CLUB", role: "TRAINER", coachingActive: false });

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.BILLING_EXEMPT_EMAILS;
  vi.mocked(getCapabilitiesForUser).mockResolvedValue(trainerCaps);
  vi.mocked(prisma.trainerSubscription.findUnique).mockResolvedValue({ plan: "STARTER" } as any);
  vi.mocked(prisma.user.count).mockResolvedValue(8);
  vi.mocked(getOrgInvitations).mockResolvedValue([
    { id: "i1", email: "a@x.com", status: "pending" },
    { id: "i2", email: "b@x.com", status: "accepted" },
  ] as any);
});

describe("evaluateClientLimit", () => {
  it.each([
    ["STARTER", 9, 1, true],
    ["STARTER", 10, 1, false],
    ["PRO", 30, 1, false],
    ["PRO", 29, 1, true],
    ["UNLIMITED", 150, 1, false],
    ["UNLIMITED", 149, 1, true],
  ] as const)("%s with %i used, adding %i → ok=%s", (plan, used, adding, ok) => {
    expect(evaluateClientLimit({ plan, used, adding }).ok).toBe(ok);
  });

  it("explains the limit and links to upgrade", () => {
    const r = evaluateClientLimit({ plan: "PRO", used: 30, adding: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("Growth plan includes up to 30 active clients");
      expect(r.upgradeHref).toBe("/settings/billing");
    }
  });
});

describe("checkClientLimit", () => {
  it("counts active clients plus pending invitations", async () => {
    const r = await checkClientLimit(trainer, 1);
    expect(r).toMatchObject({ ok: true, used: 9, remaining: 1 });
    expect((await checkClientLimit(trainer, 2)).ok).toBe(false);
  });

  it("does not limit clubs / house coaches", async () => {
    vi.mocked(getCapabilitiesForUser).mockResolvedValue(clubCaps);
    vi.mocked(prisma.user.count).mockResolvedValue(500);
    expect((await checkClientLimit(trainer, 1)).ok).toBe(true);
  });

  it("does not limit billing-exempt accounts or admins", async () => {
    vi.mocked(prisma.user.count).mockResolvedValue(500);
    process.env.BILLING_EXEMPT_EMAILS = "coach@x.com";
    expect((await checkClientLimit(trainer, 1)).ok).toBe(true);
    delete process.env.BILLING_EXEMPT_EMAILS;
    expect((await checkClientLimit(trainer, 1, { isAdmin: true })).ok).toBe(true);
    expect(getCapabilitiesForUser).not.toHaveBeenCalled();
  });

  it("still counts clients when Clerk can't list invitations", async () => {
    vi.mocked(getOrgInvitations).mockRejectedValue(new Error("clerk down"));
    vi.mocked(prisma.user.count).mockResolvedValue(10);
    expect((await checkClientLimit(trainer, 1)).ok).toBe(false);
  });

  it("uses the org's trainer subscription for a second trainer in the org", async () => {
    vi.mocked(prisma.trainerSubscription.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: "owner", email: "owner@x.com" }] as any);
    vi.mocked(prisma.trainerSubscription.findFirst).mockResolvedValue({ plan: "UNLIMITED" } as any);
    vi.mocked(prisma.user.count).mockResolvedValue(100);
    expect((await checkClientLimit(trainer, 1)).ok).toBe(true);
  });
});
