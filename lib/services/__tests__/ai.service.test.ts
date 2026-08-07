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

import { resolveExerciseByName, resolveExerciseMatch, generateWorkoutPlan, buildProgramPreviewFromBlueprint } from '../ai.service'
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
