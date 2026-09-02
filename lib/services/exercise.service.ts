import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { BodyRegion, DifficultyLevel, ExercisePhase, ExerciseSource } from "@prisma/client";
import { extractYouTubeId, getYouTubeThumbnail } from "@/lib/utils/video";

export interface ExerciseFilters {
  search?: string;
  bodyRegions?: BodyRegion[];
  difficultyLevel?: DifficultyLevel;
  exercisePhases?: ExercisePhase[];
  muscleGroups?: string[];
  equipment?: string;
  source?: ExerciseSource;
  organizationId?: string;
  isAssessment?: boolean;
}

export async function getExercises(filters: ExerciseFilters = {}) {
  return prisma.exercise.findMany({
    where: {
      isActive: true,
      isAssessment: filters.isAssessment ?? false,
      ...(filters.bodyRegions?.length && { bodyRegion: { hasSome: filters.bodyRegions } }),
      ...(filters.difficultyLevel && { difficultyLevel: filters.difficultyLevel }),
      ...(filters.exercisePhases?.length && { exercisePhases: { hasSome: filters.exercisePhases } }),
      ...(filters.muscleGroups?.length && { musclesTargeted: { hasSome: filters.muscleGroups } }),
      ...(filters.search && {
        name: { contains: filters.search, mode: "insensitive" as const },
      }),
      ...(filters.equipment && {
        equipmentRequired: { has: filters.equipment },
      }),
      ...(filters.source === "UNIVERSAL" && { source: "UNIVERSAL" as const }),
      // ORGANIZATION: always filter by source; use impossible sentinel when no orgId to return 0 results
      ...(filters.source === "ORGANIZATION" && {
        source: "ORGANIZATION" as const,
        ...(filters.organizationId ? { organizationId: filters.organizationId } : { organizationId: "__none__" }),
      }),
    },
    select: {
      id: true,
      name: true,
      bodyRegion: true,
      difficultyLevel: true,
      exercisePhases: true,
      equipmentRequired: true,
      description: true,
      imageUrl: true,
      videoUrl: true,
      isActive: true,
      source: true,
      organizationId: true,
    },
    orderBy: { name: "asc" },
  });
}

export async function getExercisesForPicker(organizationId?: string) {
  const orClauses: Prisma.ExerciseWhereInput[] = [
    { source: "UNIVERSAL" },
  ];
  if (organizationId) {
    orClauses.push({ source: "ORGANIZATION", organizationId });
  }

  return prisma.exercise.findMany({
    where: {
      isActive: true,
      isAssessment: false,
      OR: orClauses,
    },
    select: {
      id: true,
      name: true,
      bodyRegion: true,
      difficultyLevel: true,
      defaultReps: true,
      musclesTargeted: true,
      description: true,
      videoUrl: true,
      videoProvider: true,
      exercisePhases: true,
      source: true,
      organizationId: true,
    },
    orderBy: { name: "asc" },
  });
}

// How much a single day-old use outweighs an equally-recent extra use of a
// different exercise — bounded to (0, 1] so recency only ever breaks ties
// between exercises with similar counts, never overturns a real frequency gap.
const RECENCY_DECAY_DAYS = 30;

export async function getExerciseUsageForTrainer(trainerId: string) {
  const rows = await prisma.exerciseUsage.findMany({
    where: { trainerId },
    select: { exerciseId: true, count: true, lastUsedAt: true },
  });
  return new Map(rows.map((r) => [r.exerciseId, { count: r.count, lastUsedAt: r.lastUsedAt }]));
}

// Reorders exercises so a coach's most frequently (and recently) programmed
// ones surface first in the picker. Exercises with no recorded usage keep
// their existing relative order (Array#sort is stable) after the ranked ones.
export function rankExercisesByUsage<T extends { id: string }>(
  exercises: T[],
  usage: Map<string, { count: number; lastUsedAt: Date }>
): T[] {
  if (usage.size === 0) return exercises;
  const now = Date.now();
  const score = (ex: T) => {
    const u = usage.get(ex.id);
    if (!u) return 0;
    const daysSince = (now - u.lastUsedAt.getTime()) / (1000 * 60 * 60 * 24);
    return u.count + Math.exp(-daysSince / RECENCY_DECAY_DAYS);
  };
  return [...exercises].sort((a, b) => score(b) - score(a));
}

// Called after a program is saved (create or update) — counts how many times
// each exercise appears in the saved workout tree and folds that into the
// trainer's running usage totals. Deliberately tied to persisted saves rather
// than transient picker selections, so an unsaved draft never inflates counts.
export async function recordExerciseUsage(
  trainerId: string,
  workouts: { blocks: { exercises: { exerciseId: string }[] }[] }[]
) {
  const counts = new Map<string, number>();
  for (const w of workouts) {
    for (const b of w.blocks) {
      for (const e of b.exercises) {
        counts.set(e.exerciseId, (counts.get(e.exerciseId) ?? 0) + 1);
      }
    }
  }
  if (counts.size === 0) return;

  await Promise.all(
    [...counts.entries()].map(([exerciseId, count]) =>
      prisma.exerciseUsage.upsert({
        where: { trainerId_exerciseId: { trainerId, exerciseId } },
        create: { trainerId, exerciseId, count, lastUsedAt: new Date() },
        update: { count: { increment: count }, lastUsedAt: new Date() },
      })
    )
  );
}

export async function getExerciseById(id: string) {
  return prisma.exercise.findUnique({
    where: { id },
    include: {
      media: true,
      progressionsFrom: {
        include: { nextExercise: true },
        orderBy: { orderIndex: "asc" },
      },
      progressionsTo: {
        include: { exercise: true },
        orderBy: { orderIndex: "asc" },
      },
    },
  });
}

export async function createExercise(data: {
  name: string;
  description?: string;
  bodyRegion?: BodyRegion[];
  equipmentRequired: string[];
  difficultyLevel?: DifficultyLevel;
  contraindications: string[];
  instructions?: string;
  videoUrl?: string;
  videoProvider?: string;
  imageUrl?: string;
  createdById: string;
  source?: ExerciseSource;
  organizationId?: string;
  exercisePhases?: ExercisePhase[];
  isAssessment?: boolean;
}) {
  const videoUrl = data.videoUrl?.trim() || undefined;
  let imageUrl = data.imageUrl?.trim() || undefined;

  if (!imageUrl && videoUrl) {
    const ytId = extractYouTubeId(videoUrl);
    if (ytId) {
      imageUrl = getYouTubeThumbnail(ytId);
    }
  }

  return prisma.exercise.create({
    data: {
      name: data.name,
      description: data.description,
      bodyRegion: data.bodyRegion ?? [],
      equipmentRequired: data.equipmentRequired,
      difficultyLevel: data.difficultyLevel ?? null,
      contraindications: data.contraindications,
      instructions: data.instructions,
      videoUrl,
      videoProvider: data.videoProvider,
      imageUrl,
      createdById: data.createdById,
      source: data.source ?? "UNIVERSAL",
      organizationId: data.organizationId ?? null,
      exercisePhases: data.exercisePhases ?? [],
      isAssessment: data.isAssessment ?? false,
    },
  });
}

/**
 * Clones a Universal exercise into a new, independently-editable ORGANIZATION
 * exercise for the given org. The result is a copy (not a reference): all
 * descriptive fields are carried over and `source` is forced to ORGANIZATION —
 * the copy is private to that org, like every other ORGANIZATION exercise.
 * Callers MUST verify `source.source === 'UNIVERSAL'` before calling.
 */
export async function cloneExerciseToOrganization(
  source: {
    name: string;
    description: string | null;
    bodyRegion: BodyRegion[];
    equipmentRequired: string[];
    difficultyLevel: DifficultyLevel | null;
    contraindications: string[];
    videoUrl: string | null;
    videoProvider: string | null;
    imageUrl: string | null;
    instructions: string | null;
    musclesTargeted: string[];
    exercisePhases: ExercisePhase[];
    commonMistakes: string | null;
    defaultSets: number | null;
    defaultReps: number | null;
    defaultHoldSeconds: number | null;
    indicationTags: string[];
    rehabStage: string | null;
    isAssessment: boolean;
  },
  target: { organizationId: string; createdById: string }
) {
  return prisma.exercise.create({
    data: {
      name: source.name,
      description: source.description,
      bodyRegion: source.bodyRegion,
      equipmentRequired: source.equipmentRequired,
      difficultyLevel: source.difficultyLevel,
      contraindications: source.contraindications,
      videoUrl: source.videoUrl,
      videoProvider: source.videoProvider,
      imageUrl: source.imageUrl,
      instructions: source.instructions,
      musclesTargeted: source.musclesTargeted,
      exercisePhases: source.exercisePhases,
      commonMistakes: source.commonMistakes,
      defaultSets: source.defaultSets,
      defaultReps: source.defaultReps,
      defaultHoldSeconds: source.defaultHoldSeconds,
      indicationTags: source.indicationTags,
      rehabStage: source.rehabStage,
      isAssessment: source.isAssessment,
      source: "ORGANIZATION",
      organizationId: target.organizationId,
      createdById: target.createdById,
    },
  });
}

export async function updateExercise(
  id: string,
  data: Partial<{
    name: string;
    description: string;
    bodyRegion: BodyRegion[];
    equipmentRequired: string[];
    difficultyLevel: DifficultyLevel;
    contraindications: string[];
    instructions: string;
    videoUrl: string;
    videoProvider: string;
    imageUrl: string;
    isActive: boolean;
    isAssessment: boolean;
  }>
) {
  const nextData = { ...data };
  if (typeof nextData.videoProvider === "string") {
    nextData.videoProvider = nextData.videoProvider.trim();
  }
  if (nextData.imageUrl === "") {
    nextData.imageUrl = undefined;
  }

  if (!nextData.imageUrl && nextData.videoUrl) {
    const ytId = extractYouTubeId(nextData.videoUrl);
    if (ytId) {
      nextData.imageUrl = getYouTubeThumbnail(ytId);
    }
  }

  return prisma.exercise.update({ where: { id }, data: nextData });
}

export async function deleteExercise(id: string) {
  return prisma.exercise.update({ where: { id }, data: { isActive: false } });
}

export async function getProgressionChain(exerciseId: string) {
  return prisma.exerciseProgression.findMany({
    where: { exerciseId },
    include: { nextExercise: true },
    orderBy: { orderIndex: "asc" },
  });
}

/**
 * One-time backfill: sets source=UNIVERSAL on all exercises that were created
 * before the ExerciseSource field was added to the schema. MongoDB doesn't
 * retroactively apply Prisma @default values to existing documents.
 */
export async function backfillExerciseSources() {
  const result = await prisma.$runCommandRaw({
    update: "Exercise",
    updates: [
      {
        q: { source: { $exists: false } },
        u: { $set: { source: "UNIVERSAL" } },
        multi: true,
      },
    ],
  });
  return result;
}
