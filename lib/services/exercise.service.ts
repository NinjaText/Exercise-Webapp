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
      // UNIVERSAL: true UNIVERSAL exercises plus any org exercise a trainer has made public —
      // mirrors getExercisesForPicker so the library page and program-builder picker agree
      // on what counts as "Universal". Run backfillExerciseSources() once to fix pre-migration docs.
      ...(filters.source === "UNIVERSAL" && {
        OR: [{ source: "UNIVERSAL" as const }, { source: "ORGANIZATION" as const, isPublic: true }],
      }),
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
      isPublic: true,
      organizationId: true,
    },
    orderBy: { name: "asc" },
  });
}

export async function getExercisesForPicker(organizationId?: string) {
  const orClauses: Prisma.ExerciseWhereInput[] = [
    { source: "UNIVERSAL" },
    { source: "ORGANIZATION", isPublic: true },
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
      isPublic: true,
    },
    orderBy: { name: "asc" },
  });
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
  isPublic?: boolean;
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
      isPublic: data.isPublic ?? true,
      exercisePhases: data.exercisePhases ?? [],
      isAssessment: data.isAssessment ?? false,
    },
  });
}

/**
 * Clones a Universal exercise into a new, independently-editable ORGANIZATION
 * exercise for the given org. The result is a copy (not a reference): all
 * descriptive fields are carried over, `source` is forced to ORGANIZATION, and
 * the copy starts private (`isPublic: false`) so the org can review before sharing.
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
      isPublic: false,
      createdById: target.createdById,
    },
  });
}

/**
 * Flips isPublic for a ORGANIZATION exercise.
 * Callers MUST verify: exercise.source === 'ORGANIZATION' && exercise.organizationId === callerOrgId
 * before calling this — the service performs no ownership check.
 */
export async function toggleExercisePublic(exerciseId: string, isPublic: boolean) {
  return prisma.exercise.update({
    where: { id: exerciseId },
    data: { isPublic },
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
    isPublic: boolean;
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
 * One-time backfill: sets source=UNIVERSAL and isPublic=true on all exercises
 * that were created before the ExerciseSource field was added to the schema.
 * MongoDB doesn't retroactively apply Prisma @default values to existing documents.
 */
export async function backfillExerciseSources() {
  const result = await prisma.$runCommandRaw({
    update: "Exercise",
    updates: [
      {
        q: { source: { $exists: false } },
        u: { $set: { source: "UNIVERSAL", isPublic: true } },
        multi: true,
      },
    ],
  });
  return result;
}
