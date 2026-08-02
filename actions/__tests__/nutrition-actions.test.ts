import { describe, it, expect, vi, beforeEach } from 'vitest'

const client = { id: 'client_1', role: 'CLIENT' }
const trainer = { id: 'trainer_1', role: 'TRAINER' }

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    nutritionLog: { findUnique: vi.fn(), findMany: vi.fn() },
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(),
  PutObjectCommand: vi.fn(),
  DeleteObjectCommand: vi.fn(),
  CopyObjectCommand: vi.fn(),
}))
vi.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: vi.fn() }))
vi.mock('@/lib/r2', () => ({
  getR2Client: vi.fn(() => ({ send: vi.fn() })),
  R2_BUCKET_NAME: 'test-bucket',
  R2_PUBLIC_URL: 'https://pub.r2.dev',
}))
vi.mock('@/lib/pusher', () => ({ pusherServer: { trigger: vi.fn().mockResolvedValue(undefined) } }))
vi.mock('@/lib/services/notification.service', () => ({
  createNotification: vi.fn(),
  NOTIFICATION_TYPES: { NUTRITION_COMMENT: 'NUTRITION_COMMENT', NUTRITION_REPLY: 'NUTRITION_REPLY' },
}))
vi.mock('@/lib/services/client.service', () => ({
  getClientIdsForTrainer: vi.fn(),
  getTrainerForClient: vi.fn(),
}))
vi.mock('@/lib/services/nutrition.service', () => ({
  createNutritionLog: vi.fn(),
  updateNutritionLog: vi.fn(),
  deleteNutritionLog: vi.fn(),
  updateNutritionTarget: vi.fn(),
  addWaterLog: vi.fn(),
  createNutritionComment: vi.fn(),
  updateMealGroup: vi.fn(),
}))
vi.mock('@/lib/services/nutrition-ai.service', () => ({
  analyzeMealPhoto: vi.fn(),
  estimateMealMacrosBatch: vi.fn(),
  generateDailyNutritionSummary: vi.fn(),
  generateWeeklyNutritionReview: vi.fn(),
}))

import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { getClientIdsForTrainer } from '@/lib/services/client.service'
import * as nutritionAiService from '@/lib/services/nutrition-ai.service'
import * as nutritionService from '@/lib/services/nutrition.service'
import { estimateMealMacrosBatchAction, updateMealGroupAction } from '../nutrition-actions'

const mockAuth = vi.mocked(auth)
const mockUserFindUnique = vi.mocked(prisma.user.findUnique)
const mockEstimateBatch = vi.mocked(nutritionAiService.estimateMealMacrosBatch)
const mockGetClientIdsForTrainer = vi.mocked(getClientIdsForTrainer)
const mockUpdateMealGroup = vi.mocked(nutritionService.updateMealGroup)

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth.mockResolvedValue({ userId: 'clerk_1' } as never)
})

describe('estimateMealMacrosBatchAction', () => {
  it('rejects unauthenticated callers', async () => {
    mockAuth.mockResolvedValue({ userId: null } as never)
    const result = await estimateMealMacrosBatchAction({ items: [{ name: 'Coffee' }] })
    expect(result.success).toBe(false)
  })

  it('allows a client to estimate their own draft items', async () => {
    mockUserFindUnique.mockResolvedValue(client as never)
    mockEstimateBatch.mockResolvedValue([{ calories: 5, proteinG: 0.3, carbsG: 1, fatG: 0 }])

    const result = await estimateMealMacrosBatchAction({ items: [{ name: 'Coffee' }] })

    expect(result.success).toBe(true)
    expect(result.success && result.data.estimates).toEqual([{ calories: 5, proteinG: 0.3, carbsG: 1, fatG: 0 }])
  })

  it("allows a trainer to estimate on a client's behalf", async () => {
    mockUserFindUnique.mockResolvedValue(trainer as never)
    mockEstimateBatch.mockResolvedValue([{ calories: 5, proteinG: 0.3, carbsG: 1, fatG: 0 }])

    const result = await estimateMealMacrosBatchAction({ items: [{ name: 'Coffee' }] })

    expect(result.success).toBe(true)
  })

  it('rejects an empty item list', async () => {
    mockUserFindUnique.mockResolvedValue(client as never)
    const result = await estimateMealMacrosBatchAction({ items: [] })
    expect(result.success).toBe(false)
    expect(mockEstimateBatch).not.toHaveBeenCalled()
  })

  it('returns an error when the AI service throws', async () => {
    mockUserFindUnique.mockResolvedValue(client as never)
    mockEstimateBatch.mockRejectedValue(new Error('model unavailable'))

    const result = await estimateMealMacrosBatchAction({ items: [{ name: 'Coffee' }] })

    expect(result.success).toBe(false)
  })
})

describe('updateMealGroupAction', () => {
  const date = new Date('2026-08-01T00:00:00Z')

  it('allows a client to update their own meal group', async () => {
    mockUserFindUnique.mockResolvedValue(client as never)
    mockUpdateMealGroup.mockResolvedValue({ ids: ['log_1'] })

    const result = await updateMealGroupAction('client_1', date, 'BREAKFAST', {
      items: [{ id: 'log_1', description: 'Coffee' }],
    })

    expect(result.success).toBe(true)
  })

  it("rejects a client trying to update another client's meal group", async () => {
    mockUserFindUnique.mockResolvedValue(client as never)

    const result = await updateMealGroupAction('someone_else', date, 'BREAKFAST', {
      items: [{ description: 'Coffee' }],
    })

    expect(result.success).toBe(false)
    expect(mockUpdateMealGroup).not.toHaveBeenCalled()
  })

  it("allows a trainer to update their client's meal group", async () => {
    mockUserFindUnique.mockResolvedValue(trainer as never)
    mockGetClientIdsForTrainer.mockResolvedValue(['client_1'])
    mockUpdateMealGroup.mockResolvedValue({ ids: ['log_1'] })

    const result = await updateMealGroupAction('client_1', date, 'BREAKFAST', {
      items: [{ id: 'log_1', description: 'Coffee' }],
    })

    expect(result.success).toBe(true)
  })

  it("rejects a trainer updating a client outside their roster", async () => {
    mockUserFindUnique.mockResolvedValue(trainer as never)
    mockGetClientIdsForTrainer.mockResolvedValue(['someone_else'])

    const result = await updateMealGroupAction('client_1', date, 'BREAKFAST', {
      items: [{ description: 'Coffee' }],
    })

    expect(result.success).toBe(false)
    expect(mockUpdateMealGroup).not.toHaveBeenCalled()
  })

  it('surfaces the empty-items error message from the service layer', async () => {
    mockUserFindUnique.mockResolvedValue(client as never)
    mockUpdateMealGroup.mockRejectedValue(new Error('A meal must have at least one item'))

    const result = await updateMealGroupAction('client_1', date, 'BREAKFAST', { items: [] })

    expect(result.success).toBe(false)
  })

  it('rejects a mealType outside the MEAL_TYPES enum, even with otherwise-valid items', async () => {
    mockUserFindUnique.mockResolvedValue(client as never)

    const result = await updateMealGroupAction('client_1', date, 'BRUNCH', {
      items: [{ description: 'Coffee' }],
    })

    expect(result.success).toBe(false)
    expect(mockUpdateMealGroup).not.toHaveBeenCalled()
  })

  it('rejects an invalid Date value before reaching the service layer', async () => {
    mockUserFindUnique.mockResolvedValue(client as never)

    const result = await updateMealGroupAction('client_1', new Date('not-a-date'), 'BREAKFAST', {
      items: [{ description: 'Coffee' }],
    })

    expect(result.success).toBe(false)
    expect(mockUpdateMealGroup).not.toHaveBeenCalled()
  })
})
