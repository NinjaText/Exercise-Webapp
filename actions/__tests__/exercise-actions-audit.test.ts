import { describe, it, expect, vi, beforeEach } from 'vitest'

const trainer = { id: 'trainer_1', role: 'TRAINER', clerkOrgId: 'org_1', firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' }

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn().mockResolvedValue({ userId: 'clerk_1', orgId: 'org_1' }) }))
vi.mock('@/lib/current-user', () => ({ isSuperAdmin: vi.fn().mockResolvedValue(false) }))
vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique: vi.fn() }, exercise: { findUnique: vi.fn() } },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/services/exercise.service', () => ({
  createExercise: vi.fn().mockResolvedValue({ id: 'ex_1', name: 'Squat' }),
  updateExercise: vi.fn().mockResolvedValue({ id: 'ex_1', name: 'Squat Updated' }),
  deleteExercise: vi.fn().mockResolvedValue({}),
}))
vi.mock('@/lib/validators/exercise', () => ({
  createExerciseSchema: { safeParse: (v: unknown) => ({ success: true, data: v }) },
  updateExerciseSchema: { safeParse: (v: unknown) => ({ success: true, data: v }) },
}))
vi.mock('@/lib/services/audit-log.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/audit-log.service')>()
  return {
    ...actual,
    logAudit: vi.fn(),
    deriveActorType: vi.fn(() => 'TRAINER'),
    AUDIT_ACTIONS: { EXERCISE_CREATED: 'EXERCISE_CREATED', EXERCISE_UPDATED: 'EXERCISE_UPDATED', EXERCISE_DELETED: 'EXERCISE_DELETED' },
  }
})

import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/services/audit-log.service'
import { createExerciseAction, updateExerciseAction, deleteExerciseAction } from '../exercise-actions'

const mockUserFindUnique = vi.mocked(prisma.user.findUnique)
const mockExerciseFindUnique = vi.mocked(prisma.exercise.findUnique)
const mockLogAudit = vi.mocked(logAudit)

beforeEach(() => {
  vi.clearAllMocks()
  mockUserFindUnique.mockResolvedValue(trainer as never)
})

it('logs EXERCISE_CREATED', async () => {
  await createExerciseAction({ name: 'Squat', bodyRegion: ['LOWER_BODY'], equipmentRequired: [], difficultyLevel: 'BEGINNER', contraindications: [] } as never)
  expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'EXERCISE_CREATED', targetId: 'ex_1' }))
})

it('logs EXERCISE_UPDATED with a diff', async () => {
  mockExerciseFindUnique.mockResolvedValue({ name: 'Squat', bodyRegion: ['LOWER_BODY'], difficultyLevel: 'BEGINNER', isPublic: true, source: 'ORGANIZATION', organizationId: 'org_1' } as never)
  await updateExerciseAction('ex_1', { name: 'Squat Updated' })
  const call = mockLogAudit.mock.calls[0][0]
  expect(call.action).toBe('EXERCISE_UPDATED')
  expect(call.metadata).toEqual({ before: { name: 'Squat' }, after: { name: 'Squat Updated' } })
})

it('logs EXERCISE_UPDATED with a bodyRegion diff when regions actually change', async () => {
  mockExerciseFindUnique.mockResolvedValue({ name: 'Squat', bodyRegion: ['LOWER_BODY'], difficultyLevel: 'BEGINNER', isPublic: true, source: 'ORGANIZATION', organizationId: 'org_1' } as never)
  await updateExerciseAction('ex_1', { bodyRegion: ['LOWER_BODY', 'CORE'] } as never)
  const call = mockLogAudit.mock.calls[0][0]
  expect(call.action).toBe('EXERCISE_UPDATED')
  expect(call.metadata).toEqual({ before: { bodyRegion: ['LOWER_BODY'] }, after: { bodyRegion: ['LOWER_BODY', 'CORE'] } })
})

it('does not log a bodyRegion diff when the array is merely reordered', async () => {
  mockExerciseFindUnique.mockResolvedValue({ name: 'Squat', bodyRegion: ['LOWER_BODY', 'CORE'], difficultyLevel: 'BEGINNER', isPublic: true, source: 'ORGANIZATION', organizationId: 'org_1' } as never)
  await updateExerciseAction('ex_1', { bodyRegion: ['CORE', 'LOWER_BODY'] } as never)
  const call = mockLogAudit.mock.calls[0][0]
  expect(call.action).toBe('EXERCISE_UPDATED')
  expect(call.metadata).toBeUndefined()
})

it('logs EXERCISE_DELETED', async () => {
  mockExerciseFindUnique.mockResolvedValue({ id: 'ex_1', name: 'Squat', source: 'ORGANIZATION', organizationId: 'org_1' } as never)
  await deleteExerciseAction('ex_1')
  expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'EXERCISE_DELETED' }))
})
