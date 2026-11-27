import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    organization: { findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
    exercise: { create: vi.fn(), findMany: vi.fn(async () => []) },
    $transaction: vi.fn(),
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { bulkCreateExercisesAction, checkBulkExerciseConflictsAction } from '../bulk-exercise-actions'

const mockAuth = vi.mocked(auth)
const mockUserFindUnique = vi.mocked(prisma.user.findUnique)
const mockTransaction = vi.mocked(prisma.$transaction)

const TRAINER_WITH_ORG = {
  id: 'trainer_1',
  role: 'TRAINER',
  clerkOrgId: 'org_abc123',
}

const TRAINER_NO_ORG = {
  id: 'trainer_2',
  role: 'TRAINER',
  clerkOrgId: null,
}

const EXERCISE = {
  name: 'Squat',
  bodyRegion: ['LOWER_BODY'],
  difficultyLevel: 'BEGINNER',
  musclesTargeted: [],
  equipmentRequired: [],
  contraindications: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth.mockResolvedValue({ userId: 'clerk_1' } as any)
  mockTransaction.mockImplementation(async (ops: unknown) => {
    const arr = ops as unknown[]
    return arr.map(() => ({ id: 'ex_1' }))
  })
})

describe('bulkCreateExercisesAction — org routing', () => {
  it('sets source ORGANIZATION and organizationId when trainer has clerkOrgId', async () => {
    mockUserFindUnique.mockResolvedValue(TRAINER_WITH_ORG as any)
    let capturedOps: ReturnType<typeof prisma.exercise.create>[] = []
    mockTransaction.mockImplementationOnce(async (ops: unknown) => {
      capturedOps = ops as ReturnType<typeof prisma.exercise.create>[]
      return [{ id: 'ex_1' }]
    })

    vi.mocked(prisma.exercise.create).mockImplementation((args: any) => args as any)

    await bulkCreateExercisesAction([EXERCISE])

    expect(prisma.exercise.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          source: 'ORGANIZATION',
          organizationId: 'org_abc123',
        }),
      })
    )
  })

  it('does not set organizationId when trainer has no clerkOrgId', async () => {
    mockUserFindUnique.mockResolvedValue(TRAINER_NO_ORG as any)
    vi.mocked(prisma.exercise.create).mockImplementation((args: any) => args as any)

    await bulkCreateExercisesAction([EXERCISE])

    expect(prisma.exercise.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({
          source: 'ORGANIZATION',
        }),
      })
    )
  })
})

describe('bulkCreateExercisesAction — bodyRegion', () => {
  it('passes the bodyRegion array through to Prisma without re-wrapping it', async () => {
    mockUserFindUnique.mockResolvedValue(TRAINER_NO_ORG as any)
    vi.mocked(prisma.exercise.create).mockImplementation((args: any) => args as any)

    await bulkCreateExercisesAction([{ ...EXERCISE, bodyRegion: ['LOWER_BODY', 'BALANCE'] }])

    expect(prisma.exercise.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ bodyRegion: ['LOWER_BODY', 'BALANCE'] }),
      })
    )
  })
})

describe('bulkCreateExercisesAction — isAssessment', () => {
  it('persists isAssessment: true when a row is flagged', async () => {
    mockUserFindUnique.mockResolvedValue(TRAINER_NO_ORG as any)
    vi.mocked(prisma.exercise.create).mockImplementation((args: any) => args as any)

    await bulkCreateExercisesAction([{ ...EXERCISE, isAssessment: true }])

    expect(prisma.exercise.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isAssessment: true }),
      })
    )
  })

  it('defaults isAssessment to false when a row omits it', async () => {
    mockUserFindUnique.mockResolvedValue(TRAINER_NO_ORG as any)
    vi.mocked(prisma.exercise.create).mockImplementation((args: any) => args as any)

    await bulkCreateExercisesAction([EXERCISE])

    expect(prisma.exercise.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isAssessment: false }),
      })
    )
  })
})

describe('bulk import duplicate detection', () => {
  const LIBRARY = [
    { id: 'ex_dead_bug', name: 'Dead Bug', videoUrl: 'https://youtu.be/abc123def45', source: 'UNIVERSAL', organizationId: null },
  ]

  beforeEach(() => {
    mockUserFindUnique.mockResolvedValue(TRAINER_NO_ORG as any)
    vi.mocked(prisma.exercise.findMany).mockResolvedValue(LIBRARY as any)
  })

  it('reports library and in-batch duplicates per row, keeping the first of a repeated pair', async () => {
    const result = await checkBulkExerciseConflictsAction([
      { name: 'Squat' },
      { name: 'dead bug' },
      { name: 'Lunge', videoUrl: 'https://www.youtube.com/watch?v=zzz999yyy88' },
      { name: 'Squat' },
      { name: 'Reverse Lunge', videoUrl: 'https://youtu.be/zzz999yyy88' },
    ])

    expect(result).toEqual({
      success: true,
      conflicts: [
        { index: 1, field: 'name', existingName: 'Dead Bug' },
        { index: 3, field: 'name', existingName: 'Squat', batchIndex: 0 },
        { index: 4, field: 'videoUrl', existingName: 'Lunge', batchIndex: 2 },
      ],
    })
  })

  it('rejects the publish with structured conflicts and creates nothing', async () => {
    const result = await bulkCreateExercisesAction([EXERCISE, { ...EXERCISE, name: 'Dead Bug' }])

    expect(result.success).toBe(false)
    expect(result).toMatchObject({
      error: expect.stringContaining('1 duplicate exercise'),
      conflicts: [{ index: 1, field: 'name', existingName: 'Dead Bug' }],
    })
    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it('refuses the check for non-trainers', async () => {
    mockUserFindUnique.mockResolvedValue({ ...TRAINER_NO_ORG, role: 'CLIENT' } as any)
    expect(await checkBulkExerciseConflictsAction([{ name: 'Squat' }])).toEqual({ success: false, error: 'Forbidden' })
  })
})
