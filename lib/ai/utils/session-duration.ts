/**
 * Session-duration estimation and dosage fitting.
 *
 * The trainer fixes the circuit structure (exercise counts, rounds, rest
 * between rounds), so the only levers left to hit the requested session
 * length are per-exercise rest and hold times. The model is asked to dose
 * for the target, but it tends to under-rest; this deterministically nudges
 * rest/holds toward the target and reports honestly when the structure
 * itself cannot fill (or fit inside) the requested time.
 */

export interface Dosage {
  sets: number
  reps?: number | null
  durationSeconds?: number | null
  restSeconds?: number | null
  circuitIndex?: number | null
}

export interface DurationCircuit {
  focusType: string
  rounds?: number | null
  restBetweenRounds?: number | null
}

export const SECONDS_PER_REP = 3
const TRANSITION_SECONDS = 10
const MIN_REST_SECONDS = 15
const MAX_REST_SECONDS = 90
const DEFAULT_REST_WHEN_ZERO = 30
const HOLD_SCALE_CAP = 1.5
const UNDER_TOLERANCE = 0.75
const OVER_TOLERANCE = 1.3

function defaultRounds(circuit: DurationCircuit): number {
  return circuit.rounds ?? (circuit.focusType === 'WARMUP' || circuit.focusType === 'COOLDOWN' ? 1 : 3)
}

function exerciseSeconds(d: Dosage): number {
  const sets = Math.max(1, d.sets || 1)
  const work = d.durationSeconds != null && d.durationSeconds > 0
    ? d.durationSeconds
    : (d.reps ?? 10) * SECONDS_PER_REP
  return sets * (work + (d.restSeconds ?? 0)) + TRANSITION_SECONDS
}

export function estimateSessionSeconds(exercises: Dosage[], circuits: DurationCircuit[]): number {
  if (circuits.length === 0) return exercises.reduce((sum, e) => sum + exerciseSeconds(e), 0)
  let total = 0
  circuits.forEach((circuit, idx) => {
    const own = exercises.filter(e => (e.circuitIndex ?? 0) === idx)
    if (own.length === 0) return
    const rounds = defaultRounds(circuit)
    total += own.reduce((sum, e) => sum + exerciseSeconds(e), 0) * rounds
    total += Math.max(0, rounds - 1) * (circuit.restBetweenRounds ?? 0)
  })
  return total
}

export interface FitResult<T> {
  exercises: T[]
  estimatedMinutes: number
  adjusted: boolean
  /** Set when the structure cannot reach (or fit inside) the target even after adjustment. */
  note?: string
}

/**
 * Scales rest (and timed holds) so the estimated session length lands near
 * `targetMinutes`. Reps and sets are never changed — those are programming
 * decisions. Works on any exercise shape via the two accessors.
 */
export function fitDosageToDuration<T>(
  exercises: T[],
  circuits: DurationCircuit[],
  targetMinutes: number,
  toDosage: (e: T) => Dosage,
  withDosage: (e: T, d: Dosage) => T
): FitResult<T> {
  const target = targetMinutes * 60
  let current = exercises.map(toDosage)
  const estimate = () => estimateSessionSeconds(current, circuits)
  const original = estimate()
  let adjusted = false

  if (original < target * UNDER_TOLERANCE) {
    // Step 1: give every exercise at least a default rest; step 2..n: scale
    // rest up (capped) and holds up (capped) until within tolerance.
    current = current.map(d => ({ ...d, restSeconds: d.restSeconds && d.restSeconds > 0 ? d.restSeconds : DEFAULT_REST_WHEN_ZERO }))
    const holdBase = current.map(d => d.durationSeconds ?? null)
    for (let i = 0; i < 6 && estimate() < target * UNDER_TOLERANCE; i++) {
      current = current.map((d, idx) => ({
        ...d,
        restSeconds: Math.min(MAX_REST_SECONDS, Math.round((d.restSeconds ?? DEFAULT_REST_WHEN_ZERO) * 1.25)),
        durationSeconds:
          holdBase[idx] != null
            ? Math.min(Math.round(holdBase[idx]! * HOLD_SCALE_CAP), Math.round((d.durationSeconds ?? holdBase[idx]!) * 1.15))
            : d.durationSeconds,
      }))
    }
    adjusted = true
  } else if (original > target * OVER_TOLERANCE) {
    for (let i = 0; i < 6 && estimate() > target * OVER_TOLERANCE; i++) {
      current = current.map(d => ({
        ...d,
        restSeconds: d.restSeconds ? Math.max(MIN_REST_SECONDS, Math.round(d.restSeconds * 0.75)) : d.restSeconds,
      }))
    }
    adjusted = true
  }

  const finalSeconds = estimate()
  const estimatedMinutes = Math.round(finalSeconds / 60)
  let note: string | undefined
  if (finalSeconds < target * UNDER_TOLERANCE) {
    note = `The configured circuit structure fills about ${estimatedMinutes} minutes at sensible rest, short of the ${targetMinutes}-minute target — add exercises or rounds to the circuits if the full duration matters.`
  } else if (finalSeconds > target * OVER_TOLERANCE) {
    note = `The configured circuit structure needs about ${estimatedMinutes} minutes even at minimal rest, over the ${targetMinutes}-minute target — reduce exercise counts or rounds if the session must fit.`
  }

  return {
    exercises: exercises.map((e, i) => (adjusted ? withDosage(e, current[i]) : e)),
    estimatedMinutes,
    adjusted,
    note,
  }
}
