import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetOrganizationList = vi.fn()
vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: vi.fn(async () => ({
    organizations: { getOrganizationList: mockGetOrganizationList },
  })),
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    exercise: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
  },
}))

import { prisma } from '@/lib/prisma'
import { listClerkOrganizations, getAllExercises } from '../admin.service'

const mockFindMany = vi.mocked(prisma.exercise.findMany)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('listClerkOrganizations', () => {
  it('maps Clerk organizations to id/name pairs, requesting up to 100', async () => {
    mockGetOrganizationList.mockResolvedValue({
      data: [
        { id: 'org_1', name: 'Riverside Clinic' },
        { id: 'org_2', name: 'Downtown PT' },
      ],
      totalCount: 2,
    })

    const result = await listClerkOrganizations()

    expect(mockGetOrganizationList).toHaveBeenCalledWith({ limit: 100 })
    expect(result).toEqual([
      { id: 'org_1', name: 'Riverside Clinic' },
      { id: 'org_2', name: 'Downtown PT' },
    ])
  })
})

describe('getAllExercises body region filtering', () => {
  it('matches exercises with any of the requested body regions (hasSome)', async () => {
    await getAllExercises({ bodyRegions: ['UPPER_BODY', 'CORE'] })
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          bodyRegion: { hasSome: ['UPPER_BODY', 'CORE'] },
        }),
      })
    )
  })

  it('omits the body region clause when no regions are requested', async () => {
    await getAllExercises({})
    const call = mockFindMany.mock.calls[0][0] as any
    expect(call.where).not.toHaveProperty('bodyRegion')
  })
})
