import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    workoutPlan: { findUnique: vi.fn() },
    workoutSession: { findUnique: vi.fn() },
    planExercise: { findUnique: vi.fn() },
  },
}))
vi.mock('@/lib/services/adherence.service', () => ({
  startSession: vi.fn(),
  completeSessionExercise: vi.fn(),
  completeSession: vi.fn(),
  abandonSession: vi.fn(),
}))

import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import * as adherenceService from '@/lib/services/adherence.service'
import { startSessionAction, completeSessionExerciseAction } from '../adherence-actions'

const mockAuth = vi.mocked(auth)
const mockUserFind = vi.mocked(prisma.user.findUnique)
const mockPlanFind = vi.mocked(prisma.workoutPlan.findUnique)
const mockSessionFind = vi.mocked(prisma.workoutSession.findUnique)
const mockPlanExerciseFind = vi.mocked(prisma.planExercise.findUnique)
const mockStartSession = vi.mocked(adherenceService.startSession)
const mockCompleteSessionExercise = vi.mocked(adherenceService.completeSessionExercise)

const dbClient = { id: 'client_1', clerkId: 'clerk_1', role: 'CLIENT' }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('startSessionAction', () => {
  it('allows a client starting a session on their own plan', async () => {
    mockAuth.mockResolvedValue({ userId: 'clerk_1' } as never)
    mockUserFind.mockResolvedValue(dbClient as never)
    mockPlanFind.mockResolvedValue({ clientId: 'client_1' } as never)
    mockStartSession.mockResolvedValue({ id: 'session_1' } as never)

    const result = await startSessionAction('plan_1')

    expect(result.success).toBe(true)
  })

  it("rejects a client starting a session on another client's plan", async () => {
    mockAuth.mockResolvedValue({ userId: 'clerk_1' } as never)
    mockUserFind.mockResolvedValue(dbClient as never)
    mockPlanFind.mockResolvedValue({ clientId: 'someone_else' } as never)

    const result = await startSessionAction('plan_1')

    expect(result.success).toBe(false)
    expect(mockStartSession).not.toHaveBeenCalled()
  })

  it('rejects when the plan does not exist', async () => {
    mockAuth.mockResolvedValue({ userId: 'clerk_1' } as never)
    mockUserFind.mockResolvedValue(dbClient as never)
    mockPlanFind.mockResolvedValue(null as never)

    const result = await startSessionAction('plan_1')

    expect(result.success).toBe(false)
    expect(mockStartSession).not.toHaveBeenCalled()
  })
})

describe('completeSessionExerciseAction', () => {
  it('allows a client completing an exercise on their own session', async () => {
    mockAuth.mockResolvedValue({ userId: 'clerk_1' } as never)
    mockUserFind.mockResolvedValue(dbClient as never)
    mockSessionFind.mockResolvedValue({ clientId: 'client_1', planId: 'plan_1' } as never)
    mockPlanExerciseFind.mockResolvedValue({ planId: 'plan_1' } as never)
    mockCompleteSessionExercise.mockResolvedValue({ id: 'item_1' } as never)

    const result = await completeSessionExerciseAction('session_1', 'plan_ex_1', { status: 'COMPLETED' })

    expect(result.success).toBe(true)
    expect(mockCompleteSessionExercise).toHaveBeenCalledWith('session_1', 'plan_ex_1', { status: 'COMPLETED' })
  })

  it("rejects when the session does not belong to the caller", async () => {
    mockAuth.mockResolvedValue({ userId: 'clerk_1' } as never)
    mockUserFind.mockResolvedValue(dbClient as never)
    mockSessionFind.mockResolvedValue({ clientId: 'someone_else', planId: 'plan_1' } as never)

    const result = await completeSessionExerciseAction('session_1', 'plan_ex_1', { status: 'COMPLETED' })

    expect(result.success).toBe(false)
    expect(mockCompleteSessionExercise).not.toHaveBeenCalled()
  })

  it("rejects when the planExercise does not belong to the session's plan", async () => {
    mockAuth.mockResolvedValue({ userId: 'clerk_1' } as never)
    mockUserFind.mockResolvedValue(dbClient as never)
    mockSessionFind.mockResolvedValue({ clientId: 'client_1', planId: 'plan_1' } as never)
    mockPlanExerciseFind.mockResolvedValue({ planId: 'someone_elses_plan' } as never)

    const result = await completeSessionExerciseAction('session_1', 'plan_ex_1', { status: 'COMPLETED' })

    expect(result.success).toBe(false)
    expect(mockCompleteSessionExercise).not.toHaveBeenCalled()
  })

  it('rejects when the session does not exist', async () => {
    mockAuth.mockResolvedValue({ userId: 'clerk_1' } as never)
    mockUserFind.mockResolvedValue(dbClient as never)
    mockSessionFind.mockResolvedValue(null as never)

    const result = await completeSessionExerciseAction('session_1', 'plan_ex_1', { status: 'COMPLETED' })

    expect(result.success).toBe(false)
    expect(mockCompleteSessionExercise).not.toHaveBeenCalled()
  })

  it('rejects when the planExercise does not exist', async () => {
    mockAuth.mockResolvedValue({ userId: 'clerk_1' } as never)
    mockUserFind.mockResolvedValue(dbClient as never)
    mockSessionFind.mockResolvedValue({ clientId: 'client_1', planId: 'plan_1' } as never)
    mockPlanExerciseFind.mockResolvedValue(null as never)

    const result = await completeSessionExerciseAction('session_1', 'plan_ex_1', { status: 'COMPLETED' })

    expect(result.success).toBe(false)
    expect(mockCompleteSessionExercise).not.toHaveBeenCalled()
  })
})
