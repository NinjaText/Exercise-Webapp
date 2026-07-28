import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    workoutSessionV2: { findFirst: vi.fn() },
    checkInResponse: { findFirst: vi.fn() },
  },
}))

vi.mock('@/lib/services/nutrition.service', () => ({
  getDailySummary: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import * as nutritionService from '@/lib/services/nutrition.service'
import { computeDailyAccountabilityScore } from '../accountability.service'

const mockWorkoutFindFirst = vi.mocked(prisma.workoutSessionV2.findFirst)
const mockCheckInFindFirst = vi.mocked(prisma.checkInResponse.findFirst)
const mockGetDailySummary = vi.mocked(nutritionService.getDailySummary)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('computeDailyAccountabilityScore', () => {
  it('awards all 100 points when every rubric item is met', async () => {
    mockWorkoutFindFirst.mockResolvedValue({ id: 'session-1' } as any)
    mockCheckInFindFirst.mockResolvedValue({ id: 'checkin-1' } as any)
    mockGetDailySummary.mockResolvedValue({
      target: { calories: 2000, proteinG: 150, carbsG: 200, fatG: 60, waterMl: 2000 },
      consumed: { calories: 2000, proteinG: 150, carbsG: 200, fatG: 60, waterMl: 2000 },
      remaining: { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, waterMl: 0 },
      adherencePct: 100,
      mealsLogged: 3,
    } as any)

    const result = await computeDailyAccountabilityScore('client-1', new Date('2026-01-01T12:00:00Z'))

    expect(result.score).toBe(100)
    expect(result.breakdown).toEqual({ workout: 30, calories: 20, protein: 20, water: 10, checkIn: 20 })
  })

  it('scores 0 for every component when nothing is met and no targets are set', async () => {
    mockWorkoutFindFirst.mockResolvedValue(null)
    mockCheckInFindFirst.mockResolvedValue(null)
    mockGetDailySummary.mockResolvedValue({
      target: { calories: null, proteinG: null, carbsG: null, fatG: null, waterMl: null },
      consumed: { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, waterMl: 0 },
      remaining: { calories: null, proteinG: null, carbsG: null, fatG: null, waterMl: null },
      adherencePct: null,
      mealsLogged: 0,
    } as any)

    const result = await computeDailyAccountabilityScore('client-1', new Date('2026-01-01T12:00:00Z'))

    expect(result.score).toBe(0)
    expect(result.breakdown).toEqual({ workout: 0, calories: 0, protein: 0, water: 0, checkIn: 0 })
  })

  it('awards calories/protein points only when within ±10% of target', async () => {
    mockWorkoutFindFirst.mockResolvedValue(null)
    mockCheckInFindFirst.mockResolvedValue(null)
    mockGetDailySummary.mockResolvedValue({
      // calories 15% over target -> not within ±10%; protein exactly at target -> within
      target: { calories: 2000, proteinG: 150, carbsG: null, fatG: null, waterMl: null },
      consumed: { calories: 2300, proteinG: 150, carbsG: 0, fatG: 0, waterMl: 0 },
      remaining: { calories: -300, proteinG: 0, carbsG: null, fatG: null, waterMl: null },
      adherencePct: 90,
      mealsLogged: 2,
    } as any)

    const result = await computeDailyAccountabilityScore('client-1', new Date('2026-01-01T12:00:00Z'))

    expect(result.breakdown.calories).toBe(0)
    expect(result.breakdown.protein).toBe(20)
    expect(result.score).toBe(20)
  })
})
