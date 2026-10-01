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

/**
 * Validates a batch of new exercises that all land in the same library,
 * against the existing library and against each other. Returns one message
 * per offending row (1-based row numbers); an empty array means the batch is clean.
 */
export async function findBatchExerciseConflicts(
  rows: { name: string; videoUrl?: string | null }[],
  scope: { source: ExerciseSource; organizationId?: string | null }
): Promise<string[]> {
  const pool = await loadExerciseConflictPool(scope);
  const accepted: ExerciseIdentity[] = [];
  const messages: string[] = [];

  rows.forEach((row, index) => {
    const candidate: ExerciseIdentity = { ...row, ...scope };
    const problems = [
      ...findExerciseConflicts(candidate, pool).map((c) => describeBatchConflict(c, "")),
      ...findExerciseConflicts(candidate, accepted).map((c) => describeBatchConflict(c, " earlier in this import")),
    ];
    if (problems.length > 0) messages.push(`Row ${index + 1} ("${row.name}"): ${problems.join("; ")}`);
    accepted.push(candidate);
  });

  return messages;
}

function describeBatchConflict(conflict: ExerciseConflict, where: string): string {
  const what = conflict.field === "name" ? "name" : "video";
  return `${what} already used by "${conflict.existing.name}"${where}`;
}
