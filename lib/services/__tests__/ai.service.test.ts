import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }))
vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = { completions: { create: mockCreate } }
  },
}))
vi.mock('@/lib/prisma', () => ({
  prisma: { exercise: { findMany: vi.fn() }, user: { findUnique: vi.fn() } },
}))
vi.mock('@/lib/ai/utils/exercise-pool', () => ({
  filterByEquipment: vi.fn((pool: unknown[]) => pool),
}))

import { resolveExerciseByName, generateWorkoutPlan } from '../ai.service'
import { prisma } from '@/lib/prisma'

function exercise(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ex1',
    name: 'Squat',
    bodyRegion: ['LOWER_BODY'],
    difficultyLevel: 'BEGINNER',
    equipmentRequired: [],
    contraindications: [],
    description: null,
    musclesTargeted: [],
    exercisePhases: [],
    commonMistakes: null,
    defaultSets: 3,
    defaultReps: 10,
    defaultHoldSeconds: null,
    cuesThumbnail: null,
    videoUrl: null,
    isActive: true,
    ...overrides,
  } as any
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('resolveExerciseByName', () => {
  it('returns an exact match without calling AI', async () => {
    const squat = exercise({ name: 'Squat' })
    const result = await resolveExerciseByName('Squat', [squat])
    expect(result).toEqual({ exercise: squat, matchType: 'exact' })
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('matches case/punctuation-insensitively as exact', async () => {
    const squat = exercise({ name: 'Back Squat' })
    const result = await resolveExerciseByName('back-squat', [squat])
    expect(result).toEqual({ exercise: squat, matchType: 'exact' })
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('falls back to AI-assisted fuzzy match when no exact match exists', async () => {
    const bandPull = exercise({ id: 'ex2', name: 'Band Pull Apart' })
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ bestName: 'Band Pull Apart' }) } }],
    })
    const result = await resolveExerciseByName('Pull Apart Band', [bandPull])
    expect(result).toEqual({ exercise: bandPull, matchType: 'fuzzy' })
    expect(mockCreate).toHaveBeenCalledTimes(1)
  })

  it('returns none when the candidate list is empty', async () => {
    const result = await resolveExerciseByName('Nonexistent Move', [])
    expect(result).toEqual({ exercise: null, matchType: 'none' })
    expect(mockCreate).not.toHaveBeenCalled()
  })
})

describe('generateWorkoutPlan (sessionBlueprint path)', () => {
  it('resolves exercises directly from sessionBlueprint via a fuzzy match without warning (fuzzy matches are silent — only true non-matches are flagged)', async () => {
    const squat = exercise({ id: 'sq1', name: 'Back Squat', defaultSets: 4, defaultReps: 8 })
    vi.mocked(prisma.exercise.findMany).mockResolvedValue([squat])
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ bestName: 'Back Squat' }) } }],
    })

    const result = await generateWorkoutPlan({
      durationMinutes: 60,
      daysPerWeek: 1,
      difficultyLevel: 'INTERMEDIATE',
      circuits: [{ name: 'Strength Block A', focusType: 'LOWER_BODY', exerciseCount: 1 }],
      preferredWeekdays: ['Monday'],
      sessionBlueprint: [
        {
          dayIndex: 0,
          weekIndex: 0,
          title: 'Lower Body A',
          blocks: [
            {
              name: 'Strength Block A',
              exercises: [{ name: 'Squat', sets: 4, reps: 8 }],
            },
          ],
        },
      ],
    } as any)

    expect(result.exercises).toHaveLength(1)
    expect(result.exercises[0].exerciseId).toBe('sq1')
    expect(result.warnings).toEqual([])
  })

  it('reports a warning and skips the exercise when nothing matches', async () => {
    vi.mocked(prisma.exercise.findMany).mockResolvedValue([])

    const result = await generateWorkoutPlan({
      durationMinutes: 60,
      daysPerWeek: 1,
      difficultyLevel: 'INTERMEDIATE',
      circuits: [{ name: 'Strength Block A', focusType: 'LOWER_BODY', exerciseCount: 1 }],
      preferredWeekdays: ['Monday'],
      sessionBlueprint: [
        {
          dayIndex: 0,
          weekIndex: 0,
          title: 'Lower Body A',
          blocks: [{ name: 'Strength Block A', exercises: [{ name: 'Nonexistent Move' }] }],
        },
      ],
    } as any)

    expect(result.exercises).toHaveLength(0)
    expect(result.warnings).toEqual([
      '"Nonexistent Move" has no matching exercise in the library and was skipped from "Lower Body A".',
    ])
  })
})
