import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    coachPackage: { count: vi.fn(), deleteMany: vi.fn() },
    clientSubscription: { count: vi.fn() },
    workoutPlan: { count: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
    checkInTemplate: { count: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
    checkInQuestion: { deleteMany: vi.fn() },
    workoutBlock: { findMany: vi.fn(), deleteMany: vi.fn() },
    blockExercise: { deleteMany: vi.fn() },
    planExercise: { deleteMany: vi.fn() },
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
  p.workoutPlan.findMany.mockResolvedValue([]);
  p.checkInTemplate.findMany.mockResolvedValue([]);
  p.workoutBlock.findMany.mockResolvedValue([]);
});

/** An authored WorkoutPlan plus the rows that hang off it, for the evaluator. */
interface PlanFixture {
  clientId: string | null;
  /** `WorkoutSession.clientId` — independent of the plan's own `clientId`. */
  sessionClientIds: string[];
  /** `ExerciseFeedback.clientId`, reached via `PlanExercise`. */
  feedbackClientIds: string[];
}

type WhereClause = Record<string, unknown>;

/**
 * Evaluates the `where` the service actually passes against in-memory plans.
 * Asserting on behaviour rather than only on the literal object means these
 * tests fail when the predicate stops COVERING a case, not merely when its
 * shape is reworded.
 */
function clauseMatches(clause: WhereClause, plan: PlanFixture): boolean {
  const entries = Object.entries(clause);
  if (entries.length !== 1) return entries.every(([k, v]) => clauseMatches({ [k]: v }, plan));
  const [key, value] = entries[0];

  if (key === "AND") return (value as WhereClause[]).every((c) => clauseMatches(c, plan));
  if (key === "OR") return (value as WhereClause[]).some((c) => clauseMatches(c, plan));
  // Every fixture is authored by the departing user; that is the premise.
  if (key === "createdById") return true;
  if (key === "clientId") {
    const cond = value as { not?: string | null } | string | null;
    if (cond && typeof cond === "object" && "not" in cond) return plan.clientId !== cond.not;
    return plan.clientId === cond;
  }
  if (key === "sessions") {
    const cond = (value as { some: { clientId: { not: string } } }).some.clientId;
    return plan.sessionClientIds.some((id) => id !== cond.not);
  }
  if (key === "exercises") {
    const cond = (value as { some: { feedback: { some: { clientId: { not: string } } } } }).some.feedback.some.clientId;
    return plan.feedbackClientIds.some((id) => id !== cond.not);
  }
  throw new Error(`unhandled clause in workoutPlan.count where: ${JSON.stringify(clause)}`);
}

function usePlanFixtures(plans: PlanFixture[]): void {
  p.workoutPlan.count.mockImplementation(async (args: { where: WhereClause }) =>
    plans.filter((plan) => clauseMatches(args.where, plan)).length
  );
}

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

  // The blockers exist to protect rows a third party depends on. There is no
  // UI to delete a check-in template and packages can only be deactivated, so
  // counting mere existence would lock a trainer out of deleting their
  // account forever — the exact thing Apple 5.1.1(v) forbids.
  it("only counts packages that have a subscriber", async () => {
    await findDeletionBlockers("u1", { includeActiveClients: false });
    expect(p.coachPackage.count).toHaveBeenCalledWith({
      where: { trainerId: "u1", subscriptions: { some: {} } },
    });
  });

  it("only counts check-in templates that have an assignment", async () => {
    await findDeletionBlockers("u1", { includeActiveClients: false });
    expect(p.checkInTemplate.count).toHaveBeenCalledWith({
      where: { trainerId: "u1", assignments: { some: {} } },
    });
  });

  // REGRESSION GUARD. `WorkoutSession.clientId` is independent of
  // `WorkoutPlan.clientId`, and `WorkoutSession.plan` / `PlanExercise.plan`
  // declare `onDelete: Cascade`. A trainer can unassign a plan, so looking at
  // the plan's current assignment alone let a plan holding another client's
  // sessions, pain scores and feedback pass the blocker and be deleted.
  it("counts legacy plans assigned to a different client OR holding another client's sessions or feedback", async () => {
    await findDeletionBlockers("u1", { includeActiveClients: false });
    expect(p.workoutPlan.count).toHaveBeenCalledWith({
      where: {
        createdById: "u1",
        OR: [
          { AND: [{ clientId: { not: null } }, { clientId: { not: "u1" } }] },
          { sessions: { some: { clientId: { not: "u1" } } } },
          { exercises: { some: { feedback: { some: { clientId: { not: "u1" } } } } } },
        ],
      },
    });
  });

  it("blocks when an unassigned authored plan holds a session belonging to another client", async () => {
    // The exact regression: trainer u1 authored the plan, client c1 trained
    // against it, then u1 unassigned it. `WorkoutSession.plan` cascades, so
    // deleting this plan would destroy c1's sessions, pain scores and actuals.
    usePlanFixtures([{ clientId: null, sessionClientIds: ["c1"], feedbackClientIds: [] }]);

    const blockers = await findDeletionBlockers("u1", { includeActiveClients: false });
    expect(blockers.map((b) => b.code)).toEqual(["LEGACY_PLANS"]);
    expect(blockers[0].count).toBe(1);
    // The message must not claim the plan is still assigned — it may be
    // unassigned and blocking purely because it holds training history.
    expect(blockers[0].message).not.toMatch(/still assigned to other clients/);
    expect(blockers[0].message).toMatch(/training history/);
  });

  it("blocks when an unassigned authored plan holds feedback belonging to another client", async () => {
    // `ExerciseFeedback` reaches the plan through `PlanExercise`, and both
    // hops declare `onDelete: Cascade`.
    usePlanFixtures([{ clientId: null, sessionClientIds: [], feedbackClientIds: ["c1"] }]);
    const blockers = await findDeletionBlockers("u1", { includeActiveClients: false });
    expect(blockers.map((b) => b.code)).toEqual(["LEGACY_PLANS"]);
  });

  it("does not block when the authored plan's only sessions belong to the departing user", async () => {
    // Unassigned and self-assigned plans whose whole history is the departing
    // user's own are their own data — blocking here would lock a trainer out
    // of deleting their account forever (Apple 5.1.1(v)).
    usePlanFixtures([
      { clientId: null, sessionClientIds: ["u1"], feedbackClientIds: ["u1"] },
      { clientId: "u1", sessionClientIds: ["u1"], feedbackClientIds: [] },
    ]);
    expect(await findDeletionBlockers("u1", { includeActiveClients: false })).toEqual([]);
  });

  it("blocks the last active trainer of an org that still has active clients", async () => {
    p.user.findUnique.mockResolvedValue({ role: "TRAINER", clerkOrgId: "org_1" });
    // First count: other active trainers (none). Second: active clients.
    p.user.count.mockResolvedValueOnce(0).mockResolvedValueOnce(3);
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

  // Clients are organization-wide in this schema, so a departing trainer was
  // being told to deactivate colleagues' clients. If a colleague is still
  // active the clients are not abandoned and the blocker does not apply.
  it("does not block a trainer when another active trainer remains in the org", async () => {
    p.user.findUnique.mockResolvedValue({ role: "TRAINER", clerkOrgId: "org_1" });
    p.user.count.mockResolvedValueOnce(1);
    expect(await findDeletionBlockers("u1", { includeActiveClients: true })).toEqual([]);
    expect(p.user.count).toHaveBeenCalledTimes(1);
    expect(p.user.count).toHaveBeenCalledWith({
      where: { clerkOrgId: "org_1", role: "TRAINER", isActive: true, id: { not: "u1" } },
    });
  });

  it("does not block the last active trainer when the org has no active clients", async () => {
    p.user.findUnique.mockResolvedValue({ role: "TRAINER", clerkOrgId: "org_1" });
    p.user.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    expect(await findDeletionBlockers("u1", { includeActiveClients: true })).toEqual([]);
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

  // findDeletionBlockers no longer refuses on the mere existence of these
  // rows, so deleteUserData has to clear them or the user row's restrict
  // would still fail.
  it("clears the structural rows the blockers no longer refuse on, before the user row", async () => {
    p.checkInTemplate.findMany.mockResolvedValue([{ id: "t1" }]);
    p.workoutPlan.findMany.mockResolvedValue([{ id: "p1" }]);
    p.workoutSession.findMany.mockResolvedValue([{ id: "ws1" }]);
    p.workoutBlock.findMany.mockResolvedValue([{ id: "b1" }]);

    await deleteUserData("u1");

    expect(p.coachPackage.deleteMany).toHaveBeenCalledWith({ where: { trainerId: "u1" } });
    expect(p.checkInQuestion.deleteMany).toHaveBeenCalledWith({ where: { templateId: { in: ["t1"] } } });
    expect(p.checkInTemplate.deleteMany).toHaveBeenCalledWith({ where: { trainerId: "u1" } });
    expect(p.blockExercise.deleteMany).toHaveBeenCalledWith({ where: { blockId: { in: ["b1"] } } });
    expect(p.workoutBlock.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["b1"] } } });
    expect(p.planExercise.deleteMany).toHaveBeenCalledWith({ where: { planId: { in: ["p1"] } } });
    expect(p.workoutPlan.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["p1"] } } });

    for (const fn of [
      p.coachPackage.deleteMany,
      p.checkInTemplate.deleteMany,
      p.planExercise.deleteMany,
      p.workoutPlan.deleteMany,
    ]) {
      expect(fn.mock.invocationCallOrder[0]).toBeLessThan(p.user.delete.mock.invocationCallOrder[0]);
    }
  });

  // REGRESSION GUARD, defence in depth. `WorkoutSession.clientId` is
  // independent of `WorkoutPlan.clientId`, so gathering the plan's sessions by
  // `planId` alone would sweep up another client's training history. The
  // blocker should already have refused such a plan, but the cleanup must not
  // depend on that.
  it("scopes the legacy-plan session cleanup to the departing user's own sessions", async () => {
    p.workoutPlan.findMany.mockResolvedValue([{ id: "p1" }]);
    p.workoutSession.findMany.mockResolvedValue([{ id: "ws1" }]);

    await deleteUserData("u1");

    expect(p.workoutSession.findMany).toHaveBeenCalledWith({
      where: { planId: { in: ["p1"] }, clientId: "u1" },
      select: { id: true },
    });
    // No `workoutSession` lookup anywhere in the function may be keyed on the
    // plan without also naming the departing user.
    for (const call of p.workoutSession.findMany.mock.calls) {
      const where = call[0].where as { planId?: unknown; clientId?: unknown };
      if (where.planId !== undefined) expect(where.clientId).toBe("u1");
    }
    expect(p.sessionExercise.deleteMany).toHaveBeenCalledWith({ where: { sessionId: { in: ["ws1"] } } });
    expect(p.workoutSession.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["ws1"] } } });
  });
});
