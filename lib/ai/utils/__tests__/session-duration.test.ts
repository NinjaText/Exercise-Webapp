import { describe, it, expect } from 'vitest'
import { estimateSessionSeconds, fitDosageToDuration, type Dosage } from '../session-duration'

const circuits = [
  { focusType: 'WARMUP', rounds: 1, restBetweenRounds: null },
  { focusType: 'UPPER_BODY', rounds: 2, restBetweenRounds: 45 },
]
const identity = { to: (d: Dosage) => d, with: (_: Dosage, d: Dosage) => d }

describe('estimateSessionSeconds', () => {
  it('multiplies circuit work by rounds and adds rest between rounds', () => {
    const exercises: Dosage[] = [
      { sets: 1, reps: 10, restSeconds: 0, circuitIndex: 0 },       // 30 + 10 = 40
      { sets: 1, reps: 10, restSeconds: 30, circuitIndex: 1 },      // (30+30)+10 = 70 → ×2 = 140, +45 between rounds
    ]
    expect(estimateSessionSeconds(exercises, circuits)).toBe(40 + 140 + 45)
  })
})

describe('fitDosageToDuration', () => {
  it('raises rest and holds when the session is far under target, never touching reps or sets', () => {
    const exercises: Dosage[] = [
      { sets: 1, reps: 12, restSeconds: 0, circuitIndex: 0 },
      { sets: 1, reps: 10, restSeconds: 15, circuitIndex: 1 },
      { sets: 1, durationSeconds: 20, restSeconds: 15, circuitIndex: 1 },
    ]
    const before = estimateSessionSeconds(exercises, circuits)
    const result = fitDosageToDuration(exercises, circuits, 12, identity.to, identity.with)
    expect(result.adjusted).toBe(true)
    expect(estimateSessionSeconds(result.exercises, circuits)).toBeGreaterThan(before)
    expect(result.exercises.map(e => e.reps)).toEqual([12, 10, undefined])
    expect(result.exercises.every(e => (e.restSeconds ?? 0) <= 90)).toBe(true)
    expect(result.exercises[2].durationSeconds).toBeLessThanOrEqual(30)
  })

  it('reports when the structure cannot fill the target even at capped rest', () => {
    const exercises: Dosage[] = [{ sets: 1, reps: 8, restSeconds: 10, circuitIndex: 0 }]
    const result = fitDosageToDuration(exercises, circuits, 45, identity.to, identity.with)
    expect(result.note).toMatch(/short of the 45-minute target/)
  })

  it('trims rest when the session runs long, and leaves a well-fitted session untouched', () => {
    const long: Dosage[] = Array.from({ length: 6 }, () => ({ sets: 1, reps: 15, restSeconds: 90, circuitIndex: 1 }))
    const trimmed = fitDosageToDuration(long, circuits, 10, identity.to, identity.with)
    expect(trimmed.adjusted).toBe(true)
    expect(trimmed.exercises.every(e => (e.restSeconds ?? 0) < 90)).toBe(true)

    const fine: Dosage[] = [{ sets: 1, reps: 10, restSeconds: 30, circuitIndex: 1 }]
    const target = estimateSessionSeconds(fine, circuits) / 60
    const untouched = fitDosageToDuration(fine, circuits, target, identity.to, identity.with)
    expect(untouched.adjusted).toBe(false)
    expect(untouched.note).toBeUndefined()
  })
})
