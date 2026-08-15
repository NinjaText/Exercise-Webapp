import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    program: {
      findMany: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    coachPackage: { findFirst: vi.fn() },
    workout: { createMany: vi.fn() },
    workoutBlockV2: { createMany: vi.fn() },
    blockExerciseV2: { createMany: vi.fn() },
    exerciseSet: { createMany: vi.fn() },
  },
}))

import { prisma } from '@/lib/prisma'
import {
  getGlobalPrograms,
  getPrograms,
  assignGlobalProgramOrganizations,
  createProgram,
  createGlobalProgram,
  computeDurationWeeksFromWorkouts,
  hardDeleteProgram,
  deleteClientProgram,
  toggleProgramPublic,
  copyGlobalProgramToOrganization,
} from '../program.service'

const mockFindMany = vi.mocked(prisma.program.findMany)
const mockUpdate = vi.mocked(prisma.program.update)
const mockCreate = vi.mocked(prisma.program.create)
const mockFindUnique = vi.mocked(prisma.program.findUnique)
const mockDelete = vi.mocked(prisma.program.delete)
const mockPackageFindFirst = vi.mocked(prisma.coachPackage.findFirst)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getPrograms', () => {
  it('filters to programs with a client attached when hasClient is true (the "Assigned" tab)', async () => {
    mockFindMany.mockResolvedValue([])

    await getPrograms('trainer_1', { hasClient: true })

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ trainerId: 'trainer_1', clientId: { not: null } }),
      })
    )
  })

  it('filters to programs with no client attached when hasClient is false (the "Library" tab)', async () => {
    mockFindMany.mockResolvedValue([])

    await getPrograms('trainer_1', { hasClient: false })

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ trainerId: 'trainer_1', clientId: null }),
      })
    )
  })

  it('omits the clientId filter entirely when hasClient is not specified', async () => {
    mockFindMany.mockResolvedValue([])

    await getPrograms('trainer_1', {})

    const where = mockFindMany.mock.calls[0][0]?.where as Record<string, unknown>
    expect(where).not.toHaveProperty('clientId')
  })
})

describe('getGlobalPrograms', () => {
  it('queries admin-curated OR trainer-published-public programs when clerkOrgId is omitted', async () => {
    mockFindMany.mockResolvedValue([])

    await getGlobalPrograms()

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: { not: 'ARCHIVED' },
          OR: [{ isGlobal: true }, { isPublic: true }],
        },
      })
    )
  })

  it('scopes the admin-curated branch to universal-or-matching-org when clerkOrgId is provided, leaving the public-trainer-program branch unscoped', async () => {
    mockFindMany.mockResolvedValue([])

    await getGlobalPrograms('org_123')

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: { not: 'ARCHIVED' },
          OR: [
            {
              isGlobal: true,
              OR: [
                { organizationIds: { isEmpty: true } },
                { organizationIds: { has: 'org_123' } },
              ],
            },
            { isPublic: true },
          ],
        },
      })
    )
  })
})

describe('toggleProgramPublic', () => {
  it('flips isPublic on a template program with no client attached', async () => {
    mockUpdate.mockResolvedValue({ id: 'prog_1', isPublic: true } as any)

    await toggleProgramPublic('prog_1', true)

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'prog_1', isTemplate: true, clientId: null },
      data: { isPublic: true },
    })
  })
})

describe('getGlobalPrograms excluding the viewing trainer\'s own public programs', () => {
  it('excludes the viewing trainer from the public-trainer-program branch when excludeTrainerId is provided', async () => {
    mockFindMany.mockResolvedValue([])

    await getGlobalPrograms(undefined, 'trainer_1')

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: { not: 'ARCHIVED' },
          OR: [
            { isGlobal: true },
            { isPublic: true, trainerId: { not: 'trainer_1' } },
          ],
        },
      })
    )
  })

  it('does not filter by trainerId in the public branch when excludeTrainerId is omitted', async () => {
    mockFindMany.mockResolvedValue([])

    await getGlobalPrograms()

    const call = mockFindMany.mock.calls[0][0] as any
    const publicBranch = call.where.OR.find((clause: any) => 'isPublic' in clause)
    expect(publicBranch).not.toHaveProperty('trainerId')
  })
})

describe('copyGlobalProgramToOrganization', () => {
  it('copies a trainer-published public program even when it is not isGlobal', async () => {
    const source = {
      id: 'prog_pub', isGlobal: false, isPublic: true, name: 'Public Template', workouts: [],
    }
    // getProgramById is called once by copyGlobalProgramToOrganization and again
    // by duplicateProgram, then createProgram re-fetches the newly created copy.
    mockFindUnique
      .mockResolvedValueOnce(source as any)
      .mockResolvedValueOnce(source as any)
      .mockResolvedValueOnce({ id: 'copy_1' } as any)
    mockCreate.mockResolvedValue({ id: 'copy_1' } as any)

    const result = await copyGlobalProgramToOrganization('prog_pub', 'trainer_2')

    expect(result).toEqual(expect.objectContaining({ id: 'copy_1' }))
  })

  it('throws when the source program is neither global nor public', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'prog_x', isGlobal: false, isPublic: false, name: 'Private', workouts: [],
    } as any)

    await expect(copyGlobalProgramToOrganization('prog_x', 'trainer_2')).rejects.toThrow(
      'Program is not available to copy'
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

describe('hardDeleteProgram', () => {
  it('throws when the program does not exist', async () => {
    mockFindUnique.mockResolvedValue(null)

    await expect(hardDeleteProgram('prog_1')).rejects.toThrow('Program not found')
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('refuses to delete a program that is not archived', async () => {
    mockFindUnique.mockResolvedValue({ status: 'ACTIVE' } as any)

    await expect(hardDeleteProgram('prog_1')).rejects.toThrow(
      'only archived programs can be permanently deleted'
    )
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('refuses to delete a program linked to a sellable package', async () => {
    mockFindUnique.mockResolvedValue({ status: 'ARCHIVED' } as any)
    mockPackageFindFirst.mockResolvedValue({ id: 'pkg_1' } as any)

    await expect(hardDeleteProgram('prog_1')).rejects.toThrow(
      'linked to a sellable package'
    )
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('deletes an archived, unlinked program', async () => {
    mockFindUnique.mockResolvedValue({ status: 'ARCHIVED' } as any)
    mockPackageFindFirst.mockResolvedValue(null)
    mockDelete.mockResolvedValue({ id: 'prog_1' } as any)

    const result = await hardDeleteProgram('prog_1')

    expect(mockPackageFindFirst).toHaveBeenCalledWith({
      where: { programTemplateId: 'prog_1' },
      select: { id: true },
    })
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: 'prog_1' } })
    expect(result).toEqual({ id: 'prog_1' })
  })
})

describe('deleteClientProgram', () => {
  it('throws when the program does not exist', async () => {
    mockFindUnique.mockResolvedValue(null)

    await expect(deleteClientProgram('prog_1')).rejects.toThrow('Program not found')
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('refuses to delete a program with no client attached', async () => {
    mockFindUnique.mockResolvedValue({ clientId: null } as any)

    await expect(deleteClientProgram('prog_1')).rejects.toThrow(
      'this program is not assigned to a client'
    )
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('refuses to delete a program linked to a sellable package', async () => {
    mockFindUnique.mockResolvedValue({ clientId: 'client_1' } as any)
    mockPackageFindFirst.mockResolvedValue({ id: 'pkg_1' } as any)

    await expect(deleteClientProgram('prog_1')).rejects.toThrow(
      'linked to a sellable package'
    )
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('deletes an assigned, unlinked program without requiring it to be archived first', async () => {
    mockFindUnique.mockResolvedValue({ clientId: 'client_1', status: 'ACTIVE' } as any)
    mockPackageFindFirst.mockResolvedValue(null)
    mockDelete.mockResolvedValue({ id: 'prog_1' } as any)

    const result = await deleteClientProgram('prog_1')

    expect(mockDelete).toHaveBeenCalledWith({ where: { id: 'prog_1' } })
    expect(result).toEqual({ id: 'prog_1' })
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
