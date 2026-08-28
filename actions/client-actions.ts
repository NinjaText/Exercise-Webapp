"use server";

import { requireRole } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getClientIdsForTrainer } from "@/lib/services/client.service";
import { logAudit, deriveActorType, AUDIT_ACTIONS } from "@/lib/services/audit-log.service";

async function assertOwnsClient(trainerId: string, clientId: string) {
  const clientIds = await getClientIdsForTrainer(trainerId);
  if (!clientIds.includes(clientId)) {
    throw new Error("You don't have access to this client.");
  }
}

export async function archiveClientAction(clientId: string) {
  try {
    const trainer = await requireRole("TRAINER");
    await assertOwnsClient(trainer.id, clientId);

    await prisma.user.update({ where: { id: clientId }, data: { isActive: false } });

    try {
      await logAudit({
        actorId: trainer.id,
        actorType: deriveActorType(trainer),
        actorName: `${trainer.firstName} ${trainer.lastName}`,
        action: AUDIT_ACTIONS.USER_DEACTIVATED,
        targetType: "User",
        targetId: clientId,
        orgId: trainer.clerkOrgId ?? null,
      });
    } catch (e) {
      console.error("logAudit failed for archiveClientAction", e);
    }

    revalidatePath("/clients");
    revalidatePath(`/clients/${clientId}`);
    return { success: true as const };
  } catch (e) {
    return { success: false as const, error: e instanceof Error ? e.message : "Failed to archive client." };
  }
}

export async function restoreClientAction(clientId: string) {
  try {
    const trainer = await requireRole("TRAINER");
    await assertOwnsClient(trainer.id, clientId);

    await prisma.user.update({ where: { id: clientId }, data: { isActive: true } });

    try {
      await logAudit({
        actorId: trainer.id,
        actorType: deriveActorType(trainer),
        actorName: `${trainer.firstName} ${trainer.lastName}`,
        action: AUDIT_ACTIONS.USER_REACTIVATED,
        targetType: "User",
        targetId: clientId,
        orgId: trainer.clerkOrgId ?? null,
      });
    } catch (e) {
      console.error("logAudit failed for restoreClientAction", e);
    }

    revalidatePath("/clients");
    revalidatePath(`/clients/${clientId}`);
    return { success: true as const };
  } catch (e) {
    return { success: false as const, error: e instanceof Error ? e.message : "Failed to restore client." };
  }
}
