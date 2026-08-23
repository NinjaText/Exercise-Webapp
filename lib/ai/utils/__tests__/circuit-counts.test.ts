import { describe, it, expect, vi, afterEach } from 'vitest'
import { enforceCircuitExerciseCounts, type CircuitCountPoolItem } from '../circuit-counts'

function pool(): CircuitCountPoolItem[] {
  return [
    { id: 'a', name: 'Squat', bodyRegion: ['LOWER_BODY'], exercisePhases: ['STRENGTHENING'], defaultSets: 3, defaultReps: 10, defaultHoldSeconds: null },
    { id: 'b', name: 'Lunge', bodyRegion: ['LOWER_BODY'], exercisePhases: ['STRENGTHENING'], defaultSets: 3, defaultReps: 10, defaultHoldSeconds: null },
    { id: 'c', name: 'Leg Press', bodyRegion: ['LOWER_BODY'], exercisePhases: ['STRENGTHENING'], defaultSets: 3, defaultReps: 12, defaultHoldSeconds: null },
    { id: 'd', name: 'Calf Raise', bodyRegion: ['LOWER_BODY'], exercisePhases: ['STRENGTHENING'], defaultSets: 3, defaultReps: 15, defaultHoldSeconds: null },
    { id: 'e', name: 'Push-up', bodyRegion: ['UPPER_BODY'], exercisePhases: ['STRENGTHENING'], defaultSets: 3, defaultReps: 10, defaultHoldSeconds: null },
    { id: 'f', name: 'Arm Circles', bodyRegion: ['UPPER_BODY'], exercisePhases: ['WARMUP'], defaultSets: 1, defaultReps: 15, defaultHoldSeconds: null },
    { id: 'g', name: 'Plank', bodyRegion: ['CORE'], exercisePhases: ['STRENGTHENING'], defaultSets: 3, defaultReps: null, defaultHoldSeconds: 30 },
  ]
}

type TestExercise = { exerciseId: string; circuitIndex?: number; orderIndex: number }

function createExercise(poolItem: CircuitCountPoolItem, circuitIndex: number, orderIndex: number): TestExercise {
  return { exerciseId: poolItem.id, circuitIndex, orderIndex }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('enforceCircuitExerciseCounts', () => {
  it('leaves a day untouched when every circuit already has the configured count', () => {
    const byDay = new Map<number, TestExercise[]>([
      [0, [
        { exerciseId: 'a', circuitIndex: 0, orderIndex: 0 },
        { exerciseId: 'b', circuitIndex: 0, orderIndex: 1 },
      ]],
    ])
    const result = enforceCircuitExerciseCounts(byDay, [{ exerciseCount: 2, focusType: 'LOWER_BODY' }], pool(), createExercise)
    expect(result.get(0)!.map((e) => e.exerciseId)).toEqual(['a', 'b'])
  })

  it('trims a circuit that came back with more exercises than configured', () => {
    const byDay = new Map<number, TestExercise[]>([
      [0, [
        { exerciseId: 'a', circuitIndex: 0, orderIndex: 0 },
        { exerciseId: 'b', circuitIndex: 0, orderIndex: 1 },
        { exerciseId: 'c', circuitIndex: 0, orderIndex: 2 },
        { exerciseId: 'd', circuitIndex: 0, orderIndex: 3 },
      ]],
    ])
    const result = enforceCircuitExerciseCounts(byDay, [{ exerciseCount: 2, focusType: 'LOWER_BODY' }], pool(), createExercise)
    expect(result.get(0)).toHaveLength(2)
    expect(result.get(0)!.map((e) => e.exerciseId)).toEqual(['a', 'b'])
  })

  it('backfills a circuit that came back short, preferring focus-matching pool exercises', () => {
    const byDay = new Map<number, TestExercise[]>([
      [0, [{ exerciseId: 'a', circuitIndex: 0, orderIndex: 0 }]],
    ])
    const result = enforceCircuitExerciseCounts(byDay, [{ exerciseCount: 4, focusType: 'LOWER_BODY' }], pool(), createExercise)
    const ids = result.get(0)!.map((e) => e.exerciseId)
    expect(ids).toHaveLength(4)
    expect(ids).toContain('a')
    // b, c, d are the other LOWER_BODY pool items — backfill should exhaust those before ever
    // reaching upper-body/core items (e, f, g), since they match the circuit's focusType.
    expect(ids.every((id) => ['a', 'b', 'c', 'd'].includes(id))).toBe(true)
  })

  it('does not reuse an exerciseId already used elsewhere in the plan when backfilling', () => {
    const byDay = new Map<number, TestExercise[]>([
      [0, [
        { exerciseId: 'a', circuitIndex: 0, orderIndex: 0 },
        { exerciseId: 'b', circuitIndex: 0, orderIndex: 1 },
        { exerciseId: 'c', circuitIndex: 0, orderIndex: 2 },
      ]], // day 0 is already at the full LOWER_BODY pool minus 'd'
      [1, [{ exerciseId: 'd', circuitIndex: 0, orderIndex: 0 }]], // day 1 short by 1, only 'd' used so far on day 1
    ])
    const result = enforceCircuitExerciseCounts(byDay, [{ exerciseCount: 2, focusType: 'LOWER_BODY' }], pool(), createExercise)
    const day0Ids = result.get(0)!.map((e) => e.exerciseId)
    const day1Ids = result.get(1)!.map((e) => e.exerciseId)
    const allIds = [...day0Ids, ...day1Ids]
    // No id appears on both days, and no id is duplicated overall.
    expect(new Set(allIds).size).toBe(allIds.length)
  })

  it('falls back to any available exercise when the focus-matching pool is exhausted', () => {
    const byDay = new Map<number, TestExercise[]>([
      [0, [
        { exerciseId: 'a', circuitIndex: 0, orderIndex: 0 },
        { exerciseId: 'b', circuitIndex: 0, orderIndex: 1 },
        { exerciseId: 'c', circuitIndex: 0, orderIndex: 2 },
        { exerciseId: 'd', circuitIndex: 0, orderIndex: 3 },
      ]], // every LOWER_BODY pool item is already used
    ])
    const result = enforceCircuitExerciseCounts(byDay, [{ exerciseCount: 5, focusType: 'LOWER_BODY' }], pool(), createExercise)
    const ids = result.get(0)!.map((e) => e.exerciseId)
    expect(ids).toHaveLength(5)
    // The 5th pick must come from outside LOWER_BODY since that pool is exhausted.
    expect(['e', 'f', 'g']).toContain(ids[4])
  })

  it('warns and returns a short list when the entire pool is exhausted', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const tinyPool: CircuitCountPoolItem[] = [
      { id: 'a', name: 'Squat', bodyRegion: ['LOWER_BODY'], exercisePhases: ['STRENGTHENING'], defaultSets: 3, defaultReps: 10, defaultHoldSeconds: null },
    ]
    const byDay = new Map<number, TestExercise[]>([[0, [{ exerciseId: 'a', circuitIndex: 0, orderIndex: 0 }]]])
    const result = enforceCircuitExerciseCounts(byDay, [{ exerciseCount: 3, focusType: 'LOWER_BODY' }], tinyPool, createExercise)
    expect(result.get(0)).toHaveLength(1)
    expect(warnSpy).toHaveBeenCalled()
  })

  it('corrects multiple circuits independently within the same day', () => {
    const byDay = new Map<number, TestExercise[]>([
      [0, [
        { exerciseId: 'a', circuitIndex: 0, orderIndex: 0 }, // circuit 0 short by 1 (wants 2)
        { exerciseId: 'e', circuitIndex: 1, orderIndex: 0 },
        { exerciseId: 'f', circuitIndex: 1, orderIndex: 1 },
        { exerciseId: 'g', circuitIndex: 1, orderIndex: 2 }, // circuit 1 has 1 too many (wants 2)
      ]],
    ])
    const result = enforceCircuitExerciseCounts(
      byDay,
      [
        { exerciseCount: 2, focusType: 'LOWER_BODY' },
        { exerciseCount: 2, focusType: 'UPPER_BODY' },
      ],
      pool(),
      createExercise
    )
    const byCircuit = new Map<number, string[]>()
    for (const ex of result.get(0)!) {
      if (!byCircuit.has(ex.circuitIndex!)) byCircuit.set(ex.circuitIndex!, [])
      byCircuit.get(ex.circuitIndex!)!.push(ex.exerciseId)
    }
    expect(byCircuit.get(0)).toHaveLength(2)
    expect(byCircuit.get(0)).toContain('a')
    expect(byCircuit.get(1)).toHaveLength(2)
    expect(byCircuit.get(1)).toEqual(['e', 'f'])
  })

  it('preserves exercises with no circuitIndex untouched', () => {
    const byDay = new Map<number, TestExercise[]>([
      [0, [
        { exerciseId: 'a', orderIndex: 0 }, // no circuitIndex
        { exerciseId: 'e', circuitIndex: 0, orderIndex: 1 },
      ]],
    ])
    const result = enforceCircuitExerciseCounts(byDay, [{ exerciseCount: 1, focusType: 'UPPER_BODY' }], pool(), createExercise)
    const ids = result.get(0)!.map((e) => e.exerciseId)
    expect(ids).toContain('a')
    expect(ids).toContain('e')
  })
})
