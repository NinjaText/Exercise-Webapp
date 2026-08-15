"use server";

import { requireSuperAdmin } from "@/lib/current-user";
import * as programService from "@/lib/services/program.service";
import { updateProgramSchema, assignProgramSchema } from "@/lib/validators/program";
import type { UpdateProgramInput } from "@/lib/validators/program";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { logAudit, diffFields, AUDIT_ACTIONS } from "@/lib/services/audit-log.service";

export async function updateAdminProgramAction(
  programId: string,
  input: UpdateProgramInput
) {
  const admin = await requireSuperAdmin();

  const existing = await prisma.program.findUnique({
    where: { id: programId },
    select: { isGlobal: true, name: true, description: true, status: true, trainer: { select: { clerkOrgId: true } } },
  });
  if (!existing) {
    return { success: false as const, error: "Program not found" };
  }
  if (existing.isGlobal) {
    return {
      success: false as const,
      error: "Use the Global Programs section to edit this program",
    };
  }

  const parsed = updateProgramSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }

  try {
    const updated = await programService.updateProgram(programId, parsed.data);
    const diff = diffFields(
      existing as unknown as Record<string, unknown>,
      parsed.data as unknown as Record<string, unknown>,
      ["name", "description", "status"]
    );
    await logAudit({
      actorId: admin.id,
      actorType: "SUPER_ADMIN",
      actorName: `${admin.firstName} ${admin.lastName}`,
      action: AUDIT_ACTIONS.PROGRAM_UPDATED,
      targetType: "Program",
      targetId: programId,
      targetLabel: updated.name,
      orgId: existing.trainer?.clerkOrgId ?? null,
      metadata: diff,
    });
    revalidatePath("/admin/programs");
    revalidatePath(`/admin/programs/${programId}`);
    return { success: true as const, data: updated };
  } catch (error) {
    console.error("Failed to update program (admin):", error);
    return { success: false as const, error: "Failed to update program" };
  }
}

export async function assignAdminProgramAction(input: {
  programId: string;
  clientId: string;
  startDate: string;
}) {
  await requireSuperAdmin();

  const parsed = assignProgramSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }

  const existing = await prisma.program.findUnique({
    where: { id: parsed.data.programId },
    select: { isGlobal: true, trainerId: true },
  });
  if (!existing) {
    return { success: false as const, error: "Program not found" };
  }
  if (existing.isGlobal) {
    return {
      success: false as const,
      error: "Use the Global Programs section to edit this program",
    };
  }
  if (!existing.trainerId) {
    return { success: false as const, error: "Program has no owning trainer" };
  }

  try {
    // Never mutate the source program in place — clone it so the original
    // (which may be a reusable template) stays assignable to other clients.
    const copy = await programService.duplicateProgram(
      parsed.data.programId,
      existing.trainerId,
      false
    );
    const result = await programService.assignProgram(
      copy.id,
      parsed.data.clientId,
      new Date(parsed.data.startDate)
    );
    revalidatePath("/admin/programs");
    revalidatePath(`/admin/programs/${parsed.data.programId}`);
    revalidatePath(`/clients/${parsed.data.clientId}`);
    revalidatePath("/dashboard");
    return { success: true as const, data: result };
  } catch (error) {
    console.error("Failed to assign program (admin):", error);
    return { success: false as const, error: "Failed to assign program" };
  }
}
