import { describe, it, expect } from 'vitest'
import { createProgramSchema, workoutSchema } from '../program'

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
