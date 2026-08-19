import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/current-user', () => ({ getCurrentUser: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: { workoutPlan: { create: vi.fn() } },
}))
vi.mock('@/lib/services/ai.service', () => ({ generateWorkoutPlan: vi.fn() }))
vi.mock('@/lib/services/client.service', () => ({ getClientIdsForTrainer: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { getCurrentUser } from '@/lib/current-user'
import { prisma } from '@/lib/prisma'
import { saveAiTemplateAction } from '../workout-actions'

const mockGetCurrentUser = vi.mocked(getCurrentUser)
const mockPlanCreate = vi.mocked(prisma.workoutPlan.create)

const trainer = { id: 'trainer_1', role: 'TRAINER' }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('saveAiTemplateAction', () => {
  it('propagates when the caller is unauthenticated (getCurrentUser redirects/throws)', async () => {
    // getCurrentUser() calls Next.js redirect() internally for an unauthenticated
    // caller — this must never be swallowed by a try/catch. Simulated here by a
    // rejected mock; asserts the rejection propagates rather than being converted
    // into a graceful {success:false} return.
    mockGetCurrentUser.mockRejectedValue(new Error('NEXT_REDIRECT'))

    await expect(
      saveAiTemplateAction({ title: 'Test', blocks: [] })
    ).rejects.toThrow('NEXT_REDIRECT')
    expect(mockPlanCreate).not.toHaveBeenCalled()
  })

  it('creates a template plan for an authenticated trainer', async () => {
    mockGetCurrentUser.mockResolvedValue(trainer as never)
    mockPlanCreate.mockResolvedValue({ id: 'plan_1' } as never)

    const result = await saveAiTemplateAction({ title: 'Test', blocks: [] })

    expect(result.success).toBe(true)
  })
})
