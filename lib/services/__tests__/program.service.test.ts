import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    program: {
      findMany: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    workout: { createMany: vi.fn() },
    workoutBlockV2: { createMany: vi.fn() },
    blockExerciseV2: { createMany: vi.fn() },
    exerciseSet: { createMany: vi.fn() },
  },
}))

import { prisma } from '@/lib/prisma'
import {
  getGlobalPrograms,
  assignGlobalProgramOrganizations,
  createProgram,
  createGlobalProgram,
  computeDurationWeeksFromWorkouts,
} from '../program.service'

const mockFindMany = vi.mocked(prisma.program.findMany)
const mockUpdate = vi.mocked(prisma.program.update)
const mockCreate = vi.mocked(prisma.program.create)
const mockFindUnique = vi.mocked(prisma.program.findUnique)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getGlobalPrograms', () => {
  it('queries without an organization filter when clerkOrgId is omitted', async () => {
    mockFindMany.mockResolvedValue([])

    await getGlobalPrograms()

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isGlobal: true, status: { not: 'ARCHIVED' } },
      })
    )
  })

  it('filters to universal-or-matching-org programs when clerkOrgId is provided', async () => {
    mockFindMany.mockResolvedValue([])

    await getGlobalPrograms('org_123')

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isGlobal: true,
          status: { not: 'ARCHIVED' },
          OR: [
            { organizationIds: { isEmpty: true } },
            { organizationIds: { has: 'org_123' } },
          ],
        },
      })
    )
  })
})

describe('assignGlobalProgramOrganizations', () => {
  it('updates organizationIds scoped to isGlobal true', async () => {
    mockUpdate.mockResolvedValue({ id: 'prog_1', organizationIds: ['org_1'] } as any)

    const result = await assignGlobalProgramOrganizations('prog_1', ['org_1'])

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'prog_1', isGlobal: true },
      data: { organizationIds: ['org_1'] },
    })
    expect(result).toEqual({ id: 'prog_1', organizationIds: ['org_1'] })
  })
})

describe('createProgram', () => {
  it('does not write organizationIds even if present in input', async () => {
    mockCreate.mockResolvedValue({ id: 'prog_1' } as any)
    // createProgram re-reads the program with its tree before returning
    mockFindUnique.mockResolvedValue({ id: 'prog_1' } as any)

    await createProgram('trainer_1', {
      name: 'Test',
      isTemplate: false,
      tags: [],
      equipmentRequired: [],
      organizationIds: ['org_1'],
      workouts: [],
    } as any)

    const callArg = mockCreate.mock.calls[0][0] as any
    expect(callArg.data).not.toHaveProperty('organizationIds')
  })
})

describe('createGlobalProgram', () => {
  it('passes organizationIds through to the Prisma create call', async () => {
    mockCreate.mockResolvedValue({ id: 'prog_2' } as any)

    await createGlobalProgram({
      name: 'Test',
      isTemplate: false,
      tags: [],
      equipmentRequired: [],
      organizationIds: ['org_1', 'org_2'],
      workouts: [],
    } as any)

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isGlobal: true,
          organizationIds: ['org_1', 'org_2'],
        }),
      })
    )
  })
})

describe('computeDurationWeeksFromWorkouts', () => {
  it('returns max weekIndex + 1 across all workouts', () => {
    const workouts = [{ weekIndex: 0 }, { weekIndex: 2 }, { weekIndex: 1 }] as any
    expect(computeDurationWeeksFromWorkouts(workouts)).toBe(3)
  })

  it('returns 1 for a single-week program', () => {
    const workouts = [{ weekIndex: 0 }, { weekIndex: 0 }] as any
    expect(computeDurationWeeksFromWorkouts(workouts)).toBe(1)
  })

  it('returns null for an empty workouts array', () => {
    expect(computeDurationWeeksFromWorkouts([])).toBeNull()
  })
})
