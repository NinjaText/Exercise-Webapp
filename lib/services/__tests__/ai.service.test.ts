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

import { resolveExerciseMatch, buildProgramPreviewFromBlueprint } from '../ai.service'
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

describe('resolveExerciseMatch', () => {
  it('auto-accepts an exact match with no candidates list and no AI call', () => {
    const squat = exercise({ name: 'Squat' })
    const result = resolveExerciseMatch('Squat', [squat])
    expect(result).toEqual({ exerciseId: 'ex1', matchType: 'exact', candidates: [] })
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('auto-accepts case/punctuation-insensitive exact matches', () => {
    const squat = exercise({ name: 'Back Squat' })
    const result = resolveExerciseMatch('back-squat', [squat])
    expect(result).toEqual({ exerciseId: 'ex1', matchType: 'exact', candidates: [] })
  })

  it('auto-accepts a substring match (score 0.9) as exact', () => {
    const squat = exercise({ id: 'ex9', name: 'Barbell Back Squat' })
    const result = resolveExerciseMatch('Back Squat', [squat])
    expect(result.matchType).toBe('exact')
    expect(result.exerciseId).toBe('ex9')
  })

  it('flags a partial token-overlap match as needs_review with candidates', () => {
    const row = exercise({ id: 'ex5', name: 'Bent Over Row' })
    const result = resolveExerciseMatch('Row', [row])
    expect(result.matchType).toBe('needs_review')
    expect(result.exerciseId).toBe('ex5')
    expect(result.candidates).toEqual([{ exerciseId: 'ex5', exerciseName: 'Bent Over Row', score: expect.any(Number) }])
  })

  it('flags no-overlap names as not_in_library with top candidates, exerciseId null', () => {
    const squat = exercise({ id: 'ex1', name: 'Squat' })
    const result = resolveExerciseMatch('Nordic Hamstring Curl', [squat])
    expect(result.matchType).toBe('not_in_library')
    expect(result.exerciseId).toBeNull()
    expect(result.candidates).toHaveLength(1)
  })

  it('returns not_in_library with empty candidates when the library is empty', () => {
    const result = resolveExerciseMatch('Nonexistent Move', [])
    expect(result).toEqual({ exerciseId: null, matchType: 'not_in_library', candidates: [] })
  })

  it('never calls the AI client', () => {
    const bandPull = exercise({ id: 'ex2', name: 'Band Pull Apart' })
    resolveExerciseMatch('Pull Apart Band', [bandPull])
    expect(mockCreate).not.toHaveBeenCalled()
  })
})

describe('buildProgramPreviewFromBlueprint', () => {
  it('auto-accepts an exact match with no flags, no AI call', async () => {
    const squat = exercise({ id: 'sq1', name: 'Back Squat', defaultSets: 4, defaultReps: 8 })
    vi.mocked(prisma.exercise.findMany).mockResolvedValue([squat])

    const result = await buildProgramPreviewFromBlueprint({
      circuits: [{ name: 'Strength Block A', focusType: 'LOWER_BODY', exerciseCount: 1 }],
      preferredWeekdays: ['Monday'],
      programTitle: 'Test Program',
      sessionBlueprint: [
        {
          dayIndex: 0,
          weekIndex: 0,
          title: 'Lower Body A',
          blocks: [{ name: 'Strength Block A', exercises: [{ name: 'Back Squat', sets: 4, reps: 8 }] }],
        },
      ],
    })

    expect(mockCreate).not.toHaveBeenCalled()
    const ex = result.workouts[0].blocks[0].exercises[0]
    expect(ex.exerciseId).toBe('sq1')
    expect(ex.flags).toEqual([])
  })

  it('flags an unmatched exercise as not_in_library with a null exerciseId instead of dropping it', async () => {
    vi.mocked(prisma.exercise.findMany).mockResolvedValue([])

    const result = await buildProgramPreviewFromBlueprint({
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
    })

    expect(result.workouts).toHaveLength(1)
    const ex = result.workouts[0].blocks[0].exercises[0]
    expect(ex.exerciseId).toBeNull()
    expect(ex.flags).toEqual(['not_in_library'])
  })

  it('adds a not_in_document flag alongside a library flag when the exercise is untraceable', async () => {
    const squat = exercise({ id: 'sq1', name: 'Squat' })
    vi.mocked(prisma.exercise.findMany).mockResolvedValue([squat])

    const result = await buildProgramPreviewFromBlueprint({
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
              exercises: [{ name: 'Nordic Hamstring Curl', traceableInDocument: false } as any],
            },
          ],
        },
      ],
    })

    const ex = result.workouts[0].blocks[0].exercises[0]
    expect(ex.flags).toContain('not_in_document')
  })
})
