import { prisma } from "@/lib/prisma";

export type DeletionBlockerCode =
  | "PACKAGES"
  | "CLIENT_SUBSCRIPTIONS"
  | "LEGACY_PLANS"
  | "CHECKIN_TEMPLATES"
  | "ACTIVE_CLIENTS";

export interface DeletionBlocker {
  code: DeletionBlockerCode;
  count: number;
  /** Sentence fragment; callers prefix "Cannot delete: " or show as-is. */
  message: string;
}

/**
 * Rows another real user depends on as their own asset (a client's paid
 * subscription, a trainer's sellable package or check-in template, a legacy
 * plan that may still be assigned to a different client). We refuse with a
 * specific reason instead of silently deleting something a third party
 * relies on. `includeActiveClients` adds the self-serve rule from the mobile
 * spec §6: a trainer must deactivate or reassign clients before leaving.
 */
export async function findDeletionBlockers(
  userId: string,
  options: { includeActiveClients: boolean }
): Promise<DeletionBlocker[]> {
  const [packageCount, subscriptionCount, legacyPlanCount, checkInTemplateCount] = await Promise.all([
    prisma.coachPackage.count({ where: { trainerId: userId } }),
    prisma.clientSubscription.count({ where: { clientId: userId } }),
    prisma.workoutPlan.count({ where: { createdById: userId } }),
    prisma.checkInTemplate.count({ where: { trainerId: userId } }),
  ]);

  const blockers: DeletionBlocker[] = [];
  if (packageCount > 0) {
    blockers.push({ code: "PACKAGES", count: packageCount, message: `this trainer has ${packageCount} coaching package(s) for sale. Remove them first.` });
  }
  if (subscriptionCount > 0) {
    blockers.push({ code: "CLIENT_SUBSCRIPTIONS", count: subscriptionCount, message: `this client has ${subscriptionCount} billing subscription(s) on file. Cancel them first.` });
  }
  if (legacyPlanCount > 0) {
    blockers.push({ code: "LEGACY_PLANS", count: legacyPlanCount, message: `this trainer authored ${legacyPlanCount} legacy workout plan(s) that may still be assigned to other clients. Reassign or remove them first.` });
  }
  if (checkInTemplateCount > 0) {
    blockers.push({ code: "CHECKIN_TEMPLATES", count: checkInTemplateCount, message: `this trainer created ${checkInTemplateCount} check-in template(s) that may be assigned to other clients. Remove them first.` });
  }

  if (options.includeActiveClients) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, clerkOrgId: true } });
    if (user?.role === "TRAINER" && user.clerkOrgId) {
      const activeClients = await prisma.user.count({
        where: { clerkOrgId: user.clerkOrgId, role: "CLIENT", isActive: true },
      });
      if (activeClients > 0) {
        blockers.push({ code: "ACTIVE_CLIENTS", count: activeClients, message: `your organization still has ${activeClients} active client(s). Deactivate or reassign them before deleting your account.` });
      }
    }
  }

  return blockers;
}

/**
 * Hard-deletes a user and their personal data, leaf-first.
 *
 * Most relations back to User are required with no referential action
 * declared, which defaults to a restrict — a bare `prisma.user.delete()`
 * throws a relation-violation the moment any one of them has a row. That's
 * why this function deletes everything explicitly before touching the user
 * row. Five relations DO declare `onDelete: Cascade` and so are removed
 * automatically by Prisma when the user is deleted: `ClientProfile.user`,
 * `Assessment.client`, `ExerciseUsage.trainer`, `ExerciseFavorite.user`, and
 * `Collection.trainer`. Of those, `ClientProfile` and `Assessment` hold
 * clinical data (diagnoses, comorbidities, pain scores, surgery/injury
 * history), so they are also deleted explicitly below rather than relying
 * solely on the emulated cascade — `deleteMany` on an already-empty set is a
 * no-op, so this is safe even where the cascade also fires.
 *
 * Sequential, not $transaction — this codebase has no prior use of
 * multi-document transactions, and MongoDB only supports them on a
 * replica-set deployment. Each step is independently idempotent (deleteMany
 * on an already-empty set is a no-op), so a mid-sequence failure just leaves
 * the retry with less left to clean up.
 *
 * Callers must run `findDeletionBlockers` first.
 */
export async function deleteUserData(userId: string): Promise<void> {
  const v2SessionIds = (
    await prisma.workoutSessionV2.findMany({ where: { clientId: userId }, select: { id: true } })
  ).map((s) => s.id);
  const v2LogIds = v2SessionIds.length
    ? (await prisma.sessionExerciseLog.findMany({ where: { sessionId: { in: v2SessionIds } }, select: { id: true } })).map((l) => l.id)
    : [];
  const v1SessionIds = (
    await prisma.workoutSession.findMany({ where: { clientId: userId }, select: { id: true } })
  ).map((s) => s.id);
  const habitIds = (
    await prisma.habitDefinition.findMany({ where: { clientId: userId }, select: { id: true } })
  ).map((h) => h.id);

  if (v2LogIds.length) await prisma.setLog.deleteMany({ where: { sessionExerciseLogId: { in: v2LogIds } } });
  if (v2SessionIds.length) {
    await prisma.sessionExerciseLog.deleteMany({ where: { sessionId: { in: v2SessionIds } } });
    await prisma.sessionFeedback.deleteMany({ where: { sessionId: { in: v2SessionIds } } });
  }
  await prisma.workoutSessionV2.deleteMany({ where: { clientId: userId } });
  if (v1SessionIds.length) await prisma.sessionExercise.deleteMany({ where: { sessionId: { in: v1SessionIds } } });
  await prisma.workoutSession.deleteMany({ where: { clientId: userId } });
  await prisma.exerciseFeedback.deleteMany({ where: { clientId: userId } });
  await prisma.message.deleteMany({ where: { OR: [{ senderId: userId }, { recipientId: userId }] } });
  await prisma.notification.deleteMany({ where: { userId } });
  // Created lazily the first time the user is emailed (for the unsubscribe
  // token), so virtually every active user has one. Required relation, no
  // cascade: leaving it would make `prisma.user.delete` throw.
  await prisma.notificationPreference.deleteMany({ where: { userId } });
  await prisma.nutritionTarget.deleteMany({ where: { clientId: userId } });
  await prisma.nutritionLog.deleteMany({ where: { clientId: userId } });
  await prisma.nutritionWaterLog.deleteMany({ where: { clientId: userId } });
  await prisma.nutritionAiSummary.deleteMany({ where: { clientId: userId } });
  await prisma.nutritionComment.deleteMany({ where: { OR: [{ clientId: userId }, { authorId: userId }] } });
  await prisma.checkInResponse.deleteMany({ where: { clientId: userId } });
  await prisma.checkInAssignment.deleteMany({ where: { clientId: userId } });
  await prisma.bodyMetric.deleteMany({ where: { clientId: userId } });
  await prisma.progressPhoto.deleteMany({ where: { clientId: userId } });
  if (habitIds.length) await prisma.habitLog.deleteMany({ where: { habitId: { in: habitIds } } });
  await prisma.habitDefinition.deleteMany({ where: { clientId: userId } });
  await prisma.clinicalNote.deleteMany({ where: { OR: [{ clientId: userId }, { trainerId: userId }] } });
  await prisma.coachBranding.deleteMany({ where: { trainerId: userId } });
  await prisma.trainerSubscription.deleteMany({ where: { trainerId: userId } });
  await prisma.pendingProgramAssignment.deleteMany({ where: { trainerId: userId } });
  await prisma.dismissedInsight.deleteMany({ where: { trainerId: userId } });
  await prisma.assessment.deleteMany({ where: { clientId: userId } });
  await prisma.clientProfile.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });
}
