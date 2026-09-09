import {
  Activity,
  Dumbbell,
  Footprints,
  HeartPulse,
  Move,
  Sparkles,
  Timer,
  type LucideIcon,
} from "lucide-react";

/**
 * Programs carry no artwork, so client-facing cards need a stand-in. Rather
 * than add a schema field, derive a category icon from the categorisation the
 * trainer already fills in (activities / goals / bodyAreas / free-form tags).
 *
 * Deliberately a heuristic over a taxonomy: an unmatched program simply falls
 * back to the generic dumbbell, which is always a truthful icon for a workout.
 */

/** Ordered most-specific-first: the first matching keyword wins. */
const CATEGORY_RULES: { keywords: string[]; icon: LucideIcon; label: string }[] = [
  { keywords: ["mobility", "stretch", "flexibility", "yoga"], icon: Move, label: "Mobility" },
  { keywords: ["recovery", "rest", "cooldown", "cool down"], icon: HeartPulse, label: "Recovery" },
  { keywords: ["warmup", "warm up", "warm-up", "activation", "prehab"], icon: Sparkles, label: "Warm-Up" },
  { keywords: ["run", "running", "cardio", "endurance", "conditioning"], icon: Footprints, label: "Cardio" },
  { keywords: ["strength", "power", "hypertrophy", "lifting"], icon: Dumbbell, label: "Strength" },
  { keywords: ["rehab", "physio", "injury"], icon: Activity, label: "Rehab" },
  { keywords: ["interval", "hiit", "circuit"], icon: Timer, label: "Intervals" },
];

const FALLBACK = { icon: Dumbbell, label: "Workout" } as const;

export interface ProgramCategorySource {
  tags?: string[] | null;
  activities?: string[] | null;
  goals?: string[] | null;
  bodyAreas?: string[] | null;
  name?: string | null;
}

export interface ProgramCategoryVisual {
  icon: LucideIcon;
  /** Short human-facing category name, safe to show under the icon. */
  label: string;
}

export function getProgramCategoryVisual(program: ProgramCategorySource): ProgramCategoryVisual {
  const haystack = [
    ...(program.activities ?? []),
    ...(program.goals ?? []),
    ...(program.tags ?? []),
    ...(program.bodyAreas ?? []),
    program.name ?? "",
  ]
    .join(" ")
    .toLowerCase();

  const match = CATEGORY_RULES.find((rule) =>
    rule.keywords.some((keyword) => haystack.includes(keyword))
  );

  return match ? { icon: match.icon, label: match.label } : { ...FALLBACK };
}
