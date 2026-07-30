"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { isSuperAdmin } from "@/lib/current-user";
import { createExerciseSchema, updateExerciseSchema } from "@/lib/validators/exercise";
import * as exerciseService from "@/lib/services/exercise.service";
import { logAudit, diffFields, deriveActorType, AUDIT_ACTIONS } from "@/lib/services/audit-log.service";
import type { BodyRegion, DifficultyLevel, ExercisePhase } from "@prisma/client";

export async function createExerciseAction(input: {
  name: string;
  description?: string;
  bodyRegion: string;
  equipmentRequired: string[];
  difficultyLevel: string;
  contraindications: string[];
  instructions?: string;
  videoUrl?: string;
  videoProvider?: string;
  imageUrl?: string;
  isPublic?: boolean;
}) {
    // Use live session orgId first — more reliable than the DB field when user's org was added after onboarding
    const { userId, orgId: sessionOrgId } = await auth();
    if (!userId) return { success: false as const, error: "Unauthorized" };

    const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
    if (!dbUser) return { success: false as const, error: "User not found" };
    if (dbUser.role !== "TRAINER") return { success: false as const, error: "Forbidden" };

    const organizationOrgId = sessionOrgId ?? dbUser.clerkOrgId ?? null;

    const parsed = createExerciseSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false as const, error: parsed.error.issues[0].message };
    }

    try {
      const exercise = await exerciseService.createExercise({
        ...parsed.data,
        bodyRegion: parsed.data.bodyRegion as BodyRegion,
        difficultyLevel: parsed.data.difficultyLevel as DifficultyLevel,
        videoUrl: parsed.data.videoUrl || undefined,
        videoProvider: parsed.data.videoProvider || undefined,
        createdById: dbUser.id,
        source: organizationOrgId ? "ORGANIZATION" : "UNIVERSAL",
        organizationId: organizationOrgId ?? undefined,
        isPublic: parsed.data.isPublic ?? true,
      });

      await logAudit({
        actorId: dbUser.id,
        actorType: deriveActorType(dbUser),
        actorName: `${dbUser.firstName} ${dbUser.lastName}`,
        action: AUDIT_ACTIONS.EXERCISE_CREATED,
        targetType: "Exercise",
        targetId: exercise.id,
        targetLabel: exercise.name,
        orgId: organizationOrgId,
      });

      revalidatePath("/exercises");
      return { success: true as const, data: exercise };
    } catch (error) {
      console.error("Failed to create exercise:", error);
      return { success: false as const, error: "Failed to create exercise" };
    }
}

export async function updateExerciseAction(
  exerciseId: string,
  input: Record<string, unknown>
) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };
  if (dbUser.role !== "TRAINER") return { success: false as const, error: "Forbidden" };

  const parsed = updateExerciseSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }

  try {
    // Fetching the "before" snapshot is purely informational, used only to enrich the
    // audit log's diff — it is not an authorization gate (the role check already
    // happened above). A failure here must never abort the update or turn a
    // successful save into a reported failure, so it degrades to "no diff" instead.
    const existing = await prisma.exercise.findUnique({ where: { id: exerciseId } }).catch((err) => {
      console.error("Failed to fetch existing exercise for audit diff:", err);
      return null;
    });

    const exercise = await exerciseService.updateExercise(exerciseId, parsed.data as Parameters<typeof exerciseService.updateExercise>[1]);
    const diff = existing
      ? diffFields(
          existing as unknown as Record<string, unknown>,
          parsed.data as unknown as Record<string, unknown>,
          ["name", "bodyRegion", "difficultyLevel", "isPublic"]
        )
      : undefined;
    await logAudit({
      actorId: dbUser.id,
      actorType: deriveActorType(dbUser),
      actorName: `${dbUser.firstName} ${dbUser.lastName}`,
      action: AUDIT_ACTIONS.EXERCISE_UPDATED,
      targetType: "Exercise",
      targetId: exerciseId,
      targetLabel: exercise.name,
      orgId: existing?.organizationId ?? null,
      metadata: diff,
    });
    revalidatePath("/exercises");
    revalidatePath(`/exercises/${exerciseId}`);
    return { success: true as const, data: exercise };
  } catch (error) {
    console.error("Failed to update exercise:", error);
    return { success: false as const, error: "Failed to update exercise" };
  }
}

export async function addExerciseMediaAction(
  exerciseId: string,
  media: { mediaType: "image" | "video"; url: string; altText?: string }
) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };
  if (dbUser.role !== "TRAINER") return { success: false as const, error: "Forbidden" };

  try {
    const item = await prisma.exerciseMedia.create({
      data: {
        exerciseId,
        mediaType: media.mediaType,
        url: media.url,
        altText: media.altText ?? null,
      },
    });
    revalidatePath(`/exercises/${exerciseId}`);
    revalidatePath(`/exercises/${exerciseId}/edit`);
    return { success: true as const, data: item };
  } catch (error) {
    console.error("Failed to add media:", error);
    return { success: false as const, error: "Failed to add media" };
  }
}

export async function deleteExerciseMediaAction(
  exerciseId: string,
  mediaId: string
) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };
  if (dbUser.role !== "TRAINER") return { success: false as const, error: "Forbidden" };

  try {
    await prisma.exerciseMedia.delete({ where: { id: mediaId } });
    revalidatePath(`/exercises/${exerciseId}`);
    revalidatePath(`/exercises/${exerciseId}/edit`);
    return { success: true as const };
  } catch (error) {
    console.error("Failed to delete media:", error);
    return { success: false as const, error: "Failed to delete media" };
  }
}

export async function deleteExerciseAction(exerciseId: string) {
  const { userId, orgId: sessionOrgId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };

  const exercise = await prisma.exercise.findUnique({ where: { id: exerciseId } });
  if (!exercise) return { success: false as const, error: "Exercise not found" };

  const superAdmin = await isSuperAdmin();

  if (!superAdmin) {
    // Trainers can only delete their own organization's exercises
    if (dbUser.role !== "TRAINER") return { success: false as const, error: "Forbidden" };
    const organizationOrgId = sessionOrgId ?? dbUser.clerkOrgId ?? null;
    if (exercise.source === "UNIVERSAL") {
      return { success: false as const, error: "Universal exercises can only be deleted by admins" };
    }
    if (exercise.source === "ORGANIZATION" && exercise.organizationId !== organizationOrgId) {
      return { success: false as const, error: "You can only delete your organization's exercises" };
    }
  }

  try {
    // Delete first, then log — the `exercise` fields needed for the audit entry were
    // already fetched above for the authorization check, so there's no need to log
    // before deleting. This ensures a failed delete never produces a false "deleted"
    // audit entry.
    await exerciseService.deleteExercise(exerciseId);
    await logAudit({
      actorId: dbUser.id,
      actorType: superAdmin ? "SUPER_ADMIN" : deriveActorType(dbUser),
      actorName: `${dbUser.firstName} ${dbUser.lastName}`,
      action: AUDIT_ACTIONS.EXERCISE_DELETED,
      targetType: "Exercise",
      targetId: exerciseId,
      targetLabel: exercise.name,
      orgId: exercise.organizationId ?? null,
    });
    revalidatePath("/exercises");
    revalidatePath("/admin/exercises");
    return { success: true as const };
  } catch (error) {
    console.error("Failed to delete exercise:", error);
    return { success: false as const, error: "Failed to delete exercise" };
  }
}

export async function bulkDeleteExercisesAction(exerciseIds: string[]) {
  const { userId, orgId: sessionOrgId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };

  const superAdmin = await isSuperAdmin();
  const organizationOrgId = sessionOrgId ?? dbUser.clerkOrgId ?? null;

  const ids = Array.from(new Set(exerciseIds)).filter(Boolean);
  if (ids.length === 0) {
    return { success: false as const, error: "No exercises selected" };
  }

  const exercises = await prisma.exercise.findMany({ where: { id: { in: ids } } });
  const exerciseById = new Map(exercises.map((ex) => [ex.id, ex]));

  const deleted: { id: string; name: string }[] = [];
  const skipped: { id: string; name: string; reason: string }[] = [];

  // Each id is authorized, checked for in-use references, and deleted independently so
  // one blocked or failing id never aborts the rest of the batch.
  for (const id of ids) {
    const exercise = exerciseById.get(id);
    if (!exercise) {
      skipped.push({ id, name: id, reason: "Exercise not found" });
      continue;
    }

    if (!superAdmin) {
      if (dbUser.role !== "TRAINER") {
        skipped.push({ id, name: exercise.name, reason: "Forbidden" });
        continue;
      }
      if (exercise.source === "UNIVERSAL") {
        skipped.push({ id, name: exercise.name, reason: "Universal exercises can only be deleted by admins" });
        continue;
      }
      if (exercise.source === "ORGANIZATION" && exercise.organizationId !== organizationOrgId) {
        skipped.push({ id, name: exercise.name, reason: "You can only delete your organization's exercises" });
        continue;
      }
    }

    const [planUsage, blockUsage, blockV2Usage] = await Promise.all([
      prisma.planExercise.count({ where: { exerciseId: id } }),
      prisma.blockExercise.count({ where: { exerciseId: id } }),
      prisma.blockExerciseV2.count({ where: { exerciseId: id } }),
    ]);
    if (planUsage + blockUsage + blockV2Usage > 0) {
      skipped.push({ id, name: exercise.name, reason: "In use by one or more trainer workouts/programs" });
      continue;
    }

    try {
      await exerciseService.deleteExercise(id);
      await logAudit({
        actorId: dbUser.id,
        actorType: superAdmin ? "SUPER_ADMIN" : deriveActorType(dbUser),
        actorName: `${dbUser.firstName} ${dbUser.lastName}`,
        action: AUDIT_ACTIONS.EXERCISE_DELETED,
        targetType: "Exercise",
        targetId: id,
        targetLabel: exercise.name,
        orgId: exercise.organizationId ?? null,
      });
      deleted.push({ id, name: exercise.name });
    } catch (error) {
      console.error(`Failed to delete exercise ${id}:`, error);
      skipped.push({ id, name: exercise.name, reason: "Failed to delete" });
    }
  }

  if (deleted.length > 0) {
    revalidatePath("/exercises");
    revalidatePath("/admin/exercises");
  }

  return { success: true as const, deletedCount: deleted.length, skipped };
}

export async function createOrganizationExerciseAction(input: {
  name: string;
  description?: string;
  bodyRegion: string;
  difficultyLevel: string;
  videoUrl?: string;
  isPublic: boolean;
  exercisePhases?: string[];
}) {
  const { userId, orgId: sessionOrgId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };
  if (dbUser.role !== "TRAINER") return { success: false as const, error: "Forbidden" };

  const organizationOrgId = sessionOrgId ?? dbUser.clerkOrgId ?? null;

  try {
    const exercise = await exerciseService.createExercise({
      name: input.name.trim(),
      description: input.description?.trim() || undefined,
      bodyRegion: input.bodyRegion as BodyRegion,
      difficultyLevel: input.difficultyLevel as DifficultyLevel,
      equipmentRequired: [],
      contraindications: [],
      videoUrl: input.videoUrl?.trim() || undefined,
      createdById: dbUser.id,
      source: organizationOrgId ? "ORGANIZATION" : "UNIVERSAL",
      organizationId: organizationOrgId ?? undefined,
      isPublic: input.isPublic,
      exercisePhases: (input.exercisePhases as ExercisePhase[] | undefined) ?? [],
    });

    revalidatePath("/exercises");
    return { success: true as const, data: exercise };
  } catch (error) {
    console.error("Failed to create organization exercise:", error);
    return { success: false as const, error: "Failed to create exercise" };
  }
}

export async function adoptUniversalExerciseAction(exerciseId: string) {
  const { userId, orgId: sessionOrgId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };
  if (dbUser.role !== "TRAINER") return { success: false as const, error: "Forbidden" };

  const organizationOrgId = sessionOrgId ?? dbUser.clerkOrgId ?? null;
  if (!organizationOrgId) {
    return { success: false as const, error: "You must belong to an organization to adopt exercises" };
  }

  const source = await prisma.exercise.findUnique({ where: { id: exerciseId } });
  if (!source) return { success: false as const, error: "Exercise not found" };
  if (source.source !== "UNIVERSAL") {
    return { success: false as const, error: "Only universal exercises can be adopted" };
  }

  try {
    const adopted = await exerciseService.cloneExerciseToOrganization(source, {
      organizationId: organizationOrgId,
      createdById: dbUser.id,
    });

    await logAudit({
      actorId: dbUser.id,
      actorType: deriveActorType(dbUser),
      actorName: `${dbUser.firstName} ${dbUser.lastName}`,
      action: AUDIT_ACTIONS.EXERCISE_CREATED,
      targetType: "Exercise",
      targetId: adopted.id,
      targetLabel: adopted.name,
      orgId: organizationOrgId,
      metadata: { adoptedFrom: source.id },
    });

    revalidatePath("/exercises");
    return { success: true as const, data: adopted };
  } catch (error) {
    console.error("Failed to adopt universal exercise:", error);
    return { success: false as const, error: "Failed to adopt exercise" };
  }
}

export async function adoptUniversalExercisesAction(exerciseIds: string[]) {
  const { userId, orgId: sessionOrgId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };
  if (dbUser.role !== "TRAINER") return { success: false as const, error: "Forbidden" };

  const organizationOrgId = sessionOrgId ?? dbUser.clerkOrgId ?? null;
  if (!organizationOrgId) {
    return { success: false as const, error: "You must belong to an organization to adopt exercises" };
  }

  const ids = Array.from(new Set(exerciseIds)).filter(Boolean);
  if (ids.length === 0) {
    return { success: false as const, error: "No exercises selected" };
  }

  const sources = await prisma.exercise.findMany({ where: { id: { in: ids } } });
  const sourceById = new Map(sources.map((source) => [source.id, source]));

  const adopted: { name: string; adoptedFrom: string }[] = [];
  const failures: { id: string; error: string }[] = [];

  // Each id is validated and cloned independently so one bad id (missing or
  // non-universal) never aborts the rest of the batch.
  for (const id of ids) {
    const source = sourceById.get(id);
    if (!source) {
      failures.push({ id, error: "Exercise not found" });
      continue;
    }
    if (source.source !== "UNIVERSAL") {
      failures.push({ id, error: "Only universal exercises can be adopted" });
      continue;
    }
    try {
      const clone = await exerciseService.cloneExerciseToOrganization(source, {
        organizationId: organizationOrgId,
        createdById: dbUser.id,
      });
      adopted.push({ name: clone.name, adoptedFrom: source.id });
    } catch (error) {
      console.error(`Failed to adopt universal exercise ${id}:`, error);
      failures.push({ id, error: "Failed to adopt exercise" });
    }
  }

  if (adopted.length > 0) {
    await logAudit({
      actorId: dbUser.id,
      actorType: deriveActorType(dbUser),
      actorName: `${dbUser.firstName} ${dbUser.lastName}`,
      action: AUDIT_ACTIONS.EXERCISE_CREATED,
      targetType: "Exercise",
      orgId: organizationOrgId,
      metadata: {
        count: adopted.length,
        names: adopted.slice(0, 20).map((e) => e.name),
        adoptedFrom: adopted.map((e) => e.adoptedFrom),
      },
    });
    revalidatePath("/exercises");
  }

  return { success: true as const, successCount: adopted.length, failures };
}

export async function toggleExercisePublicAction(exerciseId: string, isPublic: boolean) {
  const { userId, orgId: sessionOrgId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };
  if (dbUser.role !== "TRAINER") return { success: false as const, error: "Forbidden" };

  const organizationOrgId = sessionOrgId ?? dbUser.clerkOrgId ?? null;

  const exercise = await prisma.exercise.findUnique({ where: { id: exerciseId } });
  if (!exercise) return { success: false as const, error: "Exercise not found" };
  if (exercise.source !== "ORGANIZATION") {
    return { success: false as const, error: "Cannot modify a universal exercise" };
  }
  if (exercise.organizationId !== organizationOrgId) {
    return { success: false as const, error: "You can only modify your organization's exercises" };
  }

  try {
    await exerciseService.toggleExercisePublic(exerciseId, isPublic);
    revalidatePath("/exercises");
    return { success: true as const };
  } catch (error) {
    console.error("Failed to toggle exercise public:", error);
    return { success: false as const, error: "Failed to update exercise" };
  }
}
