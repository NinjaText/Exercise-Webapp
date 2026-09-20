"use server";

import type { Prisma } from "@prisma/client";
import { requireSuperAdmin } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { logAudit, deriveActorType, AUDIT_ACTIONS } from "@/lib/services/audit-log.service";
import { findDeletionBlockers, deleteUserData } from "@/lib/services/user-deletion.service";

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

    const blockers = await findDeletionBlockers(userId, { includeActiveClients: false });
    if (blockers.length > 0) {
      return { success: false as const, error: `Cannot delete: ${blockers[0].message}` };
    }

    await deleteUserData(userId);

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
