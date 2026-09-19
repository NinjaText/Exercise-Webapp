/**
 * Detects library exercises the trainer explicitly named in their free-text
 * instructions (e.g. "Include Goblet Squat in every lower body session") so
 * they can be pinned into the exercise pool and called out to the model as
 * required. Without this, a named exercise that the difficulty/region pool
 * query happened to exclude fails silently — the model never sees it.
 */

const NEGATION_PATTERN = /\b(no|not|never|avoid|without|exclude|excluding|skip|don't|do not|omit|remove|stop)\b/i

/**
 * Lowercases, strips punctuation, and singularizes plural tokens so
 * "Goblet Squats" and "goblet squat" compare equal.
 */
export function normalizeForNameMatch(text: string): string {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map(t => (t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t))
  return ` ${tokens.join(' ')} `
}

/**
 * Splits trainer text into clauses and drops any clause carrying a negation,
 * so "No jumping. Include Goblet Squat." only yields Goblet Squat and
 * "Avoid Bulgarian split squats" yields nothing.
 */
export function affirmativeClauses(text: string): string[] {
  return text
    .split(/[.;\n,]+|\bbut\b|\bhowever\b/i)
    .map(c => c.trim())
    .filter(c => c.length > 0 && !NEGATION_PATTERN.test(c))
}

export interface NamedExerciseCandidate {
  id: string
  name: string
}

export interface TrainerExerciseRequirement<T extends NamedExerciseCandidate> {
  exercise: T
  /** The clause naming the exercise also said "every"/"each"/"all" session,
   *  so the exercise must appear in every session, not just somewhere. */
  everySession: boolean
  /** The clause naming the exercise also stated sets/reps/hold numbers. */
  prescribesDosage: boolean
}

const EVERY_SESSION_PATTERN = /\b(every|each|all)\b/i

/** "4x6", "3 sets of 8", "12 reps", "30 sec hold", "2 min" */
export const DOSAGE_PATTERN = /\d+\s*(?:x|×)\s*\d+|\d+\s*sets?\b|\d+\s*reps?\b|\d+\s*(?:sec(?:ond)?s?|s)\b|\d+\s*min(?:ute)?s?\b/i

export function textPrescribesDosage(...texts: (string | null | undefined)[]): boolean {
  return DOSAGE_PATTERN.test(texts.filter(Boolean).join(' '))
}

/**
 * Returns the library exercises whose full name appears inside an
 * affirmative clause of any of the supplied texts. Very short single-word
 * names are skipped — "Run" or "Lunges" would otherwise match casually
 * used words.
 */
export function findTrainerNamedExerciseRequirements<T extends NamedExerciseCandidate>(
  texts: (string | null | undefined)[],
  library: T[]
): TrainerExerciseRequirement<T>[] {
  const clauses = texts
    .filter((t): t is string => !!t && t.trim().length > 0)
    .flatMap(affirmativeClauses)
  if (clauses.length === 0) return []
  const normalizedClauses = clauses.map(c => ({
    text: normalizeForNameMatch(c),
    everySession: EVERY_SESSION_PATTERN.test(c),
    prescribesDosage: DOSAGE_PATTERN.test(c),
  }))

  const matches: TrainerExerciseRequirement<T>[] = []
  const seen = new Set<string>()
  for (const exercise of library) {
    const normalized = normalizeForNameMatch(exercise.name).trim()
    const tokenCount = normalized.split(' ').length
    if (tokenCount < 2 && normalized.length < 8) continue
    const needle = ` ${normalized} `
    const hits = normalizedClauses.filter(clause => clause.text.includes(needle))
    if (hits.length > 0 && !seen.has(normalized)) {
      seen.add(normalized)
      matches.push({
        exercise,
        everySession: hits.some(h => h.everySession),
        prescribesDosage: hits.some(h => h.prescribesDosage),
      })
    }
  }
  return matches
}

export function findTrainerNamedExercises<T extends NamedExerciseCandidate>(
  texts: (string | null | undefined)[],
  library: T[]
): T[] {
  return findTrainerNamedExerciseRequirements(texts, library).map(r => r.exercise)
}
