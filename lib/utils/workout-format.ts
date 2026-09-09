/**
 * Workout label/meta formatting shared by every client-facing surface that
 * summarises a workout in one line — the dashboard hero, the week strip, and
 * the Programs page's "Next Workout" block.
 *
 * Lives in lib/utils (not inside a component) so these stay pure and unit
 * testable; client-dashboard.tsx re-exports them for its existing callers.
 */

/** "Week 2, Day 3: Upper Body" — omits whichever index the workout doesn't carry. */
export function formatDayLabel(
  workout?: { dayIndex?: number | null; weekIndex?: number | null; name?: string | null } | null
): string {
  if (!workout) return "Workout Session";
  const parts: string[] = [];
  if (workout.weekIndex != null) parts.push(`Week ${workout.weekIndex + 1}`);
  if (workout.dayIndex != null) parts.push(`Day ${workout.dayIndex + 1}`);
  const prefix = parts.length > 0 ? `${parts.join(", ")}: ` : "";
  return `${prefix}${workout.name || "Workout Session"}`;
}

/** "~40 min • 10 exercises" — drops the duration when the workout has no estimate. */
export function formatWorkoutMetaLine(
  estimatedMinutes: number | null | undefined,
  exerciseCount: number
): string {
  const exercisePart = `${exerciseCount} ${exerciseCount === 1 ? "exercise" : "exercises"}`;
  if (estimatedMinutes == null) return exercisePart;
  return `~${estimatedMinutes} min • ${exercisePart}`;
}

/** Total exercises across every block of a workout. */
export function countExercises(
  workout?: { blocks: { exercises: { id: string }[] }[] } | null
): number {
  if (!workout) return 0;
  return workout.blocks.reduce((n, b) => n + b.exercises.length, 0);
}
