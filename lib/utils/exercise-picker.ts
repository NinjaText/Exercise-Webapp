export const EXERCISE_SOURCE_PREFERENCES = ["UNIVERSAL", "ORGANIZATION", "BOTH"] as const;

export type ExerciseSourcePreference = (typeof EXERCISE_SOURCE_PREFERENCES)[number];

export interface PickerTabVisibility {
  showUniversal: boolean;
  showOrganization: boolean;
}

/**
 * Decides which tab(s) the program-builder's exercise picker should show,
 * given the organization's exercise-source preference and whether the
 * trainer belongs to an organization at all. A trainer with no organization
 * always sees Universal only, regardless of a stale/irrelevant preference.
 */
export function resolvePickerTabs(
  preference: ExerciseSourcePreference | undefined,
  hasOrg: boolean
): PickerTabVisibility {
  if (!hasOrg) return { showUniversal: true, showOrganization: false };

  switch (preference ?? "BOTH") {
    case "UNIVERSAL":
      return { showUniversal: true, showOrganization: false };
    case "ORGANIZATION":
      return { showUniversal: false, showOrganization: true };
    default:
      return { showUniversal: true, showOrganization: true };
  }
}

interface MergeableExercise {
  id: string;
  source?: string | null;
  organizationId?: string | null;
}

/**
 * Merges the Universal and My Organization exercise lists into the single
 * list the picker now renders. An exercise can satisfy both source filters
 * (e.g. the caller's own public organization exercise), so entries are
 * deduped by id. The caller's own organization exercises are surfaced first
 * since they're the most relevant/actionable (only they can toggle
 * public/private on them); relative order within each group is preserved.
 */
export function mergeExercisesForPicker<T extends MergeableExercise>(
  universal: T[],
  myOrganization: T[],
  organizationId?: string | null
): T[] {
  const deduped = new Map<string, T>();
  for (const ex of universal) deduped.set(ex.id, ex);
  for (const ex of myOrganization) deduped.set(ex.id, ex);

  const mine: T[] = [];
  const rest: T[] = [];
  for (const ex of deduped.values()) {
    if (ex.source === "ORGANIZATION" && ex.organizationId === organizationId) {
      mine.push(ex);
    } else {
      rest.push(ex);
    }
  }
  return [...mine, ...rest];
}
