import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    workoutPlan: { findUnique: vi.fn(), update: vi.fn() },
  },
}))
vi.mock('@/lib/services/client.service', () => ({ getClientIdsForTrainer: vi.fn() }))
vi.mock('@/lib/services/ai.service', () => ({ generateWorkoutPlan: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { getClientIdsForTrainer } from '@/lib/services/client.service'
import { assignClientToPlanAction } from '../workout-actions'

const mockAuth = vi.mocked(auth)
const mockUserFind = vi.mocked(prisma.user.findUnique)
const mockPlanFind = vi.mocked(prisma.workoutPlan.findUnique)
const mockPlanUpdate = vi.mocked(prisma.workoutPlan.update)
const mockGetClientIds = vi.mocked(getClientIdsForTrainer)

const dbTrainer = { id: 'trainer_1', role: 'TRAINER' }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('assignClientToPlanAction', () => {
  it('allows assigning a plan to a roster client', async () => {
    mockAuth.mockResolvedValue({ userId: 'clerk_1' } as never)
    mockUserFind.mockResolvedValue(dbTrainer as never)
    mockPlanFind.mockResolvedValue({ createdById: 'trainer_1' } as never)
    mockGetClientIds.mockResolvedValue(['client_1'])
    mockPlanUpdate.mockResolvedValue({} as never)

    const result = await assignClientToPlanAction('plan_1', 'client_1')

    expect(result.success).toBe(true)
  })

  it('rejects assigning a plan to a non-roster client', async () => {
    mockAuth.mockResolvedValue({ userId: 'clerk_1' } as never)
    mockUserFind.mockResolvedValue(dbTrainer as never)
    mockPlanFind.mockResolvedValue({ createdById: 'trainer_1' } as never)
    mockGetClientIds.mockResolvedValue(['someone_else'])

    const result = await assignClientToPlanAction('plan_1', 'client_1')

    expect(result.success).toBe(false)
    expect(mockPlanUpdate).not.toHaveBeenCalled()
  })

  it('allows unassigning a client (null clientId) without a roster check', async () => {
    mockAuth.mockResolvedValue({ userId: 'clerk_1' } as never)
    mockUserFind.mockResolvedValue(dbTrainer as never)
    mockPlanFind.mockResolvedValue({ createdById: 'trainer_1' } as never)
    mockPlanUpdate.mockResolvedValue({} as never)

    const result = await assignClientToPlanAction('plan_1', null)

    expect(result.success).toBe(true)
    expect(mockGetClientIds).not.toHaveBeenCalled()
  })
})
