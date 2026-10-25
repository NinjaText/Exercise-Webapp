import { describe, it, expect } from 'vitest'
import { createProgramSchema, updateProgramSchema, workoutSchema, getFollowAlongWorkoutIssues } from '../program'

const baseWorkout = {
  name: 'Day 1',
  dayIndex: 0,
  weekIndex: 0,
  orderIndex: 0,
  blocks: [],
}

describe('workoutSchema', () => {
  it('accepts dayIndex 0 through 6', () => {
    for (let dayIndex = 0; dayIndex <= 6; dayIndex++) {
      expect(workoutSchema.safeParse({ ...baseWorkout, dayIndex }).success).toBe(true)
    }
  })

  it('rejects a dayIndex of 7 or more (max 7 days per week)', () => {
    const result = workoutSchema.safeParse({ ...baseWorkout, dayIndex: 7 })
    expect(result.success).toBe(false)
  })

  it('rejects a negative weekIndex', () => {
    const result = workoutSchema.safeParse({ ...baseWorkout, weekIndex: -1 })
    expect(result.success).toBe(false)
  })
})

describe('createProgramSchema', () => {
  it('defaults organizationIds to an empty array when omitted', () => {
    const result = createProgramSchema.safeParse({ name: 'Test Program' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.organizationIds).toEqual([])
    }
  })

  it('accepts an explicit organizationIds array', () => {
    const result = createProgramSchema.safeParse({
      name: 'Test Program',
      organizationIds: ['org_1', 'org_2'],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.organizationIds).toEqual(['org_1', 'org_2'])
    }
  })
})

describe('follow-along validation', () => {
  const videoDay = (day: number, overrides: Record<string, unknown> = {}) => {
    const weekIndex = Math.floor((day - 1) / 7)
    const dayIndex = (day - 1) % 7
    return {
      name: `Day ${day}`,
      weekIndex,
      dayIndex,
      orderIndex: weekIndex * 7 + dayIndex,
      videoUrl: 'https://media.example.com/follow-along/t1/abc.mp4',
      videoDurationSec: 900,
      blocks: [],
      ...overrides,
    }
  }
  const followAlong = (workouts: unknown[]) => ({
    name: '90 day reset',
    contentFormat: 'FOLLOW_ALONG',
    workouts,
  })

  it('accepts a follow-along program of zero-block video days', () => {
    const result = createProgramSchema.safeParse(followAlong([videoDay(1), videoDay(3), videoDay(90)]))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.contentFormat).toBe('FOLLOW_ALONG')
      expect(result.data.workouts[0].videoUrl).toBe('https://media.example.com/follow-along/t1/abc.mp4')
      expect(result.data.workouts[0].videoDurationSec).toBe(900)
    }
  })

  it('rejects a zero-block day without a video in a follow-along program', () => {
    const result = createProgramSchema.safeParse(followAlong([videoDay(1, { videoUrl: null })]))
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0].message).toMatch(/needs a video/)
  })

  it('still accepts zero-block workouts in a normal program', () => {
    const result = createProgramSchema.safeParse({
      name: 'Normal',
      workouts: [{ ...baseWorkout }],
    })
    expect(result.success).toBe(true)
  })

  it('caps a follow-along program at 365 days', () => {
    expect(createProgramSchema.safeParse(followAlong([videoDay(365)])).success).toBe(true)
    const result = createProgramSchema.safeParse(followAlong([videoDay(366)]))
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0].message).toMatch(/365 days/)
  })

  it('rejects two videos on the same day', () => {
    expect(createProgramSchema.safeParse(followAlong([videoDay(4), videoDay(4)])).success).toBe(false)
  })

  it('applies the same rules on update when contentFormat is sent', () => {
    expect(updateProgramSchema.safeParse(followAlong([videoDay(400)])).success).toBe(false)
    expect(updateProgramSchema.safeParse({ name: 'Rename only' }).success).toBe(true)
  })

  it('exposes the follow-along issues for a stored follow-along program', () => {
    expect(getFollowAlongWorkoutIssues([videoDay(2, { videoUrl: null })])).toEqual([
      { index: 0, path: 'videoUrl', message: 'Day 2 needs a video (or mark it as a rest day)' },
    ])
  })

  it('rejects a video workout that also has blocks', () => {
    const result = workoutSchema.safeParse({
      ...videoDay(1),
      blocks: [{ type: 'NORMAL', orderIndex: 0, rounds: 1, exercises: [] }],
    })
    expect(result.success).toBe(false)
  })

  it('validates the video URL', () => {
    expect(workoutSchema.safeParse(videoDay(1, { videoUrl: 'http://insecure.example.com/a.mp4' })).success).toBe(false)
    expect(workoutSchema.safeParse(videoDay(1, { videoUrl: 'not a url' })).success).toBe(false)
    expect(workoutSchema.safeParse(videoDay(1, { videoUrl: 'https://www.youtube.com/results?search_query=x' })).success).toBe(false)
    expect(workoutSchema.safeParse(videoDay(1, { videoUrl: 'https://youtu.be/dQw4w9WgXcQ' })).success).toBe(true)
  })

  it('rejects a non-positive or absurd video duration', () => {
    expect(workoutSchema.safeParse(videoDay(1, { videoDurationSec: 0 })).success).toBe(false)
    expect(workoutSchema.safeParse(videoDay(1, { videoDurationSec: 13 * 3600 })).success).toBe(false)
  })
})

describe('updateProgramSchema partial updates', () => {
  it('never injects defaults for fields the caller did not send', () => {
    const result = updateProgramSchema.safeParse({ name: 'Rename only' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toEqual({ name: 'Rename only' })
  })

  it('keeps explicitly sent arrays', () => {
    const result = updateProgramSchema.safeParse({ tags: ['a'], workouts: [] })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toEqual({ tags: ['a'], workouts: [] })
  })
})
