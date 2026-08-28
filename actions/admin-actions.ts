"use server";

import type { Prisma } from "@prisma/client";
import { requireSuperAdmin } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { logAudit, deriveActorType, AUDIT_ACTIONS } from "@/lib/services/audit-log.service";

async function logUserAction(
  action: string,
  admin: { id: string; firstName: string; lastName: string; email: string; role: "TRAINER" | "CLIENT" },
  userId: string,
  prefetchedTarget?: { firstName: string; lastName: string; clerkOrgId: string | null } | null
) {
  try {
    const target = prefetchedTarget !== undefined
      ? prefetchedTarget
      : await prisma.user.findUnique({ where: { id: userId } });
    await logAudit({
      actorId: admin.id,
      actorType: deriveActorType(admin),
      actorName: `${admin.firstName} ${admin.lastName}`,
      action,
      targetType: "User",
      targetId: userId,
      targetLabel: target ? `${target.firstName} ${target.lastName}` : undefined,
      orgId: target?.clerkOrgId ?? null,
    });
  } catch (e) {
    // Audit logging is additive only — a failure here must never affect the
    // outcome reported by the caller's business action.
    console.error("logUserAction failed", e);
  }
}

export async function archiveUserAction(userId: string) {
  try {
    const admin = await requireSuperAdmin();
    await prisma.user.update({ where: { id: userId }, data: { isActive: false } });
    await logUserAction(AUDIT_ACTIONS.USER_DEACTIVATED, admin, userId);
    revalidatePath("/admin/users");
    return { success: true as const };
  } catch (e) {
    return { success: false as const, error: String(e) };
  }
}

export async function restoreUserAction(userId: string) {
  try {
    const admin = await requireSuperAdmin();
    await prisma.user.update({ where: { id: userId }, data: { isActive: true } });
    await logUserAction(AUDIT_ACTIONS.USER_REACTIVATED, admin, userId);
    revalidatePath("/admin/users");
    return { success: true as const };
  } catch (e) {
    return { success: false as const, error: String(e) };
  }
}

export async function deleteUserAction(userId: string) {
  try {
    const admin = await requireSuperAdmin();

    // Captured before the delete so the audit label/org are still available
    // afterward (the row will be gone). A lookup failure here degrades to no
    // label rather than blocking the delete.
    const target = await prisma.user
      .findUnique({ where: { id: userId } })
      .catch((error) => {
        console.error("Failed to fetch existing user for audit label:", error);
        return null;
      });

    // Every one of these relations back to User is required (non-nullable)
    // and has no `onDelete: Cascade` in the schema, so a bare
    // `prisma.user.delete()` throws a relation-violation the moment any one
    // of them has a row — which for a real account is virtually always.
    //
    // These are split into two buckets:
    //  - "structural" rows another real user depends on as their own asset
    //    (a client's paid subscription, a trainer's sellable package or
    //    check-in template, a legacy plan that may still be assigned to a
    //    different client) — refuse with a specific reason instead of
    //    silently deleting something a third party relies on.
    //  - everything else — this user's own personal data with no
    //    independent value to anyone else (messages, notes, logs, their own
    //    subscription record) — deleted explicitly, leaf-first, alongside
    //    the account.
    const [packageCount, subscriptionCount, legacyPlanCount, checkInTemplateCount] = await Promise.all([
      prisma.coachPackage.count({ where: { trainerId: userId } }),
      prisma.clientSubscription.count({ where: { clientId: userId } }),
      prisma.workoutPlan.count({ where: { createdById: userId } }),
      prisma.checkInTemplate.count({ where: { trainerId: userId } }),
    ]);
    if (packageCount > 0) {
      return { success: false as const, error: `Cannot delete: this trainer has ${packageCount} coaching package(s) for sale. Remove them first.` };
    }
    if (subscriptionCount > 0) {
      return { success: false as const, error: `Cannot delete: this client has ${subscriptionCount} billing subscription(s) on file. Cancel them first.` };
    }
    if (legacyPlanCount > 0) {
      return { success: false as const, error: `Cannot delete: this trainer authored ${legacyPlanCount} legacy workout plan(s) that may still be assigned to other clients. Reassign or remove them first.` };
    }
    if (checkInTemplateCount > 0) {
      return { success: false as const, error: `Cannot delete: this trainer created ${checkInTemplateCount} check-in template(s) that may be assigned to other clients. Remove them first.` };
    }

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

    // Sequential, not $transaction — this codebase has no prior use of
    // multi-document transactions, and MongoDB only supports them on a
    // replica-set deployment. Each step is independently idempotent
    // (deleteMany on an already-empty set is a no-op), so a mid-sequence
    // failure just leaves the retry with less left to clean up.
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
    await prisma.user.delete({ where: { id: userId } });

    // Only log the deletion once it has actually happened — logging before
    // the delete would leave a false "deleted" audit row if the transaction
    // then fails (e.g. the relation-error path below).
    await logUserAction(AUDIT_ACTIONS.USER_DELETED, admin, userId, target);

    revalidatePath("/admin/users");
    return { success: true as const };
  } catch (e) {
    const isPrismaRelationError =
      e instanceof Error &&
      "code" in e &&
      (e as Prisma.PrismaClientKnownRequestError).code?.startsWith("P2");
    const msg = isPrismaRelationError
      ? "Cannot delete: this user has existing data that couldn't be fully cleared. Archive them instead."
      : "Failed to delete user.";
    return { success: false as const, error: msg };
  }
}
