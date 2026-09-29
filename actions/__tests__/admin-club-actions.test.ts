import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/current-user", () => ({ requireSuperAdmin: vi.fn(async () => ({ id: "admin1", role: "TRAINER", email: "a@x.com", firstName: "A", lastName: "D", clerkOrgId: null })) }));
vi.mock("@/lib/services/audit-log.service", () => ({ logUserAudit: vi.fn(), diffFields: vi.fn(() => undefined) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    memberSubscription: { findUnique: vi.fn(), updateMany: vi.fn() },
    organization: { findUnique: vi.fn() },
  },
}));
vi.mock("@clerk/nextjs/server", () => ({ clerkClient: vi.fn() }));
vi.mock("@/lib/stripe", () => ({ stripe: {} }));
vi.mock("@/lib/services/club.service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/services/club.service")>("@/lib/services/club.service");
  return { ...actual, createClub: vi.fn(), updateClub: vi.fn(), setOrgType: vi.fn() };
});

import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/current-user";
import { logUserAudit } from "@/lib/services/audit-log.service";
import { createClub, setOrgType, ClubError } from "@/lib/services/club.service";
import { createClubAction, extendMemberTrialAction, setOrgTypeAction } from "../admin-club-actions";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.memberSubscription.updateMany).mockResolvedValue({ count: 1 } as any);
});

const form = { name: "Pine", joinSlug: "pine", joinCode: "PINE24", trialDays: "14", stripePriceId: "price_1", starterProgramIds: ["p1"] };

describe("admin club actions", () => {
  it("requires super admin", async () => {
    vi.mocked(requireSuperAdmin).mockRejectedValueOnce(new Error("NEXT_REDIRECT"));
    await expect(createClubAction(form)).rejects.toThrow("NEXT_REDIRECT");
    expect(createClub).not.toHaveBeenCalled();
  });

  it("creates a club and audits it", async () => {
    vi.mocked(createClub).mockResolvedValue({ clerkOrgId: "org_new", name: "Pine" } as any);
    expect(await createClubAction(form)).toEqual({ ok: true, clerkOrgId: "org_new" });
    expect(logUserAudit).toHaveBeenCalled();
  });

  it("turns ClubError into a user-facing error", async () => {
    vi.mocked(createClub).mockRejectedValue(new ClubError("slug_taken", "That join link is already used by another club."));
    expect(await createClubAction(form)).toEqual({ ok: false, error: "That join link is already used by another club." });
  });

  it("extends a trial from the later of now and the current end", async () => {
    const end = new Date(Date.now() + 2 * 86400_000);
    vi.mocked(prisma.memberSubscription.findUnique).mockResolvedValue({ userId: "u1", status: "TRIALING", trialEndsAt: end, stripeSubscriptionId: null } as any);
    expect((await extendMemberTrialAction("u1", 7)).ok).toBe(true);
    const args = vi.mocked(prisma.memberSubscription.updateMany).mock.calls[0][0] as any;
    expect(args.where).toEqual({
      userId: "u1",
      trialEndsAt: end,
      OR: [{ status: "TRIALING" }, { status: "CANCELED", stripeSubscriptionId: null }],
    });
    expect(args.data.status).toBe("TRIALING");
    expect(args.data.remindersSent).toEqual([]);
    expect(args.data.trialEndsAt.getTime()).toBe(end.getTime() + 7 * 86400_000);
  });

  it("returns an error and skips the audit when the row changed underneath", async () => {
    vi.mocked(prisma.memberSubscription.findUnique).mockResolvedValue({ userId: "u1", status: "TRIALING", trialEndsAt: new Date(), stripeSubscriptionId: null } as any);
    vi.mocked(prisma.memberSubscription.updateMany).mockResolvedValue({ count: 0 } as any);
    expect(await extendMemberTrialAction("u1", 7)).toEqual({ ok: false, error: "This member's billing changed — refresh and try again." });
    expect(logUserAudit).not.toHaveBeenCalled();
  });

  it("extends a canceled member with no Stripe subscription", async () => {
    vi.mocked(prisma.memberSubscription.findUnique).mockResolvedValue({ userId: "u1", status: "CANCELED", trialEndsAt: new Date(Date.now() - 86400_000), stripeSubscriptionId: null } as any);
    expect((await extendMemberTrialAction("u1", 7)).ok).toBe(true);
    expect(prisma.memberSubscription.updateMany).toHaveBeenCalled();
  });

  it("returns ok:false when the database throws", async () => {
    vi.mocked(prisma.memberSubscription.findUnique).mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await extendMemberTrialAction("u1", 7)).ok).toBe(false);
  });

  it("refuses an invalid org type without calling the service", async () => {
    expect(await setOrgTypeAction("org_1", "ADMIN" as any)).toEqual({ ok: false, error: "Invalid org type." });
    expect(setOrgType).not.toHaveBeenCalled();
  });

  it("refuses to extend a paying member or a bad day count", async () => {
    vi.mocked(prisma.memberSubscription.findUnique).mockResolvedValue({ userId: "u1", status: "ACTIVE", trialEndsAt: new Date(), stripeSubscriptionId: "sub_1" } as any);
    expect((await extendMemberTrialAction("u1", 7)).ok).toBe(false);
    expect((await extendMemberTrialAction("u1", 0)).ok).toBe(false);
    expect((await extendMemberTrialAction("u1", 91)).ok).toBe(false);
    expect(prisma.memberSubscription.updateMany).not.toHaveBeenCalled();
  });

  it("surfaces the has_clients guard on type change", async () => {
    vi.mocked(setOrgType).mockRejectedValue(new ClubError("has_clients", "Org type can't change once it has clients."));
    expect(await setOrgTypeAction("org_1", "TRAINER")).toEqual({ ok: false, error: "Org type can't change once it has clients." });
  });
});
