import { describe, it, expect } from 'vitest'
import { groupSessionsByWeek } from '../schedule-weeks'
import type { SessionData } from '@/components/programs/schedule-shared'

function makeSession(id: string, scheduledDate: string, status = 'SCHEDULED'): SessionData {
  return {
    id,
    scheduledDate,
    status,
    workout: {
      id: `workout_${id}`,
      name: `Workout ${id}`,
      dayIndex: 0,
      weekIndex: 0,
      estimatedMinutes: 40,
      blocks: [],
    },
  }
}

describe('groupSessionsByWeek', () => {
  it('returns an empty result for no sessions', () => {
    const result = groupSessionsByWeek([], new Date('2026-08-18T00:00:00.000Z'))

    expect(result.weeks).toEqual([])
    expect(result.defaultWeekIndex).toBe(0)
  })

  it('buckets sessions within the same calendar week (Mon-Sun) together', () => {
    // Mon 2026-08-17, Wed 2026-08-19 — same week
    const sessions = [
      makeSession('a', '2026-08-17T00:00:00.000Z'),
      makeSession('b', '2026-08-19T00:00:00.000Z'),
    ]

    const result = groupSessionsByWeek(sessions, new Date('2026-08-17T00:00:00.000Z'))

    expect(result.weeks).toHaveLength(1)
    expect(result.weeks[0].map((s) => s.id)).toEqual(['a', 'b'])
  })

  it('splits sessions a week apart into separate week buckets, sorted within each week', () => {
    // Week 1: Mon Aug 17, Fri Aug 21 (out of order input)
    // Week 2: Mon Aug 24
    const sessions = [
      makeSession('friday', '2026-08-21T00:00:00.000Z'),
      makeSession('monday1', '2026-08-17T00:00:00.000Z'),
      makeSession('monday2', '2026-08-24T00:00:00.000Z'),
    ]

    const result = groupSessionsByWeek(sessions, new Date('2026-08-17T00:00:00.000Z'))

    expect(result.weeks).toHaveLength(2)
    expect(result.weeks[0].map((s) => s.id)).toEqual(['monday1', 'friday'])
    expect(result.weeks[1].map((s) => s.id)).toEqual(['monday2'])
  })

  it('produces an empty bucket for a week with no sessions between two scheduled weeks', () => {
    const sessions = [
      makeSession('week1', '2026-08-17T00:00:00.000Z'),
      makeSession('week3', '2026-08-31T00:00:00.000Z'),
    ]

    const result = groupSessionsByWeek(sessions, new Date('2026-08-17T00:00:00.000Z'))

    expect(result.weeks).toHaveLength(3)
    expect(result.weeks[1]).toEqual([])
  })

  it('sets defaultWeekIndex to the week containing "today"', () => {
    const sessions = [
      makeSession('week1', '2026-08-17T00:00:00.000Z'),
      makeSession('week2', '2026-08-24T00:00:00.000Z'),
      makeSession('week3', '2026-08-31T00:00:00.000Z'),
    ]

    const result = groupSessionsByWeek(sessions, new Date('2026-08-25T12:00:00.000Z'))

    expect(result.defaultWeekIndex).toBe(1)
  })

  it('clamps defaultWeekIndex into range when "today" falls outside the program', () => {
    const sessions = [makeSession('week1', '2026-08-17T00:00:00.000Z')]

    const past = groupSessionsByWeek(sessions, new Date('2026-01-01T00:00:00.000Z'))
    const future = groupSessionsByWeek(sessions, new Date('2027-01-01T00:00:00.000Z'))

    expect(past.defaultWeekIndex).toBe(0)
    expect(future.defaultWeekIndex).toBe(0)
  })
})
