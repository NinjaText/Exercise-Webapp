import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    exerciseFeedback: { findUnique: vi.fn() },
    planExercise: { findUnique: vi.fn() },
  },
}))
vi.mock('@/lib/services/client.service', () => ({ getClientIdsForTrainer: vi.fn() }))
vi.mock('@/lib/services/feedback.service', () => ({ respondToFeedback: vi.fn(), submitFeedback: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { getClientIdsForTrainer } from '@/lib/services/client.service'
import * as feedbackService from '@/lib/services/feedback.service'
import { respondToFeedbackAction, submitFeedbackAction } from '../feedback-actions'

const mockAuth = vi.mocked(auth)
const mockUserFind = vi.mocked(prisma.user.findUnique)
const mockFeedbackFind = vi.mocked(prisma.exerciseFeedback.findUnique)
const mockPlanExerciseFind = vi.mocked(prisma.planExercise.findUnique)
const mockGetClientIds = vi.mocked(getClientIdsForTrainer)
const mockRespondToFeedback = vi.mocked(feedbackService.respondToFeedback)
const mockSubmitFeedback = vi.mocked(feedbackService.submitFeedback)

const dbTrainer = { id: 'trainer_1', role: 'TRAINER' }
const dbClient = { id: 'client_1', role: 'CLIENT' }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('respondToFeedbackAction', () => {
  it('allows a trainer responding to a roster client\'s feedback', async () => {
    mockAuth.mockResolvedValue({ userId: 'clerk_1' } as never)
    mockUserFind.mockResolvedValue(dbTrainer as never)
    mockFeedbackFind.mockResolvedValue({ clientId: 'client_1' } as never)
    mockGetClientIds.mockResolvedValue(['client_1'])
    mockRespondToFeedback.mockResolvedValue({} as never)

    const result = await respondToFeedbackAction({
      feedbackId: 'feedback_1',
      trainerResponse: 'Great work!',
    })

    expect(result.success).toBe(true)
  })

  it('rejects a trainer responding to a non-roster client\'s feedback', async () => {
    mockAuth.mockResolvedValue({ userId: 'clerk_1' } as never)
    mockUserFind.mockResolvedValue(dbTrainer as never)
    mockFeedbackFind.mockResolvedValue({ clientId: 'client_1' } as never)
    mockGetClientIds.mockResolvedValue(['someone_else'])

    const result = await respondToFeedbackAction({
      feedbackId: 'feedback_1',
      trainerResponse: 'Great work!',
    })

    expect(result.success).toBe(false)
    expect(mockRespondToFeedback).not.toHaveBeenCalled()
  })

  it('returns an error when the feedback does not exist', async () => {
    mockAuth.mockResolvedValue({ userId: 'clerk_1' } as never)
    mockUserFind.mockResolvedValue(dbTrainer as never)
    mockFeedbackFind.mockResolvedValue(null as never)

    const result = await respondToFeedbackAction({
      feedbackId: 'feedback_1',
      trainerResponse: 'Great work!',
    })

    expect(result.success).toBe(false)
    expect(mockRespondToFeedback).not.toHaveBeenCalled()
  })
})

describe('submitFeedbackAction', () => {
  it('allows a client submitting feedback on their own plan exercise', async () => {
    mockAuth.mockResolvedValue({ userId: 'clerk_1' } as never)
    mockUserFind.mockResolvedValue(dbClient as never)
    mockPlanExerciseFind.mockResolvedValue({ plan: { clientId: 'client_1' } } as never)
    mockSubmitFeedback.mockResolvedValue({ id: 'feedback_1' } as never)

    const result = await submitFeedbackAction({ planExerciseId: 'plan_ex_1', rating: 'FELT_GOOD' })

    expect(result.success).toBe(true)
    expect(mockSubmitFeedback).toHaveBeenCalledWith({
      planExerciseId: 'plan_ex_1',
      clientId: 'client_1',
      rating: 'FELT_GOOD',
      comment: undefined,
    })
  })

  it("rejects submitting feedback on another client's plan exercise", async () => {
    mockAuth.mockResolvedValue({ userId: 'clerk_1' } as never)
    mockUserFind.mockResolvedValue(dbClient as never)
    mockPlanExerciseFind.mockResolvedValue({ plan: { clientId: 'someone_else' } } as never)

    const result = await submitFeedbackAction({ planExerciseId: 'plan_ex_1', rating: 'FELT_GOOD' })

    expect(result.success).toBe(false)
    expect(mockSubmitFeedback).not.toHaveBeenCalled()
  })

  it('rejects when the plan exercise does not exist', async () => {
    mockAuth.mockResolvedValue({ userId: 'clerk_1' } as never)
    mockUserFind.mockResolvedValue(dbClient as never)
    mockPlanExerciseFind.mockResolvedValue(null as never)

    const result = await submitFeedbackAction({ planExerciseId: 'plan_ex_1', rating: 'FELT_GOOD' })

    expect(result.success).toBe(false)
    expect(mockSubmitFeedback).not.toHaveBeenCalled()
  })
})
