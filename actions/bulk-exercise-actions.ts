"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type { BodyRegion, DifficultyLevel, ExercisePhase } from "@prisma/client";
import { logAudit, deriveActorType, AUDIT_ACTIONS } from "@/lib/services/audit-log.service";
import { isYouTubeUrl, extractYouTubeId, getYouTubeThumbnail } from "@/lib/utils/video";
import type { CsvExerciseRow } from "@/lib/validators/csv-exercise";

export interface BulkExerciseInput {
  name: string;
  description?: string;
  instructions?: string;
  bodyRegion: string;
  difficultyLevel: string;
  exercisePhases?: string[];
  musclesTargeted: string[];
  equipmentRequired: string[];
  contraindications: string[];
  commonMistakes?: string;
  defaultSets?: number;
  defaultReps?: number;
  videoUrl?: string;
  imageUrl?: string;
}

export async function bulkCreateExercisesAction(exercises: BulkExerciseInput[]) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };
  if (dbUser.role !== "TRAINER") return { success: false as const, error: "Forbidden" };

  if (!exercises.length) return { success: false as const, error: "No exercises provided" };

  // Route to org library if the trainer belongs to an org
  const orgData = dbUser.clerkOrgId
    ? { source: "ORGANIZATION" as const, organizationId: dbUser.clerkOrgId, isPublic: false }
    : {};

  try {
    const created = await prisma.$transaction(
      exercises.map((ex) =>
        prisma.exercise.create({
          data: {
            name: ex.name.trim(),
            description: ex.description?.trim() || null,
            instructions: ex.instructions?.trim() || null,
            bodyRegion: [ex.bodyRegion] as BodyRegion[],
            difficultyLevel: ex.difficultyLevel as DifficultyLevel,
            exercisePhases: (ex.exercisePhases as ExercisePhase[] | undefined) ?? [],
            musclesTargeted: ex.musclesTargeted,
            equipmentRequired: ex.equipmentRequired,
            contraindications: ex.contraindications,
            commonMistakes: ex.commonMistakes?.trim() || null,
            defaultSets: ex.defaultSets || null,
            defaultReps: ex.defaultReps || null,
            videoUrl: ex.videoUrl?.trim() || null,
            imageUrl: ex.imageUrl?.trim() || null,
            videoProvider: ex.videoUrl ? "youtube" : null,
            createdById: dbUser.id,
            isActive: true,
            ...orgData,
          },
        })
      )
    );

    await logAudit({
      actorId: dbUser.id,
      actorType: deriveActorType(dbUser),
      actorName: `${dbUser.firstName} ${dbUser.lastName}`,
      action: AUDIT_ACTIONS.EXERCISE_CREATED,
      targetType: "Exercise",
      orgId: dbUser.clerkOrgId,
      metadata: { count: created.length, names: created.slice(0, 20).map((e) => e.name) },
    });

    revalidatePath("/exercises");
    return { success: true as const, count: created.length };
  } catch (error) {
    console.error("Failed to bulk create exercises:", error);
    return { success: false as const, error: "Failed to create exercises" };
  }
}

function splitPipe(val: string | undefined): string[] {
  if (!val) return [];
  return val.split("|").map((s) => s.trim()).filter(Boolean);
}

export async function importExercisesFromCsvAction(rows: CsvExerciseRow[]) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };

  const allowedEmails = (process.env.SUPER_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (!allowedEmails.includes(dbUser.email.toLowerCase())) {
    return { success: false as const, error: "Forbidden" };
  }

  if (!rows.length) return { success: false as const, error: "No rows provided" };

  try {
    const created = await prisma.$transaction(
      rows.map((row) => {
        let imageUrl: string | null = null;
        let videoProvider: string | null = null;

        if (row.videoUrl) {
          if (isYouTubeUrl(row.videoUrl)) {
            const ytId = extractYouTubeId(row.videoUrl);
            imageUrl = ytId ? getYouTubeThumbnail(ytId) : null;
            videoProvider = "youtube";
          }
        }

        return prisma.exercise.create({
          data: {
            name: row.name.trim(),
            description: row.description ?? null,
            instructions: row.instructions ?? null,
            bodyRegion: [row.bodyRegion] as BodyRegion[],
            difficultyLevel: row.difficultyLevel as DifficultyLevel,
            exercisePhases: (row.exercisePhases as ExercisePhase[] | undefined) ?? [],
            musclesTargeted: splitPipe(row.musclesTargeted),
            equipmentRequired: splitPipe(row.equipmentRequired),
            contraindications: splitPipe(row.contraindications),
            commonMistakes: row.commonMistakes ?? null,
            defaultSets: row.defaultSets ?? null,
            defaultReps: row.defaultReps ?? null,
            defaultHoldSeconds: row.defaultHoldSeconds ?? null,
            cuesThumbnail: row.cuesThumbnail ?? null,
            indicationTags: splitPipe(row.indicationTags),
            rehabStage: row.rehabStage ?? null,
            videoUrl: row.videoUrl ?? null,
            videoProvider,
            imageUrl,
            createdById: dbUser.id,
            isActive: true,
          },
        });
      })
    );

    await logAudit({
      actorId: dbUser.id,
      actorType: deriveActorType(dbUser),
      actorName: `${dbUser.firstName} ${dbUser.lastName}`,
      action: AUDIT_ACTIONS.EXERCISE_CREATED,
      targetType: "Exercise",
      orgId: dbUser.clerkOrgId,
      metadata: { count: created.length, names: created.slice(0, 20).map((e) => e.name), source: "csv_import" },
    });

    revalidatePath("/admin/exercises");
    return { success: true as const, count: created.length };
  } catch (error) {
    console.error("CSV import failed:", error);
    return { success: false as const, error: "Failed to import exercises" };
  }
}
