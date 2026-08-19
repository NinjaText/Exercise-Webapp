import { describe, it, expect } from 'vitest'
import { formatDayLabel, formatWorkoutMetaLine, countExercises } from '../client-dashboard'

describe('formatDayLabel', () => {
  it('composes "Day N: name" from a 0-indexed dayIndex', () => {
    expect(formatDayLabel({ dayIndex: 1, name: 'Upper Body + Shoulder Stability' })).toBe(
      'Day 2: Upper Body + Shoulder Stability'
    )
  })

  it('falls back to "Workout Session" when there is no workout', () => {
    expect(formatDayLabel(null)).toBe('Workout Session')
    expect(formatDayLabel(undefined)).toBe('Workout Session')
  })

  it('falls back to "Workout Session" when the workout has no name', () => {
    expect(formatDayLabel({ dayIndex: 0, name: null })).toBe('Day 1: Workout Session')
  })

  it('omits the "Day N:" prefix when dayIndex is missing', () => {
    expect(formatDayLabel({ name: 'Mobility Flow' })).toBe('Mobility Flow')
  })

  it('composes "Week M, Day N: name" when both weekIndex and dayIndex are present', () => {
    expect(
      formatDayLabel({ weekIndex: 0, dayIndex: 1, name: 'Upper Body + Shoulder Stability' })
    ).toBe('Week 1, Day 2: Upper Body + Shoulder Stability')
  })

  it('omits the week prefix when weekIndex is missing but dayIndex is present', () => {
    expect(formatDayLabel({ dayIndex: 2, name: 'Lower Body' })).toBe('Day 3: Lower Body')
  })
})

describe('formatWorkoutMetaLine', () => {
  it('includes duration when estimatedMinutes is set', () => {
    expect(formatWorkoutMetaLine(40, 10)).toBe('~40 min • 10 exercises')
  })

  it('uses singular "exercise" for a count of 1', () => {
    expect(formatWorkoutMetaLine(15, 1)).toBe('~15 min • 1 exercise')
  })

  it('omits duration when estimatedMinutes is null', () => {
    expect(formatWorkoutMetaLine(null, 8)).toBe('8 exercises')
  })

  it('omits duration when estimatedMinutes is undefined', () => {
    expect(formatWorkoutMetaLine(undefined, 8)).toBe('8 exercises')
  })
})

describe('countExercises', () => {
  it('sums exercises across all blocks', () => {
    expect(
      countExercises({
        blocks: [{ exercises: [{ id: '1' }, { id: '2' }] }, { exercises: [{ id: '3' }] }],
      })
    ).toBe(3)
  })

  it('returns 0 for a null/undefined workout', () => {
    expect(countExercises(null)).toBe(0)
    expect(countExercises(undefined)).toBe(0)
  })

  it('returns 0 for a workout with no blocks', () => {
    expect(countExercises({ blocks: [] })).toBe(0)
  })
})
