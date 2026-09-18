/**
 * Open/collapse rules for the Program Builder's Focus and View All modes.
 *
 * Deliberately pure and React-free: these functions decide only which
 * exercises are *visible*. They never touch program data, which is why
 * switching views cannot lose a trainer's entered prescription.
 */

export type BuilderViewMode = "focus" | "all";

/** How the trainer asked for an exercise to open. */
export type OpenIntent =
  /** Plain click — open this one, collapse the rest (Focus mode). */
  | "select"
  /** Chevron click — add or remove this one, leave the rest alone. */
  | "toggle";

/** Stable identity for an exercise at a position in the workout tree. */
export function exerciseKey(
  workoutIdx: number,
  blockIdx: number,
  exerciseIdx: number
): string {
  return `${workoutIdx}:${blockIdx}:${exerciseIdx}`;
}

/**
 * The next set of open exercise keys. Always returns a new Set; the input is
 * never mutated.
 */
export function resolveOpenKeys(
  mode: BuilderViewMode,
  openKeys: Set<string>,
  key: string,
  intent: OpenIntent
): Set<string> {
  // In View All everything is expanded already, so the open set is inert.
  if (mode === "all") return new Set(openKeys);

  if (intent === "select") return new Set([key]);

  const next = new Set(openKeys);
  if (next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
  }
  return next;
}

/** Whether an exercise renders its full editing body. */
export function isExerciseOpen(
  mode: BuilderViewMode,
  openKeys: Set<string>,
  key: string
): boolean {
  return mode === "all" || openKeys.has(key);
}
