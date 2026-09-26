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
 * subscription, a sellable package somebody actually bought, a check-in
 * template assigned to a client, a legacy plan assigned to a different
 * client). We refuse with a specific reason instead of silently deleting
 * something a third party relies on.
 *
 * These checks are dependency-aware, not existence-aware. There is no UI to
 * delete a check-in template and packages can only be deactivated, so a
 * trainer who ever created one would otherwise be permanently unable to
 * delete their account — which is exactly what Apple 5.1.1(v) forbids. A row
 * nobody depends on is the departing user's own data and `deleteUserData`
 * removes it.
 *
 * `includeActiveClients` adds the self-serve rule from the mobile spec §6.
 */
export async function findDeletionBlockers(
  userId: string,
  options: { includeActiveClients: boolean }
): Promise<DeletionBlocker[]> {
  const [packageCount, subscriptionCount, legacyPlanCount, checkInTemplateCount] = await Promise.all([
    // Only packages someone has actually subscribed to. An unsold package is
    // the trainer's own listing and is cleaned up on delete.
    prisma.coachPackage.count({ where: { trainerId: userId, subscriptions: { some: {} } } }),
    prisma.clientSubscription.count({ where: { clientId: userId } }),
    // Only plans assigned to a DIFFERENT client. Unassigned plans and plans
    // this user assigned to themselves are their own data.
    prisma.workoutPlan.count({
      where: {
        createdById: userId,
        AND: [{ clientId: { not: null } }, { clientId: { not: userId } }],
      },
    }),
    // Only templates with at least one assignment. `CheckInAssignment`
    // declares `onDelete: Cascade` from its template, so deleting an assigned
    // template would take a client's whole check-in history with it.
    prisma.checkInTemplate.count({ where: { trainerId: userId, assignments: { some: {} } } }),
  ]);

  const blockers: DeletionBlocker[] = [];
  if (packageCount > 0) {
    blockers.push({ code: "PACKAGES", count: packageCount, message: `this trainer has ${packageCount} coaching package(s) with active subscribers. Cancel those subscriptions first.` });
  }
  if (subscriptionCount > 0) {
    blockers.push({ code: "CLIENT_SUBSCRIPTIONS", count: subscriptionCount, message: `this client has ${subscriptionCount} billing subscription(s) on file. Cancel them first.` });
  }
  if (legacyPlanCount > 0) {
    blockers.push({ code: "LEGACY_PLANS", count: legacyPlanCount, message: `this trainer authored ${legacyPlanCount} legacy workout plan(s) still assigned to other clients. Reassign or remove them first.` });
  }
  if (checkInTemplateCount > 0) {
    blockers.push({ code: "CHECKIN_TEMPLATES", count: checkInTemplateCount, message: `this trainer created ${checkInTemplateCount} check-in template(s) assigned to other clients. Unassign them first.` });
  }

  if (options.includeActiveClients) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, clerkOrgId: true } });
    if (user?.role === "TRAINER" && user.clerkOrgId) {
      // Clients belong to the organization, not to an individual trainer —
      // this schema has no per-trainer client assignment, so the count below
      // is organization-wide. In a multi-trainer clinic a colleague still
      // covers those clients, so a departing trainer must not be told to
      // deactivate other people's clients. Only the last active trainer is
      // blocked, because then the clients really would be abandoned.
      const otherActiveTrainers = await prisma.user.count({
        where: {
          clerkOrgId: user.clerkOrgId,
          role: "TRAINER",
          isActive: true,
          id: { not: userId },
        },
      });
      if (otherActiveTrainers === 0) {
        const activeClients = await prisma.user.count({
          where: { clerkOrgId: user.clerkOrgId, role: "CLIENT", isActive: true },
        });
        if (activeClients > 0) {
          blockers.push({ code: "ACTIVE_CLIENTS", count: activeClients, message: `your organization still has ${activeClients} active client(s) and you are its only active trainer. Deactivate or reassign them before deleting your account.` });
        }
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
 * Callers MUST run `findDeletionBlockers` first and abort if it returns
 * anything. This function deletes leaf rows before it can discover a
 * restrict violation on the user row, so calling it on a blocked user
 * destroys health data and then fails.
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

  // Structural rows `findDeletionBlockers` has already cleared as having no
  // third-party dependents: an unsold package, a template nobody is assigned
  // to, a legacy plan that is unassigned or assigned to this user. They hang
  // off required relations to User, so they must go before the user row.
  // Deleted leaf-first rather than trusting the emulated cascade, for the
  // same reason as everything above.
  await prisma.coachPackage.deleteMany({ where: { trainerId: userId } });

  const checkInTemplateIds = (
    await prisma.checkInTemplate.findMany({ where: { trainerId: userId }, select: { id: true } })
  ).map((t) => t.id);
  if (checkInTemplateIds.length) {
    await prisma.checkInQuestion.deleteMany({ where: { templateId: { in: checkInTemplateIds } } });
  }
  await prisma.checkInTemplate.deleteMany({ where: { trainerId: userId } });

  const legacyPlanIds = (
    await prisma.workoutPlan.findMany({ where: { createdById: userId }, select: { id: true } })
  ).map((plan) => plan.id);
  if (legacyPlanIds.length) {
    const planSessionIds = (
      await prisma.workoutSession.findMany({ where: { planId: { in: legacyPlanIds } }, select: { id: true } })
    ).map((session) => session.id);
    if (planSessionIds.length) {
      await prisma.sessionExercise.deleteMany({ where: { sessionId: { in: planSessionIds } } });
      await prisma.workoutSession.deleteMany({ where: { id: { in: planSessionIds } } });
    }
    const planBlockIds = (
      await prisma.workoutBlock.findMany({ where: { planId: { in: legacyPlanIds } }, select: { id: true } })
    ).map((block) => block.id);
    if (planBlockIds.length) {
      await prisma.blockExercise.deleteMany({ where: { blockId: { in: planBlockIds } } });
      await prisma.workoutBlock.deleteMany({ where: { id: { in: planBlockIds } } });
    }
    // `Message.plan`/`Message.planExercise` are optional relations, so Prisma
    // nulls them rather than refusing.
    await prisma.planExercise.deleteMany({ where: { planId: { in: legacyPlanIds } } });
    await prisma.workoutPlan.deleteMany({ where: { id: { in: legacyPlanIds } } });
  }

  await prisma.user.delete({ where: { id: userId } });
}
