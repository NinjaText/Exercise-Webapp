import { describe, it, expect } from 'vitest'
import { groupWeeksIntoPhases } from '../program-phasing'
import type { WeekPlan } from '@/lib/ai/types/program-generation'

function week(overrides: Partial<WeekPlan> = {}): WeekPlan {
  return {
    week: 1,
    title: 'Week',
    rehabStage: 'EARLY_REHAB',
    programMode: 'CLINICAL',
    focusAreas: ['LOWER_BODY'],
    difficultyLevel: 'BEGINNER',
    clinicalGuidance: 'guidance',
    contraindicationsThisWeek: [],
    progressionGoal: 'goal',
    derivedIndicationTags: [],
    ...overrides,
  }
}

describe('groupWeeksIntoPhases', () => {
  it('groups all weeks into a single phase when they share the same label', () => {
    const weeks = [
      week({ week: 1, rehabStage: 'EARLY_REHAB' }),
      week({ week: 2, rehabStage: 'EARLY_REHAB' }),
      week({ week: 3, rehabStage: 'EARLY_REHAB' }),
    ]
    const phases = groupWeeksIntoPhases(weeks)
    expect(phases).toHaveLength(1)
    expect(phases[0].weeks).toHaveLength(3)
    expect(phases[0].startWeek).toBe(1)
    expect(phases[0].endWeek).toBe(3)
  })

  it('creates a new phase whenever the label changes', () => {
    const weeks = [
      week({ week: 1, rehabStage: 'EARLY_REHAB' }),
      week({ week: 2, rehabStage: 'EARLY_REHAB' }),
      week({ week: 3, rehabStage: 'MID_REHAB' }),
      week({ week: 4, rehabStage: 'LATE_REHAB' }),
    ]
    const phases = groupWeeksIntoPhases(weeks)
    expect(phases.map(p => p.label)).toEqual(['EARLY_REHAB', 'MID_REHAB', 'LATE_REHAB'])
    expect(phases[0].weeks).toHaveLength(2)
    expect(phases[1].weeks).toHaveLength(1)
    expect(phases[2].weeks).toHaveLength(1)
  })

  it('does not merge a label that repeats non-contiguously', () => {
    const weeks = [
      week({ week: 1, rehabStage: 'EARLY_REHAB' }),
      week({ week: 2, rehabStage: 'MID_REHAB' }),
      week({ week: 3, rehabStage: 'EARLY_REHAB' }),
    ]
    const phases = groupWeeksIntoPhases(weeks)
    expect(phases).toHaveLength(3)
    expect(phases.map(p => p.label)).toEqual(['EARLY_REHAB', 'MID_REHAB', 'EARLY_REHAB'])
  })

  it('assigns sequential phaseIndex values', () => {
    const weeks = [
      week({ week: 1, rehabStage: 'BASE_BUILD' }),
      week({ week: 2, rehabStage: 'BUILD' }),
    ]
    const phases = groupWeeksIntoPhases(weeks)
    expect(phases.map(p => p.phaseIndex)).toEqual([0, 1])
  })

  it('returns an empty array for an empty input', () => {
    expect(groupWeeksIntoPhases([])).toEqual([])
  })
})
