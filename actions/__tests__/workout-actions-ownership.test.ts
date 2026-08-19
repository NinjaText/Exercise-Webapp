import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    workoutPlan: { findUnique: vi.fn(), update: vi.fn() },
    planExercise: { findUnique: vi.fn() },
  },
}))
vi.mock('@/lib/services/workout-plan.service', () => ({
  createPlan: vi.fn(),
  updatePlanExercise: vi.fn(),
  swapExercise: vi.fn(),
}))
vi.mock('@/lib/services/ai.service', () => ({ generateWorkoutPlan: vi.fn() }))
vi.mock('@/lib/services/client.service', () => ({ getClientIdsForTrainer: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { getClientIdsForTrainer } from '@/lib/services/client.service'
import * as workoutPlanService from '@/lib/services/workout-plan.service'
import {
  createPlanAction,
  generatePlanAction,
  updatePlanExerciseAction,
  swapExerciseAction,
} from '../workout-actions'

const mockAuth = vi.mocked(auth)
const mockUserFind = vi.mocked(prisma.user.findUnique)
const mockPlanExerciseFind = vi.mocked(prisma.planExercise.findUnique)
const mockGetClientIds = vi.mocked(getClientIdsForTrainer)
const mockCreatePlan = vi.mocked(workoutPlanService.createPlan)
const mockUpdatePlanExercise = vi.mocked(workoutPlanService.updatePlanExercise)
const mockSwapExercise = vi.mocked(workoutPlanService.swapExercise)

const dbTrainer = { id: 'trainer_1', role: 'TRAINER' }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('createPlanAction ownership', () => {
  it('rejects creating a plan pre-assigned to a non-roster client', async () => {
    mockAuth.mockResolvedValue({ userId: 'clerk_1' } as never)
    mockUserFind.mockResolvedValue(dbTrainer as never)
    mockGetClientIds.mockResolvedValue(['someone_else'])

    const result = await createPlanAction({
      clientId: 'client_1',
      title: 'Plan',
      exercises: [],
    })

    expect(result.success).toBe(false)
    expect(mockCreatePlan).not.toHaveBeenCalled()
  })
})

describe('generatePlanAction ownership', () => {
  it('rejects generating a plan pre-assigned to a non-roster client', async () => {
    mockAuth.mockResolvedValue({ userId: 'clerk_1' } as never)
    mockUserFind.mockResolvedValue(dbTrainer as never)
    mockGetClientIds.mockResolvedValue(['someone_else'])

    const result = await generatePlanAction({
      clientId: 'client_1',
      focusAreas: ['strength'],
      durationMinutes: 45,
      daysPerWeek: 3,
      difficultyLevel: 'BEGINNER',
    })

    expect(result.success).toBe(false)
    expect(mockCreatePlan).not.toHaveBeenCalled()
  })
})

describe('updatePlanExerciseAction ownership', () => {
  it('rejects updating a plan exercise not owned by the trainer', async () => {
    mockAuth.mockResolvedValue({ userId: 'clerk_1' } as never)
    mockUserFind.mockResolvedValue(dbTrainer as never)
    mockPlanExerciseFind.mockResolvedValue({ plan: { createdById: 'someone_else' } } as never)

    const result = await updatePlanExerciseAction('plan_exercise_1', { sets: 4 })

    expect(result.success).toBe(false)
    expect(mockUpdatePlanExercise).not.toHaveBeenCalled()
  })
})

describe('swapExerciseAction ownership', () => {
  it('rejects swapping an exercise not owned by the trainer', async () => {
    mockAuth.mockResolvedValue({ userId: 'clerk_1' } as never)
    mockUserFind.mockResolvedValue(dbTrainer as never)
    mockPlanExerciseFind.mockResolvedValue({ plan: { createdById: 'someone_else' } } as never)

    const result = await swapExerciseAction('plan_exercise_1', 'new_exercise_1')

    expect(result.success).toBe(false)
    expect(mockSwapExercise).not.toHaveBeenCalled()
  })
})
