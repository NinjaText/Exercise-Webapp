/**
 * Deterministic, keyword-based backstop for trainer "hard constraints"
 * (e.g. "no plyometrics", "strength only") described in the Inmotus
 * AI Exercise Program Generation Backend Prompt Specification.
 *
 * This is a stand-in for true metadata-based filtering (spec section 7.4 —
 * isPlyometric/hasJump/isOverheadLoaded tags on Exercise). That requires a
 * schema migration and backfilling every exercise, which hasn't happened
 * yet. Matching against exercise NAME text is inherently imperfect (an
 * exercise named "Skaters" won't match a "jump" keyword) — this exists to
 * catch the common, obvious cases as a safety net alongside the prompt
 * instructions, not to replace them.
 */

export interface HardConstraintCategory {
  id: string
  /** Patterns checked against trainer-authored free text to detect the constraint. */
  triggerPatterns: RegExp[]
  /** Word-boundary patterns checked against exercise names to detect a violation. */
  prohibitedPatterns: RegExp[]
}

const NO_PLYOMETRICS_PATTERNS = [
  /\bplyo\w*\b/i,
  /\bjump\w*\b/i,
  /\bhop\w*\b/i,
  /\bbound(?:ing|s)?\b/i,
  /\bpogo\w*\b/i,
  /\bskater\w*\b/i,
  /\bdepth jump\b/i,
  /\bdrop jump\b/i,
  // Skipping drills (A-skip, B-skip, "Skips for Distance") are repeated
  // takeoff/landing work — plyometric by any trainer's definition.
  /\bskips?\b/i,
  /\bskipping\b/i,
]

const NO_RUNNING_PATTERNS = [/\brun(?:ning|s)?\b/i, /\bjog(?:ging)?\b/i]
const NO_SPRINTING_PATTERNS = [/\bsprint\w*\b/i]
const NO_OVERHEAD_PATTERNS = [/\boverhead\b/i]
const NO_SINGLE_LEG_BALANCE_PATTERNS = [
  /\bsingle[- ]leg (?:stand|stance|balance)\w*\b/i,
  /\bone[- ]leg(?:ged)? (?:stand|stance|balance)\w*\b/i,
  /\bsingle[- ]leg\b.*\beyes closed\b/i,
  /\btandem stance\b/i,
  /\bbalance board\b/i,
  /\bbosu\b/i,
]

const NO_SPINAL_FLEXION_PATTERNS = [
  /\bcrunch\w*\b/i,
  /\bsit-?ups?\b/i,
  /\bcurl-?ups?\b/i,
  /\bv-?ups?\b/i,
  /\bjackknife\b/i,
  /\brussian twist\w*\b/i,
  /\btoe touch\w*\b/i,
  /\bknees? to elbows?\b/i,
]

export const HARD_CONSTRAINT_CATEGORIES: HardConstraintCategory[] = [
  {
    id: 'NO_SPINAL_FLEXION',
    triggerPatterns: [
      /(?:\bno\b|\bavoid\b|do not|don't|\bwithout\b|\bexclude\b)[^.;\n]*(?:loaded |repeated |end-range )?(?:spinal|lumbar|trunk|spine) flexion/i,
      /(?:\bno\b|\bavoid\b|do not|don't|\bexclude\b)[^.;\n]*\b(?:sit-?ups?|crunch\w*|curl-?ups?)\b/i,
    ],
    prohibitedPatterns: NO_SPINAL_FLEXION_PATTERNS,
  },
  {
    id: 'NO_PLYOMETRICS',
    triggerPatterns: [/no plyometric/i, /no jump/i, /avoid jump/i, /no hopping/i, /no bounding/i, /avoid plyometric/i],
    prohibitedPatterns: NO_PLYOMETRICS_PATTERNS,
  },
  {
    id: 'NO_RUNNING',
    triggerPatterns: [/no running/i, /avoid running/i, /\bno run\b/i],
    prohibitedPatterns: NO_RUNNING_PATTERNS,
  },
  {
    id: 'NO_SPRINTING',
    triggerPatterns: [/no sprint/i, /avoid sprint/i],
    prohibitedPatterns: NO_SPRINTING_PATTERNS,
  },
  {
    id: 'NO_OVERHEAD',
    triggerPatterns: [/no overhead/i, /avoid overhead/i],
    prohibitedPatterns: NO_OVERHEAD_PATTERNS,
  },
  {
    id: 'NO_SINGLE_LEG_BALANCE',
    triggerPatterns: [
      /(?:\bno\b|\bavoid\b|do not use|don't use|\bwithout\b|\bexclude\b|\bskip\b)[^.;\n]*(?:single|one)[- ]leg(?:ged)? (?:balance|stance|stand)/i,
      /(?:\bno\b|\bavoid\b|do not use|don't use|\bexclude\b)[^.;\n]*\bbalance (?:work|exercises|drills|training)/i,
    ],
    prohibitedPatterns: NO_SINGLE_LEG_BALANCE_PATTERNS,
  },
  {
    id: 'STRENGTH_ONLY',
    triggerPatterns: [/strength only/i, /strictly strength/i, /strength-only/i],
    prohibitedPatterns: [
      ...NO_PLYOMETRICS_PATTERNS,
      ...NO_RUNNING_PATTERNS,
      ...NO_SPRINTING_PATTERNS,
      /\bcardio\b/i,
      /\bconditioning\b/i,
      /\bagility\b/i,
    ],
  },
]

/**
 * Scans trainer-authored free text (subjective, instructions, additional
 * notes, program restrictions) and returns every hard-constraint category
 * it triggers.
 */
export function extractHardConstraints(
  ...texts: (string | null | undefined)[]
): HardConstraintCategory[] {
  const combined = texts.filter(Boolean).join(' \n ')
  if (!combined.trim()) return []
  return HARD_CONSTRAINT_CATEGORIES.filter((category) =>
    category.triggerPatterns.some((pattern) => pattern.test(combined))
  )
}

export function exerciseViolatesHardConstraints(
  exerciseName: string,
  categories: HardConstraintCategory[]
): boolean {
  if (categories.length === 0) return false
  return categories.some((category) =>
    category.prohibitedPatterns.some((pattern) => pattern.test(exerciseName))
  )
}

/** Pre-filter step: remove violating exercises from a candidate pool before generation. */
export function filterPoolByHardConstraints<T extends { name: string }>(
  pool: T[],
  categories: HardConstraintCategory[]
): T[] {
  if (categories.length === 0) return pool
  return pool.filter((exercise) => !exerciseViolatesHardConstraints(exercise.name, categories))
}

export interface HardConstraintAuditResult<T> {
  cleaned: T[]
  violationsFound: { exerciseId: string; exerciseName: string; categoryId: string }[]
  unresolvedViolations: { exerciseId: string; exerciseName: string; categoryId: string }[]
}

/**
 * Post-generation audit (spec section P / 7.3): inspects every generated
 * exercise against every hard constraint and swaps violators for a
 * compliant, unused pool exercise sharing a body region where possible.
 * Never throws — an unresolved violation (pool exhausted) is reported but
 * left in place so the caller can decide how to surface it.
 */
export function auditAndReplaceViolations<
  T extends { exerciseId: string; exerciseName?: string },
  P extends { id: string; name: string; bodyRegion: string[] }
>(
  exercises: T[],
  categories: HardConstraintCategory[],
  pool: P[],
  usedIds: Set<string> = new Set(exercises.map((e) => e.exerciseId))
): HardConstraintAuditResult<T> {
  if (categories.length === 0) {
    return { cleaned: exercises, violationsFound: [], unresolvedViolations: [] }
  }

  const poolById = new Map(pool.map((p) => [p.id, p]))
  const violationsFound: HardConstraintAuditResult<T>['violationsFound'] = []
  const unresolvedViolations: HardConstraintAuditResult<T>['unresolvedViolations'] = []

  const cleaned = exercises.map((exercise) => {
    const poolItem = poolById.get(exercise.exerciseId)
    const name = poolItem?.name ?? exercise.exerciseName ?? ''
    const violatedCategory = categories.find((category) =>
      category.prohibitedPatterns.some((pattern) => pattern.test(name))
    )
    if (!violatedCategory) return exercise

    violationsFound.push({
      exerciseId: exercise.exerciseId,
      exerciseName: name,
      categoryId: violatedCategory.id,
    })

    const replacement =
      pool.find(
        (p) =>
          !usedIds.has(p.id) &&
          p.id !== exercise.exerciseId &&
          !exerciseViolatesHardConstraints(p.name, categories) &&
          (!poolItem || p.bodyRegion.some((r) => poolItem.bodyRegion.includes(r)))
      ) ??
      pool.find((p) => !usedIds.has(p.id) && !exerciseViolatesHardConstraints(p.name, categories))

    if (!replacement) {
      unresolvedViolations.push({
        exerciseId: exercise.exerciseId,
        exerciseName: name,
        categoryId: violatedCategory.id,
      })
      return exercise
    }

    usedIds.add(replacement.id)
    return { ...exercise, exerciseId: replacement.id, exerciseName: replacement.name }
  })

  return { cleaned, violationsFound, unresolvedViolations }
}
