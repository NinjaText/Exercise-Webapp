"use server";

import { requireSuperAdmin } from "@/lib/current-user";
import * as programService from "@/lib/services/program.service";
import { createProgramSchema, updateProgramSchema } from "@/lib/validators/program";
import type { CreateProgramInput, UpdateProgramInput } from "@/lib/validators/program";
import { revalidatePath } from "next/cache";
import { generateProgram } from "@/lib/services/ai.service";
import {
  categorizeGeneratedProgram,
  buildCategorizationContextFromParams,
} from "@/lib/services/program-categorization.service";
import { prisma } from "@/lib/prisma";
import type { WeekPlan } from "@/lib/ai/types/program-generation";
import { logAudit, diffFields, AUDIT_ACTIONS } from "@/lib/services/audit-log.service";

export async function createGlobalProgramAction(input: CreateProgramInput) {
  const admin = await requireSuperAdmin();

  const parsed = createProgramSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }

  try {
    const program = await programService.createGlobalProgram(parsed.data);
    await logAudit({
      actorId: admin.id,
      actorType: "SUPER_ADMIN",
      actorName: `${admin.firstName} ${admin.lastName}`,
      action: AUDIT_ACTIONS.GLOBAL_PROGRAM_CREATED,
      targetType: "Program",
      targetId: program.id,
      targetLabel: program.name,
      orgId: null,
    });
    revalidatePath("/admin/global-programs");
    return { success: true as const, data: { id: program.id } };
  } catch (error) {
    console.error("Failed to create global program:", error);
    return { success: false as const, error: "Failed to create global program" };
  }
}

export async function updateGlobalProgramAction(
  programId: string,
  input: UpdateProgramInput
) {
  const admin = await requireSuperAdmin();

  // Informational only (used for the audit diff/label), not an authorization
  // gate — requireSuperAdmin() above already gates access to this action.
  // A failure here must not turn a successful mutation into a reported failure.
  const existing = await prisma.program
    .findUnique({
      where: { id: programId },
      select: { name: true, description: true, status: true },
    })
    .catch((error) => {
      console.error("Failed to fetch existing global program for audit diff:", error);
      return null;
    });

  const parsed = updateProgramSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }

  try {
    const updated = await programService.updateGlobalProgram(programId, parsed.data);
    const diff = existing
      ? diffFields(
          existing as unknown as Record<string, unknown>,
          parsed.data as unknown as Record<string, unknown>,
          ["name", "description", "status"]
        )
      : undefined;
    await logAudit({
      actorId: admin.id,
      actorType: "SUPER_ADMIN",
      actorName: `${admin.firstName} ${admin.lastName}`,
      action: AUDIT_ACTIONS.GLOBAL_PROGRAM_UPDATED,
      targetType: "Program",
      targetId: updated.id,
      targetLabel: updated.name,
      orgId: null,
      metadata: diff,
    });
    revalidatePath("/admin/global-programs");
    revalidatePath(`/admin/global-programs/${programId}/edit`);
    return { success: true as const, data: { id: updated.id } };
  } catch (error) {
    console.error("Failed to update global program:", error);
    return { success: false as const, error: "Failed to update global program" };
  }
}

export async function pushGlobalProgramUpdateAction(programId: string) {
  await requireSuperAdmin();

  try {
    await programService.pushGlobalProgramUpdate(programId);
    revalidatePath("/admin/global-programs");
    return { success: true as const };
  } catch (error) {
    console.error("Failed to push global program update:", error);
    return { success: false as const, error: "Failed to push update" };
  }
}

export async function deleteGlobalProgramAction(programId: string) {
  const admin = await requireSuperAdmin();

  // Informational only (used for the audit target label), not an authorization
  // gate. A failure here must not turn a successful mutation into a reported
  // failure, so it degrades gracefully to an undefined label.
  const existing = await prisma.program
    .findUnique({ where: { id: programId }, select: { name: true } })
    .catch((error) => {
      console.error("Failed to fetch existing global program for audit label:", error);
      return null;
    });

  try {
    await programService.deleteGlobalProgram(programId);
    await logAudit({
      actorId: admin.id,
      actorType: "SUPER_ADMIN",
      actorName: `${admin.firstName} ${admin.lastName}`,
      action: AUDIT_ACTIONS.GLOBAL_PROGRAM_DELETED,
      targetType: "Program",
      targetId: programId,
      targetLabel: existing?.name,
      orgId: null,
    });
    revalidatePath("/admin/global-programs");
    return { success: true as const };
  } catch (error) {
    console.error("Failed to delete global program:", error);
    return { success: false as const, error: "Failed to delete global program" };
  }
}

export async function generateGlobalProgramAction(params: {
  focusAreas?: string[];
  durationMinutes?: number;
  daysPerWeek?: number;
  durationWeeks?: number;
  circuits?: unknown[];
  preferredWeekdays?: string[];
  difficultyLevel?: string;
  weekPlan?: WeekPlan[];
  organizationIds?: string[];
  [key: string]: unknown;
}) {
  await requireSuperAdmin();

  try {
    const aiPlan = await generateProgram(params as Parameters<typeof generateProgram>[0]);

    const categorization = await categorizeGeneratedProgram(
      aiPlan,
      buildCategorizationContextFromParams(params)
    );

    // Use the parallel insert pattern — programme shell, then workouts, blocks, exercises, sets
    const program = await prisma.program.create({
      data: {
        name: aiPlan.name,
        description: aiPlan.description || "Generated by AI",
        isGlobal: true,
        isTemplate: false,
        trainerId: null,
        status: "DRAFT",
        organizationIds: params.organizationIds ?? [],
        aiGenerationParams: params as import("@prisma/client").Prisma.InputJsonValue,
        bodyAreas: categorization.bodyAreas,
        goals: categorization.goals,
        activities: categorization.activities,
        level: categorization.level ?? undefined,
        tags: categorization.tags,
      },
      select: { id: true },
    });

    const createdWorkouts = await Promise.all(
      aiPlan.workouts.map((w) =>
        prisma.workout.create({
          data: {
            programId: program.id,
            name: w.name,
            dayIndex: w.dayIndex,
            weekIndex: w.weekIndex ?? 0,
            orderIndex: (w.weekIndex ?? 0) * 7 + w.dayIndex,
          },
          select: { id: true, dayIndex: true },
        })
      )
    );

    const blockInputs = aiPlan.workouts.flatMap((w, wi) =>
      w.blocks.map((b) => ({ workoutId: createdWorkouts[wi].id, block: b }))
    );
    const createdBlocks = await Promise.all(
      blockInputs.map(({ workoutId, block: b }) =>
        prisma.workoutBlockV2.create({
          data: {
            workoutId,
            type: b.type || "NORMAL",
            name: b.name || b.type || "NORMAL",
            orderIndex: b.orderIndex,
            rounds: b.rounds ?? 1,
            restBetweenRounds: b.restBetweenRounds ?? null,
          },
          select: { id: true },
        })
      )
    );

    const exerciseInputs = blockInputs.flatMap(({ block: b }, bi) =>
      b.exercises.map((e) => ({ blockId: createdBlocks[bi].id, exercise: e }))
    );
    const createdExercises = await Promise.all(
      exerciseInputs.map(({ blockId, exercise: e }) =>
        prisma.blockExerciseV2.create({
          data: {
            blockId,
            exerciseId: e.exerciseId,
            orderIndex: e.orderIndex,
            notes: e.notes ?? null,
            restSeconds: e.restSeconds ?? null,
          },
          select: { id: true },
        })
      )
    );

    const allSets = exerciseInputs.flatMap(({ exercise: e }, ei) => {
      const repStr = e.reps?.toString() ?? "10";
      const isDuration = repStr.endsWith("s");
      const targetReps = isDuration ? null : parseInt(repStr, 10) || null;
      const targetDuration = isDuration ? parseInt(repStr.replace("s", ""), 10) || null : null;
      return Array.from({ length: Math.max(1, e.sets || 1) }).map((_, i) => ({
        blockExerciseId: createdExercises[ei].id,
        orderIndex: i,
        setType: "NORMAL" as const,
        ...(targetReps !== null ? { targetReps } : {}),
        ...(targetDuration !== null ? { targetDuration } : {}),
      }));
    });
    if (allSets.length > 0) {
      await prisma.exerciseSet.createMany({ data: allSets });
    }

    revalidatePath("/admin/global-programs");
    return { success: true as const, data: program.id };
  } catch (error) {
    console.error("Failed to generate global program:", error);
    return { success: false as const, error: "Failed to generate global program" };
  }
}

export async function assignGlobalProgramOrganizationsAction(
  programId: string,
  organizationIds: string[]
) {
  await requireSuperAdmin();

  try {
    await programService.assignGlobalProgramOrganizations(programId, organizationIds);
    revalidatePath("/admin/global-programs");
    return { success: true as const };
  } catch (error) {
    console.error("Failed to assign program to clinics:", error);
    return { success: false as const, error: "Failed to assign program to clinics" };
  }
}
