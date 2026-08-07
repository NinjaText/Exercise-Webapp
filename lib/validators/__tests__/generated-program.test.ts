import { describe, it, expect } from 'vitest'
import { generatedProgramSchema } from '../generated-program'

function validProgram() {
  return {
    name: 'Offseason Strength',
    description: 'Generated from uploaded brief',
    workouts: [
      {
        name: 'Lower Body A',
        dayIndex: 0,
        weekIndex: 0,
        blocks: [
          {
            type: 'NORMAL',
            orderIndex: 0,
            exercises: [
              { exerciseId: 'ex1', exerciseName: 'Squat', orderIndex: 0, sets: 4, reps: '8' },
            ],
          },
        ],
      },
    ],
  }
}

describe('generatedProgramSchema', () => {
  it('accepts a well-formed generated program', () => {
    const result = generatedProgramSchema.safeParse(validProgram())
    expect(result.success).toBe(true)
  })

  it('rejects a program with no workouts', () => {
    const input = { ...validProgram(), workouts: [] }
    const result = generatedProgramSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects a workout with no blocks', () => {
    const input = validProgram()
    input.workouts[0].blocks = []
    const result = generatedProgramSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects a block with no exercises', () => {
    const input = validProgram()
    input.workouts[0].blocks[0].exercises = []
    const result = generatedProgramSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects an exercise with a null exerciseId (unresolved flag slipped through)', () => {
    const input: any = validProgram()
    input.workouts[0].blocks[0].exercises[0].exerciseId = null
    const result = generatedProgramSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects an exercise with zero sets', () => {
    const input = validProgram()
    input.workouts[0].blocks[0].exercises[0].sets = 0
    const result = generatedProgramSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects a program with no name', () => {
    const input = { ...validProgram(), name: '' }
    const result = generatedProgramSchema.safeParse(input)
    expect(result.success).toBe(false)
  })
})
