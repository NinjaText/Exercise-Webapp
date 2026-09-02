import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    exercise: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { bulkCreateExercisesAction } from '../bulk-exercise-actions'

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
