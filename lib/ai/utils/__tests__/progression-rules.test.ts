import { describe, it, expect } from 'vitest'
import { computeProgressedRx, isDeloadWeek, type PhaseTemplateExercise } from '../progression-rules'

function templateEx(overrides: Partial<PhaseTemplateExercise> = {}): PhaseTemplateExercise {
  return {
    exerciseId: 'ex1',
    exerciseName: 'Squat',
    phase: 'STRENGTHENING',
    baseSets: 3,
    baseReps: 10,
    ...overrides,
  }
}

describe('isDeloadWeek', () => {
  it('never fires on phases shorter than 4 weeks', () => {
    expect(isDeloadWeek(3, 3, false)).toBe(false)
  })

  it('never fires on the last week of the program', () => {
    expect(isDeloadWeek(3, 6, true)).toBe(false)
  })

  it('fires on the 4th week of a long-enough phase', () => {
    expect(isDeloadWeek(3, 6, false)).toBe(true)
  })

  it('fires on the 8th week too (every 4th week)', () => {
    expect(isDeloadWeek(7, 8, false)).toBe(true)
  })

  it('does not fire on weeks 1-3 of a phase', () => {
    expect(isDeloadWeek(0, 6, false)).toBe(false)
    expect(isDeloadWeek(1, 6, false)).toBe(false)
    expect(isDeloadWeek(2, 6, false)).toBe(false)
  })
})

describe('computeProgressedRx', () => {
  it('returns the baseline unchanged on week 0 of a phase', () => {
    const rx = computeProgressedRx(templateEx(), 0, false, 'BEGINNER')
    expect(rx.sets).toBe(3)
    expect(rx.reps).toBe(10)
  })

  it('increases reps according to the difficulty step', () => {
    const beginner = computeProgressedRx(templateEx(), 2, false, 'BEGINNER')
    const advanced = computeProgressedRx(templateEx(), 2, false, 'ADVANCED')
    expect(beginner.reps).toBe(12) // +1/week
    expect(advanced.reps).toBe(14) // +2/week
  })

  it('caps reps at 1.5x the baseline no matter how many weeks pass', () => {
    const rx = computeProgressedRx(templateEx({ baseReps: 10 }), 50, false, 'ADVANCED')
    expect(rx.reps).toBeLessThanOrEqual(15)
  })

  it('increases sets every SET_STEP_EVERY_N_WEEKS, capped at +2 and 5 absolute', () => {
    const week0 = computeProgressedRx(templateEx({ baseSets: 3 }), 0, false, 'BEGINNER')
    const week3 = computeProgressedRx(templateEx({ baseSets: 3 }), 3, false, 'BEGINNER')
    const week99 = computeProgressedRx(templateEx({ baseSets: 3 }), 99, false, 'BEGINNER')
    expect(week0.sets).toBe(3)
    expect(week3.sets).toBe(4)
    expect(week99.sets).toBeLessThanOrEqual(5)
  })

  it('progresses durationSeconds instead of reps when baseReps is absent', () => {
    const rx = computeProgressedRx(
      templateEx({ baseReps: null, baseDurationSeconds: 20 }),
      2,
      false,
      'BEGINNER'
    )
    expect(rx.reps).toBeUndefined()
    expect(rx.durationSeconds).toBe(30)
  })

  it('reduces volume on a deload week', () => {
    const normal = computeProgressedRx(templateEx({ baseSets: 4, baseReps: 12 }), 3, false, 'BEGINNER')
    const deload = computeProgressedRx(templateEx({ baseSets: 4, baseReps: 12 }), 3, true, 'BEGINNER')
    expect(deload.sets).toBeLessThan(normal.sets)
    expect(deload.reps!).toBeLessThan(normal.reps!)
  })

  it('never reduces sets below 1 on deload', () => {
    const rx = computeProgressedRx(templateEx({ baseSets: 1, baseReps: 5 }), 0, true, 'BEGINNER')
    expect(rx.sets).toBeGreaterThanOrEqual(1)
  })
})
