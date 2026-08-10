import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock prisma before importing the service
vi.mock('@/lib/prisma', () => ({
  prisma: {
    exercise: {
      findMany: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
  },
}))

vi.mock('@/lib/utils/video', () => ({
  buildYouTubeSearchUrl: vi.fn((name: string) => `https://youtube.com/search?q=${name}`),
  extractYouTubeId: vi.fn(() => null),
  getYouTubeThumbnail: vi.fn(() => null),
}))

import { prisma } from '@/lib/prisma'
import {
  getExercises,
  getExercisesForPicker,
  toggleExercisePublic,
  cloneExerciseToOrganization,
  createExercise,
  updateExercise,
} from '../exercise.service'

const mockFindMany = vi.mocked(prisma.exercise.findMany)
const mockUpdate = vi.mocked(prisma.exercise.update)
const mockCreate = vi.mocked(prisma.exercise.create)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getExercisesForPicker', () => {
  const universalEx = {
    id: '1', name: 'Squat', source: 'UNIVERSAL', organizationId: null,
    isPublic: true, bodyRegion: 'LOWER_BODY', difficultyLevel: 'BEGINNER',
    defaultReps: 10, musclesTargeted: [], description: null,
    videoUrl: null, videoProvider: null, exercisePhases: [],
  }
  const publicOrganizationEx = {
    id: '2', name: 'Band Pull', source: 'ORGANIZATION', organizationId: 'org_other',
    isPublic: true, bodyRegion: 'UPPER_BODY', difficultyLevel: 'BEGINNER',
    defaultReps: 12, musclesTargeted: [], description: null,
    videoUrl: null, videoProvider: null, exercisePhases: [],
  }
  const privateOrganizationEx = {
    id: '3', name: 'Custom Hold', source: 'ORGANIZATION', organizationId: 'org_mine',
    isPublic: false, bodyRegion: 'CORE', difficultyLevel: 'INTERMEDIATE',
    defaultReps: null, musclesTargeted: [], description: null,
    videoUrl: null, videoProvider: null, exercisePhases: [],
  }

  it('returns all exercises for the calling organization (universal + public + own private)', async () => {
    mockFindMany.mockResolvedValue([universalEx, publicOrganizationEx, privateOrganizationEx] as any)
    const result = await getExercisesForPicker('org_mine')
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isActive: true,
          OR: expect.arrayContaining([
            { source: 'UNIVERSAL' },
            { source: 'ORGANIZATION', isPublic: true },
            { source: 'ORGANIZATION', organizationId: 'org_mine' },
          ]),
        }),
      })
    )
    expect(result).toHaveLength(3)
  })

  it('works without an organizationId (falls back to universal + public only)', async () => {
    mockFindMany.mockResolvedValue([universalEx, publicOrganizationEx] as any)
    await getExercisesForPicker()
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { source: 'UNIVERSAL' },
            { source: 'ORGANIZATION', isPublic: true },
          ]),
        }),
      })
    )
  })
})

describe('toggleExercisePublic', () => {
  it('flips isPublic from true to false', async () => {
    mockUpdate.mockResolvedValue({ id: '3', isPublic: false } as any)
    await toggleExercisePublic('3', false)
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: '3' },
      data: { isPublic: false },
    })
  })
})

describe('getExercises', () => {
  it('filters to UNIVERSAL exercises only when source is UNIVERSAL', async () => {
    mockFindMany.mockResolvedValue([] as any)
    await getExercises({ source: 'UNIVERSAL' as any })
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ source: 'UNIVERSAL' }),
      })
    )
  })

  it('filters to ORGANIZATION + organizationId when both provided', async () => {
    mockFindMany.mockResolvedValue([] as any)
    await getExercises({ source: 'ORGANIZATION' as any, organizationId: 'org_abc' })
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ source: 'ORGANIZATION', organizationId: 'org_abc' }),
      })
    )
  })

  it('returns no results when source is ORGANIZATION but no orgId (sentinel prevents fallthrough)', async () => {
    mockFindMany.mockResolvedValue([] as any)
    await getExercises({ source: 'ORGANIZATION' as any })
    const call = mockFindMany.mock.calls[0][0] as any
    // Must still filter by source=ORGANIZATION so the query never falls through to returning all exercises
    expect(call.where).toHaveProperty('source', 'ORGANIZATION')
    // organizationId sentinel ensures no real exercise matches
    expect(call.where).toHaveProperty('organizationId')
  })
})

describe('getExercises body region filtering', () => {
  it('matches exercises with any of the requested body regions (hasSome)', async () => {
    mockFindMany.mockResolvedValue([] as any)
    await getExercises({ bodyRegions: ['UPPER_BODY', 'CORE'] as any })
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          bodyRegion: { hasSome: ['UPPER_BODY', 'CORE'] },
        }),
      })
    )
  })

  it('omits the body region clause entirely when none are requested', async () => {
    mockFindMany.mockResolvedValue([] as any)
    await getExercises({})
    const call = mockFindMany.mock.calls[0][0] as any
    expect(call.where).not.toHaveProperty('bodyRegion')
  })
})

describe('getExercises phase filtering', () => {
  it('matches exercises with any of the requested phases (hasSome)', async () => {
    mockFindMany.mockResolvedValue([] as any)
    await getExercises({ exercisePhases: ['MOBILITY', 'STRENGTHENING'] as any })
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          exercisePhases: { hasSome: ['MOBILITY', 'STRENGTHENING'] },
        }),
      })
    )
  })

  it('omits the phase clause entirely when no phases are requested', async () => {
    mockFindMany.mockResolvedValue([] as any)
    await getExercises({})
    const call = mockFindMany.mock.calls[0][0] as any
    expect(call.where).not.toHaveProperty('exercisePhases')
  })
})

describe('getExercises muscle group filtering', () => {
  it('matches exercises with any of the requested muscle strings (hasSome)', async () => {
    mockFindMany.mockResolvedValue([] as any)
    await getExercises({ muscleGroups: ['hamstrings', 'Hamstrings', 'biceps femoris'] })
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          musclesTargeted: { hasSome: ['hamstrings', 'Hamstrings', 'biceps femoris'] },
        }),
      })
    )
  })

  it('omits the muscle clause entirely when none are requested', async () => {
    mockFindMany.mockResolvedValue([] as any)
    await getExercises({})
    const call = mockFindMany.mock.calls[0][0] as any
    expect(call.where).not.toHaveProperty('musclesTargeted')
  })

  it('omits the muscle clause when an empty array is passed', async () => {
    mockFindMany.mockResolvedValue([] as any)
    await getExercises({ muscleGroups: [] })
    const call = mockFindMany.mock.calls[0][0] as any
    expect(call.where).not.toHaveProperty('musclesTargeted')
  })
})

describe('getExercises isAssessment filtering', () => {
  it('defaults to training exercises (isAssessment: false) when not specified', async () => {
    mockFindMany.mockResolvedValue([] as any)
    await getExercises({})
    const call = mockFindMany.mock.calls[0][0] as any
    expect(call.where).toHaveProperty('isAssessment', false)
  })

  it('filters to assessment exercises when isAssessment: true is requested', async () => {
    mockFindMany.mockResolvedValue([] as any)
    await getExercises({ isAssessment: true })
    const call = mockFindMany.mock.calls[0][0] as any
    expect(call.where).toHaveProperty('isAssessment', true)
  })
})

describe('getExercisesForPicker excludes assessment exercises', () => {
  it('always filters isAssessment: false', async () => {
    mockFindMany.mockResolvedValue([] as any)
    await getExercisesForPicker('org_mine')
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isAssessment: false }),
      })
    )
  })
})

describe('createExercise', () => {
  it('persists isAssessment when provided', async () => {
    mockCreate.mockResolvedValue({ id: 'ex_new' } as any)
    await createExercise({
      name: 'Single-Leg Squat Test',
      bodyRegion: ['LOWER_BODY'] as any,
      equipmentRequired: [],
      difficultyLevel: 'INTERMEDIATE' as any,
      contraindications: [],
      createdById: 'user_1',
      isAssessment: true,
    })
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isAssessment: true }) })
    )
  })

  it('defaults isAssessment to false when not provided', async () => {
    mockCreate.mockResolvedValue({ id: 'ex_new' } as any)
    await createExercise({
      name: 'Squat',
      bodyRegion: ['LOWER_BODY'] as any,
      equipmentRequired: [],
      difficultyLevel: 'BEGINNER' as any,
      contraindications: [],
      createdById: 'user_1',
    })
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isAssessment: false }) })
    )
  })
})

describe('updateExercise', () => {
  it('persists an isAssessment change', async () => {
    mockUpdate.mockResolvedValue({ id: 'ex_1', isAssessment: true } as any)
    await updateExercise('ex_1', { isAssessment: true })
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'ex_1' },
      data: { isAssessment: true },
    })
  })
})

describe('cloneExerciseToOrganization', () => {
  const universalSource = {
    name: 'Squat',
    description: 'A squat',
    bodyRegion: ['LOWER_BODY'],
    equipmentRequired: ['None'],
    difficultyLevel: 'BEGINNER',
    contraindications: ['knee pain'],
    videoUrl: 'https://youtube.com/watch?v=abc',
    videoProvider: 'youtube',
    imageUrl: 'https://img/abc.jpg',
    instructions: 'Bend knees',
    musclesTargeted: ['quadriceps', 'glutes'],
    exercisePhases: ['STRENGTHENING'],
    commonMistakes: 'Knees cave in',
    defaultSets: 3,
    defaultReps: 10,
    defaultHoldSeconds: null,
    indicationTags: ['knee'],
    rehabStage: 'LATE_REHAB',
  } as any

  it('creates an ORGANIZATION-scoped private copy carrying over descriptive fields', async () => {
    mockCreate.mockResolvedValue({ id: 'new', name: 'Squat' } as any)
    await cloneExerciseToOrganization(universalSource, {
      organizationId: 'org_mine',
      createdById: 'user_1',
    })

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Squat',
        description: 'A squat',
        bodyRegion: ['LOWER_BODY'],
        equipmentRequired: ['None'],
        difficultyLevel: 'BEGINNER',
        contraindications: ['knee pain'],
        musclesTargeted: ['quadriceps', 'glutes'],
        exercisePhases: ['STRENGTHENING'],
        indicationTags: ['knee'],
        rehabStage: 'LATE_REHAB',
        source: 'ORGANIZATION',
        organizationId: 'org_mine',
        isPublic: false,
        createdById: 'user_1',
      }),
    })
  })

  it('never copies the source id or source flag (always ORGANIZATION)', async () => {
    mockCreate.mockResolvedValue({ id: 'new' } as any)
    await cloneExerciseToOrganization(
      { ...universalSource, source: 'UNIVERSAL', id: 'src_1' },
      { organizationId: 'org_mine', createdById: 'user_1' }
    )
    const call = mockCreate.mock.calls[0][0] as any
    expect(call.data).not.toHaveProperty('id')
    expect(call.data.source).toBe('ORGANIZATION')
  })
})
