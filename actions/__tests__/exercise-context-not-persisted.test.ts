import { describe, it, expect, vi, beforeEach } from 'vitest'

const trainer = { id: 'trainer_1', role: 'TRAINER', clerkOrgId: 'org_1' }

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn().mockResolvedValue({ userId: 'clerk_1', orgId: 'org_1' }) }))
vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique: vi.fn() } },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/services/exercise.service', () => ({
  createExercise: vi.fn().mockResolvedValue({ id: 'ex_1', name: 'Squat' }),
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

it('never forwards a rehab/performance context field to the Exercise service', async () => {
  await createOrganizationExerciseAction({
    name: 'Squat',
    bodyRegion: ['LOWER_BODY'],
    difficultyLevel: 'BEGINNER',
    // @ts-expect-error — aiContext is not part of the accepted input type
    aiContext: 'CLINICAL',
  })

  const passedData = mockCreateExercise.mock.calls[0][0]
  expect(passedData).not.toHaveProperty('aiContext')
  expect(passedData).not.toHaveProperty('context')
  expect(passedData).not.toHaveProperty('rehabPerformance')
})
