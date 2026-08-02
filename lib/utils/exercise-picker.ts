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
