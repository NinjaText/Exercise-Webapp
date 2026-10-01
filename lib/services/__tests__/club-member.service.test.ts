import { describe, it, expect, vi, beforeEach } from "vitest";

const clerkMocks = vi.hoisted(() => ({
  getUser: vi.fn(async () => ({
    id: "clerk_1", firstName: "Sam", lastName: "Lee", imageUrl: "",
    primaryEmailAddressId: "e1", emailAddresses: [{ id: "e1", emailAddress: "sam@example.com" }],
  })),
  getOrganizationMembershipList: vi.fn(async () => ({ data: [] })),
  createOrganizationMembership: vi.fn(async () => ({})),
}));

vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: vi.fn(async () => ({
    users: { getUser: clerkMocks.getUser, getOrganizationMembershipList: clerkMocks.getOrganizationMembershipList },
    organizations: { createOrganizationMembership: clerkMocks.createOrganizationMembership },
  })),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
    organization: { findUnique: vi.fn() },
    memberSubscription: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findMany: vi.fn() },
    program: { findMany: vi.fn(), delete: vi.fn() },
    workoutSessionV2: { count: vi.fn() },
  },
}));
vi.mock("@/lib/services/program.service", () => ({
  duplicateProgram: vi.fn(async () => ({ id: "copy1" })),
  assignProgram: vi.fn(async () => ({})),
}));
vi.mock("@/lib/services/club-trainer.service", () => ({
  getClubTrainer: vi.fn(async () => ({ id: "staff1" })),
}));

import { prisma } from "@/lib/prisma";
import { duplicateProgram, assignProgram } from "@/lib/services/program.service";
import { getClubTrainer } from "@/lib/services/club-trainer.service";
import {
  enrollClubMember, ensureMemberSubscription, assignNextStarterProgram, sweepClubStarterPrograms,
} from "../club-member.service";

const club = {
  clerkOrgId: "org_club", type: "CLUB", trialDays: 14, starterProgramIds: ["t1", "t2"],
} as any;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
  vi.mocked(prisma.user.upsert).mockResolvedValue({ id: "u1" } as any);
  vi.mocked(prisma.memberSubscription.findUnique).mockResolvedValue(null);
  vi.mocked(prisma.memberSubscription.updateMany).mockResolvedValue({ count: 1 });
});

describe("enrollClubMember", () => {
  it("creates the CLIENT, Clerk membership and a trial", async () => {
    const res = await enrollClubMember({ clerkUserId: "clerk_1", club });
    expect(res).toEqual({ ok: true, userId: "u1" });
    expect(clerkMocks.createOrganizationMembership).toHaveBeenCalledWith({
      organizationId: "org_club", userId: "clerk_1", role: "org:member",
    });
    expect(prisma.user.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ role: "CLIENT", clerkOrgId: "org_club", email: "sam@example.com" }),
    }));
    expect(prisma.memberSubscription.create).toHaveBeenCalled();
  });

  it("refuses a trainer or another org's client and changes nothing", async () => {
    for (const existing of [
      { id: "u9", role: "TRAINER", clerkOrgId: "org_trainer" },
      { id: "u9", role: "CLIENT", clerkOrgId: "org_other" },
    ]) {
      vi.clearAllMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue(existing as any);
      expect(await enrollClubMember({ clerkUserId: "clerk_1", club })).toEqual({ ok: false, reason: "other_account" });
      expect(clerkMocks.createOrganizationMembership).not.toHaveBeenCalled();
      expect(prisma.user.upsert).not.toHaveBeenCalled();
      expect(prisma.memberSubscription.create).not.toHaveBeenCalled();
    }
  });

  it("is idempotent for someone already in this club", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "u1", role: "CLIENT", clerkOrgId: "org_club" } as any);
    clerkMocks.getOrganizationMembershipList.mockResolvedValueOnce({ data: [{ organization: { id: "org_club" } }] } as any);
    vi.mocked(prisma.memberSubscription.findUnique).mockResolvedValue({ id: "ms1" } as any);
    expect(await enrollClubMember({ clerkUserId: "clerk_1", club })).toEqual({ ok: true, userId: "u1" });
    expect(clerkMocks.createOrganizationMembership).not.toHaveBeenCalled();
    expect(prisma.memberSubscription.create).not.toHaveBeenCalled();
  });
});

describe("enrollClubMember upsert race", () => {
  const p2002 = () => Object.assign(new Error("Unique constraint failed"), { code: "P2002" });

  it("recovers when the Clerk webhook created the same user concurrently", async () => {
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce(null) // pre-check: no row yet
      .mockResolvedValueOnce({ id: "u7", role: "CLIENT", clerkOrgId: "org_club" } as any); // re-read after P2002
    vi.mocked(prisma.user.upsert).mockRejectedValueOnce(p2002());
    vi.mocked(prisma.user.update).mockResolvedValue({ id: "u7" } as any);

    expect(await enrollClubMember({ clerkUserId: "clerk_1", club })).toEqual({ ok: true, userId: "u7" });
    expect(prisma.user.findUnique).toHaveBeenLastCalledWith({ where: { clerkId: "clerk_1" } });
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { clerkId: "clerk_1" }, data: { clerkOrgId: "org_club" } });
    expect(prisma.memberSubscription.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: "u7", clerkOrgId: "org_club" }),
    });
  });

  it("refuses if the raced row belongs to someone else's org", async () => {
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "u7", role: "CLIENT", clerkOrgId: "org_other" } as any);
    vi.mocked(prisma.user.upsert).mockRejectedValueOnce(p2002());

    expect(await enrollClubMember({ clerkUserId: "clerk_1", club })).toEqual({ ok: false, reason: "other_account" });
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.memberSubscription.create).not.toHaveBeenCalled();
  });

  it("rethrows other database errors", async () => {
    vi.mocked(prisma.user.upsert).mockRejectedValueOnce(new Error("db down"));
    await expect(enrollClubMember({ clerkUserId: "clerk_1", club })).rejects.toThrow("db down");
  });
});

describe("ensureMemberSubscription", () => {
  it("starts the trial from now + trialDays", async () => {
    const now = new Date("2026-10-01T00:00:00Z");
    await ensureMemberSubscription("u1", club, now);
    expect(prisma.memberSubscription.create).toHaveBeenCalledWith({
      data: {
        userId: "u1",
        clerkOrgId: "org_club",
        status: "TRIALING",
        trialEndsAt: new Date("2026-10-15T00:00:00Z"),
        // Explicit nulls: Mongo `{ field: null }` filters miss unwritten fields.
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        currentPeriodEnd: null,
      },
    });
  });
  it("never resets an existing trial", async () => {
    vi.mocked(prisma.memberSubscription.findUnique).mockResolvedValue({ id: "ms1" } as any);
    await ensureMemberSubscription("u1", club);
    expect(prisma.memberSubscription.create).not.toHaveBeenCalled();
  });
  it("tolerates a concurrent create (unique violation)", async () => {
    vi.mocked(prisma.memberSubscription.create).mockRejectedValue(Object.assign(new Error("dup"), { code: "P2002" }));
    await expect(ensureMemberSubscription("u1", club)).resolves.toBeUndefined();
  });
});

describe("assignNextStarterProgram", () => {
  beforeEach(() => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "u1", role: "CLIENT", clerkOrgId: "org_club" } as any);
    vi.mocked(prisma.organization.findUnique).mockResolvedValue(club);
  });

  it("copies then assigns the first template for a new member", async () => {
    vi.mocked(prisma.program.findMany).mockResolvedValue([]);
    expect(await assignNextStarterProgram("u1")).toBe("assigned");
    expect(duplicateProgram).toHaveBeenCalledWith("t1", "staff1", false);
    expect(assignProgram).toHaveBeenCalledWith("copy1", "u1", expect.any(Date));
    expect(prisma.memberSubscription.update).toHaveBeenCalledWith({ where: { userId: "u1" }, data: { starterStatus: "ASSIGNED" } });
  });

  it("waits while the current starter still has open sessions", async () => {
    vi.mocked(prisma.program.findMany).mockResolvedValue([{ id: "c1", sourceTemplateId: "t1" }] as any);
    vi.mocked(prisma.workoutSessionV2.count).mockResolvedValue(2);
    expect(await assignNextStarterProgram("u1")).toBe("in_progress");
    expect(duplicateProgram).not.toHaveBeenCalled();
    expect(prisma.memberSubscription.update).toHaveBeenCalledWith({ where: { userId: "u1" }, data: { starterStatus: "ASSIGNED" } });
  });

  it("returns in_progress without copying when another worker holds the claim", async () => {
    vi.mocked(prisma.memberSubscription.updateMany).mockResolvedValue({ count: 0 });
    expect(await assignNextStarterProgram("u1")).toBe("in_progress");
    expect(duplicateProgram).not.toHaveBeenCalled();
    expect(prisma.program.findMany).not.toHaveBeenCalled();
  });

  it("deletes the orphan copy when assignProgram fails", async () => {
    vi.mocked(prisma.program.findMany).mockResolvedValue([]);
    vi.mocked(assignProgram).mockRejectedValueOnce(new Error("assign failed"));
    await expect(assignNextStarterProgram("u1")).rejects.toThrow("assign failed");
    expect(prisma.program.delete).toHaveBeenCalledWith({ where: { id: "copy1" } });
    expect(prisma.memberSubscription.update).toHaveBeenCalledWith({ where: { userId: "u1" }, data: { starterStatus: "FAILED" } });
  });

  it("moves on to the next template once the current one is finished", async () => {
    vi.mocked(prisma.program.findMany).mockResolvedValue([{ id: "c1", sourceTemplateId: "t1" }] as any);
    vi.mocked(prisma.workoutSessionV2.count).mockResolvedValue(0);
    expect(await assignNextStarterProgram("u1")).toBe("assigned");
    expect(duplicateProgram).toHaveBeenCalledWith("t2", "staff1", false);
  });

  it("reports done when the list is exhausted", async () => {
    vi.mocked(prisma.program.findMany).mockResolvedValue([
      { id: "c1", sourceTemplateId: "t1" }, { id: "c2", sourceTemplateId: "t2" },
    ] as any);
    vi.mocked(prisma.workoutSessionV2.count).mockResolvedValue(0);
    expect(await assignNextStarterProgram("u1")).toBe("done");
  });

  it("marks FAILED and rethrows when the copy fails", async () => {
    vi.mocked(prisma.program.findMany).mockResolvedValue([]);
    vi.mocked(duplicateProgram).mockRejectedValueOnce(new Error("clone aborted"));
    await expect(assignNextStarterProgram("u1")).rejects.toThrow("clone aborted");
    expect(prisma.memberSubscription.update).toHaveBeenCalledWith({ where: { userId: "u1" }, data: { starterStatus: "FAILED" } });
  });

  it("copies as the club trainer", async () => {
    vi.mocked(prisma.program.findMany).mockResolvedValue([]);
    await assignNextStarterProgram("u1");
    expect(getClubTrainer).toHaveBeenCalledWith("org_club");
  });

  it("releases the claim to PENDING and skips when the club has no trainer", async () => {
    vi.mocked(prisma.program.findMany).mockResolvedValue([]);
    vi.mocked(getClubTrainer).mockResolvedValueOnce(null);
    expect(await assignNextStarterProgram("u1")).toBe("skipped");
    expect(duplicateProgram).not.toHaveBeenCalled();
    expect(prisma.memberSubscription.update).toHaveBeenCalledWith({ where: { userId: "u1" }, data: { starterStatus: "PENDING" } });
    expect(prisma.memberSubscription.update).not.toHaveBeenCalledWith({ where: { userId: "u1" }, data: { starterStatus: "FAILED" } });
  });

  it("skips users who are not in a club", async () => {
    vi.mocked(prisma.organization.findUnique).mockResolvedValue({ ...club, type: null });
    expect(await assignNextStarterProgram("u1")).toBe("skipped");
  });
});

describe("sweepClubStarterPrograms", () => {
  it("includes stale ASSIGNING claims and counts rejected members as failed", async () => {
    const now = new Date("2026-10-01T00:00:00Z");
    vi.mocked(prisma.memberSubscription.findMany).mockResolvedValue([{ userId: "u1" }, { userId: "u2" }] as any);
    vi.mocked(prisma.user.findUnique).mockImplementation((async ({ where }: any) =>
      where.id === "u1" ? { id: "u1", role: "CLIENT", clerkOrgId: "org_club" } : null) as any);
    vi.mocked(prisma.organization.findUnique).mockResolvedValue(club);
    vi.mocked(prisma.program.findMany).mockResolvedValue([]);
    vi.mocked(duplicateProgram).mockRejectedValueOnce(new Error("boom"));

    const res = await sweepClubStarterPrograms(now);

    const where = vi.mocked(prisma.memberSubscription.findMany).mock.calls[0][0]!.where as any;
    expect(where.OR).toContainEqual({
      starterStatus: "ASSIGNING",
      updatedAt: { lt: new Date(now.getTime() - 10 * 60 * 1000) },
    });
    expect(res).toEqual({ processed: 2, assigned: 0, failed: 1, stoppedEarly: false });
  });

  it("only sweeps ACTIVE members and trials that haven't ended", async () => {
    const now = new Date("2026-10-01T00:00:00Z");
    vi.mocked(prisma.memberSubscription.findMany).mockResolvedValue([]);
    await sweepClubStarterPrograms(now);
    const where = vi.mocked(prisma.memberSubscription.findMany).mock.calls[0][0]!.where as any;
    expect(where.status).toBeUndefined();
    expect(where.AND).toEqual([
      { OR: [{ status: "ACTIVE" }, { status: "TRIALING", trialEndsAt: { gte: now } }] },
    ]);
  });

  it("stops starting new batches once the time budget is spent", async () => {
    const now = new Date("2026-10-01T00:00:00Z");
    const subs = Array.from({ length: 12 }, (_, i) => ({ userId: `u${i}` }));
    vi.mocked(prisma.memberSubscription.findMany).mockResolvedValue(subs as any);
    // Not club members → each resolves "skipped" quickly; we only count calls.
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    // Start (0) and first-batch check (0); after that batch the clock is past the 240s budget.
    const clock = vi.fn().mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValue(240_001);

    const res = await sweepClubStarterPrograms(now, clock);

    expect(prisma.user.findUnique).toHaveBeenCalledTimes(5);
    expect(res).toEqual({ processed: 5, assigned: 0, failed: 0, stoppedEarly: true });
  });

  it("runs every batch while inside the budget", async () => {
    const subs = Array.from({ length: 12 }, (_, i) => ({ userId: `u${i}` }));
    vi.mocked(prisma.memberSubscription.findMany).mockResolvedValue(subs as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    const res = await sweepClubStarterPrograms(new Date(), () => 0);
    expect(res).toEqual({ processed: 12, assigned: 0, failed: 0, stoppedEarly: false });
  });
});
