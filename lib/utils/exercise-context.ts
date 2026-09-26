/** Client population an exercise is written for when AI generates its metadata. */
export type ExerciseContext = "CLINICAL" | "PERFORMANCE";

/** What the AI actually writes for: one population, or both at once. */
export type ExerciseAudience = ExerciseContext | "BOTH";

export const EXERCISE_CONTEXT_OPTIONS: { value: ExerciseContext; label: string; hint: string }[] = [
  { value: "CLINICAL", label: "Rehab / Clinical", hint: "Injury recovery & clinical care" },
  { value: "PERFORMANCE", label: "Athletic / Performance", hint: "Strength, conditioning & sport" },
];

/**
 * Collapses the selected contexts into a single audience. Accepts an array
 * (current clients) or a single string (older clients). Anything unrecognised
 * or empty falls back to CLINICAL — the conservative default.
 */
export function resolveExerciseAudience(input: unknown): ExerciseAudience {
  const values = new Set(Array.isArray(input) ? input : [input]);
  const clinical = values.has("CLINICAL");
  const performance = values.has("PERFORMANCE");
  if (clinical && performance) return "BOTH";
  if (performance) return "PERFORMANCE";
  return "CLINICAL";
}
