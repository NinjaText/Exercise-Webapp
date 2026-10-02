import { it, expect, vi, beforeEach } from 'vitest'

const trainer = { id: 'trainer_1', role: 'TRAINER', clerkOrgId: 'org_1' }

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn().mockResolvedValue({ userId: 'clerk_1', orgId: 'org_1' }) }))
vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique: vi.fn() } },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/services/exercise.service', () => ({
  createExercise: vi.fn().mockResolvedValue({ id: 'ex_1', name: 'Curl' }),
}))

import { prisma } from '@/lib/prisma'
import { createExercise } from '@/lib/services/exercise.service'
import { createOrganizationExerciseAction } from '../exercise-actions'

const mockUserFindUnique = vi.mocked(prisma.user.findUnique)
const mockCreateExercise = vi.mocked(createExercise)

beforeEach(() => {
  vi.clearAllMocks()
  mockUserFindUnique.mockResolvedValue(trainer as never)
})

it('saves the muscles chosen in the picker quick-create, trimmed and without blanks', async () => {
  await createOrganizationExerciseAction({
    name: 'Curl',
    musclesTargeted: [' Biceps ', '', 'brachialis'],
  })

  expect(mockCreateExercise.mock.calls[0][0].musclesTargeted).toEqual(['Biceps', 'brachialis'])
})

it('saves an empty muscle list when none are given', async () => {
  await createOrganizationExerciseAction({ name: 'Curl' })

  expect(mockCreateExercise.mock.calls[0][0].musclesTargeted).toEqual([])
})
