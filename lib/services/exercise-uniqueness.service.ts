import { prisma } from "@/lib/prisma";
import type { ExerciseSource } from "@prisma/client";
import {
  describeExerciseConflict,
  findExerciseConflicts,
  type ExerciseConflict,
  type ExerciseConflictField,
  type ExerciseIdentity,
} from "@/lib/utils/exercise-identity";

/**
 * Thrown by exercise write paths when a name or video is already taken in a
 * library the exercise shares with another one. `message` is user-facing, so
 * server actions can return it as-is.
 */
export class ExerciseConflictError extends Error {
  constructor(public readonly conflicts: ExerciseConflict[]) {
    super(conflicts.map(describeExerciseConflict).join(". "));
    this.name = "ExerciseConflictError";
  }
}

/**
 * Active exercises that could conflict with an exercise in `scope`: for an
 * org exercise that's the universal library plus that org's library; a
 * universal exercise is visible to every org, so it's checked against all.
 */
export async function loadExerciseConflictPool(scope: {
  source: ExerciseSource;
  organizationId?: string | null;
}): Promise<ExerciseIdentity[]> {
  return prisma.exercise.findMany({
    where:
      scope.source === "ORGANIZATION" && scope.organizationId
        ? { isActive: true, OR: [{ source: "UNIVERSAL" }, { organizationId: scope.organizationId }] }
        : { isActive: true },
    select: { id: true, name: true, videoUrl: true, source: true, organizationId: true },
  });
}

export async function assertExerciseIsUnique(
  candidate: ExerciseIdentity,
  fields: ExerciseConflictField[] = ["name", "videoUrl"]
): Promise<void> {
  if (fields.length === 0) return;
  const pool = await loadExerciseConflictPool(candidate);
  const conflicts = findExerciseConflicts(candidate, pool).filter((c) => fields.includes(c.field));
  if (conflicts.length > 0) throw new ExerciseConflictError(conflicts);
}

export interface BatchExerciseConflict {
  /** 0-based index of the offending row in the batch. */
  index: number;
  field: ExerciseConflictField;
  existingName: string;
  /** Set when the clash is with an earlier row of the same batch rather than the library. */
  batchIndex?: number;
}

const BATCH_ID_PREFIX = "batch:";

/**
 * Validates a batch of new exercises that all land in the same library,
 * against the existing library and against each other. The first row of an
 * in-batch pair is accepted; only the later one is reported. An empty array
 * means the batch is clean.
 */
export async function findBatchExerciseConflictDetails(
  rows: { name: string; videoUrl?: string | null }[],
  scope: { source: ExerciseSource; organizationId?: string | null }
): Promise<BatchExerciseConflict[]> {
  const pool = await loadExerciseConflictPool(scope);
  const accepted: ExerciseIdentity[] = [];
  const conflicts: BatchExerciseConflict[] = [];

  rows.forEach((row, index) => {
    const candidate: ExerciseIdentity = { ...row, ...scope, id: `${BATCH_ID_PREFIX}${index}` };
    for (const c of findExerciseConflicts(candidate, pool)) {
      conflicts.push({ index, field: c.field, existingName: c.existing.name });
    }
    for (const c of findExerciseConflicts(candidate, accepted)) {
      const batchIndex = Number(c.existing.id!.slice(BATCH_ID_PREFIX.length));
      conflicts.push({ index, field: c.field, existingName: c.existing.name, batchIndex });
    }
    accepted.push(candidate);
  });

  return conflicts;
}

/** Same check, as one message per offending row (1-based row numbers). */
export async function findBatchExerciseConflicts(
  rows: { name: string; videoUrl?: string | null }[],
  scope: { source: ExerciseSource; organizationId?: string | null }
): Promise<string[]> {
  const byRow = new Map<number, string[]>();
  for (const c of await findBatchExerciseConflictDetails(rows, scope)) {
    const what = c.field === "name" ? "name" : "video";
    const where = c.batchIndex !== undefined ? " earlier in this import" : "";
    const list = byRow.get(c.index) ?? [];
    list.push(`${what} already used by "${c.existingName}"${where}`);
    byRow.set(c.index, list);
  }
  return [...byRow].map(([index, problems]) => `Row ${index + 1} ("${rows[index].name}"): ${problems.join("; ")}`);
}
