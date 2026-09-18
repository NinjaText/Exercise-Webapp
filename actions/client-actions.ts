"use server";

import { requireRole } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getClientIdsForTrainer } from "@/lib/services/client.service";
import { logAudit, deriveActorType, diffFields, AUDIT_ACTIONS } from "@/lib/services/audit-log.service";
import {
  updateClientProfileSchema,
  type UpdateClientProfileInput,
} from "@/lib/validators/client";

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

/**
 * Lets a trainer fill in or correct a client's intake record.
 *
 * The client's own onboarding form writes these fields, but it can be clicked
 * straight through — so this both updates an existing record and creates one
 * from nothing (hence `upsert`, not `update`). The personal fields live on
 * `User` and the rest on `ClientProfile`, which is why this touches two rows.
 */
export async function updateClientProfileAction(
  clientId: string,
  input: UpdateClientProfileInput
) {
  try {
    const trainer = await requireRole("TRAINER");
    await assertOwnsClient(trainer.id, clientId);

    const parsed = updateClientProfileSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false as const, error: parsed.error.issues[0].message };
    }
    const data = parsed.data;

    // Zod has already trimmed these, so "" is the only falsy string left — and
    // it means the same thing as absent. Store one value for "nothing on file".
    const text = (value: string | null | undefined) => value || null;

    const profileData = {
      primaryDiagnosis: text(data.primaryDiagnosis),
      secondaryDiagnoses: data.secondaryDiagnoses ?? [],
      painScore: data.painScore ?? null,
      activityLevel: text(data.activityLevel),
      // Blank stays null rather than becoming `new Date("")` — an Invalid Date.
      injuryDate: data.injuryDate ? new Date(data.injuryDate) : null,
      surgeryHistory: text(data.surgeryHistory),
      occupation: text(data.occupation),
      priorInjuries: data.priorInjuries ?? [],
      limitations: text(data.limitations),
      comorbidities: text(data.comorbidities),
      functionalChallenges: text(data.functionalChallenges),
      availableEquipment: data.availableEquipment ?? [],
      fitnessGoals: data.fitnessGoals ?? [],
      preferredDurationMinutes: data.preferredDurationMinutes ?? 25,
      preferredDaysPerWeek: data.preferredDaysPerWeek ?? 3,
    };

    const before = await prisma.clientProfile.findUnique({ where: { userId: clientId } });

    await prisma.user.update({
      where: { id: clientId },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        phone: text(data.phone),
        dateOfBirth: text(data.dateOfBirth),
      },
    });

    await prisma.clientProfile.upsert({
      where: { userId: clientId },
      update: profileData,
      create: { userId: clientId, ...profileData },
    });

    try {
      await logAudit({
        actorId: trainer.id,
        actorType: deriveActorType(trainer),
        actorName: `${trainer.firstName} ${trainer.lastName}`,
        action: AUDIT_ACTIONS.CLIENT_PROFILE_UPDATED,
        targetType: "ClientProfile",
        targetId: clientId,
        targetLabel: `${data.firstName} ${data.lastName}`.trim(),
        orgId: trainer.clerkOrgId ?? null,
        metadata: before
          ? diffFields(
              before as unknown as Record<string, unknown>,
              profileData as unknown as Record<string, unknown>,
              Object.keys(profileData)
            )
          : { created: true },
      });
    } catch (e) {
      console.error("logAudit failed for updateClientProfileAction", e);
    }

    revalidatePath("/clients");
    revalidatePath(`/clients/${clientId}`);
    return { success: true as const };
  } catch (e) {
    return {
      success: false as const,
      error: e instanceof Error ? e.message : "Failed to update client profile.",
    };
  }
}
