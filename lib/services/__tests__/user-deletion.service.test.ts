import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    coachPackage: { count: vi.fn() },
    clientSubscription: { count: vi.fn() },
    workoutPlan: { count: vi.fn() },
    checkInTemplate: { count: vi.fn() },
    user: { findUnique: vi.fn(), count: vi.fn(), delete: vi.fn() },
    workoutSessionV2: { findMany: vi.fn(), deleteMany: vi.fn() },
    sessionExerciseLog: { findMany: vi.fn(), deleteMany: vi.fn() },
    workoutSession: { findMany: vi.fn(), deleteMany: vi.fn() },
    habitDefinition: { findMany: vi.fn(), deleteMany: vi.fn() },
    setLog: { deleteMany: vi.fn() },
    sessionFeedback: { deleteMany: vi.fn() },
    sessionExercise: { deleteMany: vi.fn() },
    exerciseFeedback: { deleteMany: vi.fn() },
    message: { deleteMany: vi.fn() },
    notification: { deleteMany: vi.fn() },
    notificationPreference: { deleteMany: vi.fn() },
    nutritionTarget: { deleteMany: vi.fn() },
    nutritionLog: { deleteMany: vi.fn() },
    nutritionWaterLog: { deleteMany: vi.fn() },
    nutritionAiSummary: { deleteMany: vi.fn() },
    nutritionComment: { deleteMany: vi.fn() },
    checkInResponse: { deleteMany: vi.fn() },
    checkInAssignment: { deleteMany: vi.fn() },
    bodyMetric: { deleteMany: vi.fn() },
    progressPhoto: { deleteMany: vi.fn() },
    habitLog: { deleteMany: vi.fn() },
    clinicalNote: { deleteMany: vi.fn() },
    coachBranding: { deleteMany: vi.fn() },
    trainerSubscription: { deleteMany: vi.fn() },
    pendingProgramAssignment: { deleteMany: vi.fn() },
    dismissedInsight: { deleteMany: vi.fn() },
    assessment: { deleteMany: vi.fn() },
    clientProfile: { deleteMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { findDeletionBlockers, deleteUserData } from "../user-deletion.service";

const p = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;

beforeEach(() => {
  vi.clearAllMocks();
  p.coachPackage.count.mockResolvedValue(0);
  p.clientSubscription.count.mockResolvedValue(0);
  p.workoutPlan.count.mockResolvedValue(0);
  p.checkInTemplate.count.mockResolvedValue(0);
  p.workoutSessionV2.findMany.mockResolvedValue([]);
  p.sessionExerciseLog.findMany.mockResolvedValue([]);
  p.workoutSession.findMany.mockResolvedValue([]);
  p.habitDefinition.findMany.mockResolvedValue([]);
});

describe("findDeletionBlockers", () => {
  it("returns no blockers for a clean account", async () => {
    expect(await findDeletionBlockers("u1", { includeActiveClients: false })).toEqual([]);
  });

  it("reports structural rows other users depend on", async () => {
    p.coachPackage.count.mockResolvedValue(2);
    p.checkInTemplate.count.mockResolvedValue(1);
    const blockers = await findDeletionBlockers("u1", { includeActiveClients: false });
    expect(blockers.map((b) => b.code)).toEqual(["PACKAGES", "CHECKIN_TEMPLATES"]);
    expect(blockers[0].count).toBe(2);
    expect(blockers[0].message).toMatch(/2 coaching package/);
  });

  it("blocks a trainer who still has active clients when asked to", async () => {
    p.user.findUnique.mockResolvedValue({ role: "TRAINER", clerkOrgId: "org_1" });
    p.user.count.mockResolvedValue(3);
    const blockers = await findDeletionBlockers("u1", { includeActiveClients: true });
    expect(blockers).toEqual([expect.objectContaining({ code: "ACTIVE_CLIENTS", count: 3 })]);
    // The count is organization-wide (this schema has no per-trainer client
    // assignment), so the message must attribute the clients to the
    // organization rather than to the person being deleted.
    expect(blockers[0].message).toMatch(/organization/);
    expect(blockers[0].message).not.toMatch(/^you still have/);
    expect(p.user.count).toHaveBeenCalledWith({
      where: { clerkOrgId: "org_1", role: "CLIENT", isActive: true },
    });
  });

  it("does not check active clients for a client account", async () => {
    p.user.findUnique.mockResolvedValue({ role: "CLIENT", clerkOrgId: "org_1" });
    expect(await findDeletionBlockers("u1", { includeActiveClients: true })).toEqual([]);
    expect(p.user.count).not.toHaveBeenCalled();
  });
});

describe("deleteUserData", () => {
  it("deletes leaf rows before the user row", async () => {
    p.workoutSessionV2.findMany.mockResolvedValue([{ id: "s1" }]);
    p.sessionExerciseLog.findMany.mockResolvedValue([{ id: "l1" }]);
    await deleteUserData("u1");
    expect(p.setLog.deleteMany).toHaveBeenCalledWith({ where: { sessionExerciseLogId: { in: ["l1"] } } });
    expect(p.message.deleteMany).toHaveBeenCalledWith({ where: { OR: [{ senderId: "u1" }, { recipientId: "u1" }] } });
    expect(p.user.delete).toHaveBeenCalledWith({ where: { id: "u1" } });
    expect(p.setLog.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(p.user.delete.mock.invocationCallOrder[0]);
  });

  it("deletes the notification preference row before the user, since the email system creates one for nearly every user", async () => {
    await deleteUserData("u1");

    expect(p.notificationPreference.deleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
    expect(p.notificationPreference.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(p.user.delete.mock.invocationCallOrder[0]);
  });

  it("deletes required-relation rows that were previously neither deleted nor blocked (pending assignments, dismissed insights), and clinical data explicitly rather than relying on emulated cascade (assessments, client profile)", async () => {
    await deleteUserData("u1");

    expect(p.pendingProgramAssignment.deleteMany).toHaveBeenCalledWith({ where: { trainerId: "u1" } });
    expect(p.dismissedInsight.deleteMany).toHaveBeenCalledWith({ where: { trainerId: "u1" } });
    expect(p.assessment.deleteMany).toHaveBeenCalledWith({ where: { clientId: "u1" } });
    expect(p.clientProfile.deleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } });

    expect(p.pendingProgramAssignment.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(p.user.delete.mock.invocationCallOrder[0]);
    expect(p.dismissedInsight.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(p.user.delete.mock.invocationCallOrder[0]);
    expect(p.assessment.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(p.user.delete.mock.invocationCallOrder[0]);
    expect(p.clientProfile.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(p.user.delete.mock.invocationCallOrder[0]);
  });
});
