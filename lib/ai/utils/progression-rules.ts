export interface PhaseTemplateExercise {
  exerciseId: string
  exerciseName?: string
  phase: string
  circuitIndex?: number
  baseSets: number
  baseReps?: number | null
  baseDurationSeconds?: number | null
  restSeconds?: number
  notes?: string
}

export interface ProgressedRx {
  sets: number
  reps?: number
  durationSeconds?: number
}

const REP_STEP_BY_DIFFICULTY: Record<string, number> = {
  BEGINNER: 1,
  INTERMEDIATE: 2,
  ADVANCED: 2,
}
const DEFAULT_REP_STEP = 1
const SET_STEP_EVERY_N_WEEKS = 3
const MAX_SET_INCREASE = 2
const MAX_SETS_ABSOLUTE = 5
const DURATION_STEP_SECONDS = 5
const REP_INCREASE_CAP_RATIO = 1.5
const DURATION_INCREASE_CAP_RATIO = 2.0
const DELOAD_EVERY_N_WEEKS = 4
const DELOAD_MIN_PHASE_LENGTH = 4
const DELOAD_SET_FACTOR = 0.7
const DELOAD_REP_FACTOR = 0.8

/**
 * True on every 4th week of a phase, as long as the phase is long enough to
 * warrant one and it isn't the last week of the whole program (no point
 * deloading right before the program ends).
 */
export function isDeloadWeek(
  weekIndexInPhase: number,
  phaseLength: number,
  isLastWeekOfProgram: boolean
): boolean {
  if (phaseLength < DELOAD_MIN_PHASE_LENGTH || isLastWeekOfProgram) return false
  return (weekIndexInPhase + 1) % DELOAD_EVERY_N_WEEKS === 0
}

/**
 * Deterministically computes this week's actual sets/reps/duration from a
 * phase template's week-1 baseline. Never relies on the LLM to do this math —
 * every week within a phase gets a guaranteed, code-verified change instead of
 * hoping the model varies the numbers itself.
 */
export function computeProgressedRx(
  templateEx: PhaseTemplateExercise,
  weekIndexInPhase: number,
  deload: boolean,
  difficultyLevel: string
): ProgressedRx {
  const repStep = REP_STEP_BY_DIFFICULTY[difficultyLevel] ?? DEFAULT_REP_STEP

  let sets = Math.min(
    templateEx.baseSets + Math.floor(weekIndexInPhase / SET_STEP_EVERY_N_WEEKS),
    templateEx.baseSets + MAX_SET_INCREASE,
    MAX_SETS_ABSOLUTE
  )

  let reps: number | undefined
  let durationSeconds: number | undefined

  if (templateEx.baseReps != null) {
    reps = Math.min(
      templateEx.baseReps + repStep * weekIndexInPhase,
      Math.round(templateEx.baseReps * REP_INCREASE_CAP_RATIO)
    )
  } else if (templateEx.baseDurationSeconds != null) {
    durationSeconds = Math.min(
      templateEx.baseDurationSeconds + DURATION_STEP_SECONDS * weekIndexInPhase,
      Math.round(templateEx.baseDurationSeconds * DURATION_INCREASE_CAP_RATIO)
    )
  }

  if (deload) {
    sets = Math.max(1, Math.round(sets * DELOAD_SET_FACTOR))
    if (reps != null) reps = Math.max(1, Math.round(reps * DELOAD_REP_FACTOR))
    if (durationSeconds != null) {
      durationSeconds = Math.max(5, Math.round(durationSeconds * DELOAD_REP_FACTOR))
    }
  }

  return { sets, reps, durationSeconds }
}
