import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  computeAdherence,
  updateMealGroup,
  parseNutritionDateParam,
  resolveNutritionRange,
  parseNutritionRangeParams,
} from '../nutrition.service'
import { prisma } from '@/lib/prisma'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    nutritionLog: { findMany: vi.fn(), update: vi.fn(), deleteMany: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
  },
}))

const mockFindMany = vi.mocked(prisma.nutritionLog.findMany)
const mockUpdate = vi.mocked(prisma.nutritionLog.update)
const mockDeleteMany = vi.mocked(prisma.nutritionLog.deleteMany)
const mockCreate = vi.mocked(prisma.nutritionLog.create)
const mockTransaction = vi.mocked(prisma.$transaction)

beforeEach(() => {
  vi.clearAllMocks()
  // Mirrors the array-form `$transaction([...])` contract: resolve each
  // already-constructed operation promise, in order, as Prisma would when
  // running them atomically.
  mockTransaction.mockImplementation(((ops: unknown) => Promise.all(ops as Promise<unknown>[])) as never)
})

describe('computeAdherence', () => {
  it('returns null when no targets are set', () => {
    const target = { calories: null, proteinG: null, carbsG: null, fatG: null, waterMl: null }
    const consumed = { calories: 500, proteinG: 20, carbsG: 30, fatG: 10, waterMl: 500 }
    expect(computeAdherence(target, consumed)).toBeNull()
  })

  it('averages hit-rate across only the fields with a target set', () => {
    const target = { calories: 2000, proteinG: 150, carbsG: null, fatG: null, waterMl: null }
    const consumed = { calories: 1000, proteinG: 150, carbsG: 0, fatG: 0, waterMl: 0 }
    // calories: 50%, protein: 100% -> average 75%
    expect(computeAdherence(target, consumed)).toBe(75)
  })

  it('caps a field at 100% when consumption exceeds target', () => {
    const target = { calories: 2000, proteinG: null, carbsG: null, fatG: null, waterMl: null }
    const consumed = { calories: 4000, proteinG: 0, carbsG: 0, fatG: 0, waterMl: 0 }
    expect(computeAdherence(target, consumed)).toBe(100)
  })

  it('computes a full average across all five fields', () => {
    const target = { calories: 2000, proteinG: 100, carbsG: 200, fatG: 50, waterMl: 2000 }
    const consumed = { calories: 2000, proteinG: 100, carbsG: 200, fatG: 50, waterMl: 2000 }
    expect(computeAdherence(target, consumed)).toBe(100)
  })
})

describe('updateMealGroup', () => {
  const clientId = 'client_1'
  const date = new Date('2026-08-01T00:00:00Z')
  const mealType = 'BREAKFAST'

  it('rejects an empty item list instead of deleting the whole meal', async () => {
    await expect(updateMealGroup(clientId, date, mealType, [])).rejects.toThrow()
    expect(mockFindMany).not.toHaveBeenCalled()
  })

  it('updates existing items by id and leaves untouched rows alone', async () => {
    mockFindMany.mockResolvedValue([{ id: 'log_1' }, { id: 'log_2' }] as never)
    mockUpdate.mockResolvedValue({ id: 'log_1' } as never)

    await updateMealGroup(clientId, date, mealType, [
      { id: 'log_1', description: 'Coffee', quantity: '1 cup' },
      { id: 'log_2', description: 'Bread', quantity: '2 slices' },
    ])

    expect(mockUpdate).toHaveBeenCalledTimes(2)
    expect(mockDeleteMany).not.toHaveBeenCalled()
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('creates rows for items with no id', async () => {
    mockFindMany.mockResolvedValue([] as never)
    mockCreate.mockResolvedValue({ id: 'log_new' } as never)

    await updateMealGroup(clientId, date, mealType, [{ description: 'New item', quantity: '1 serving' }])

    expect(mockCreate).toHaveBeenCalledTimes(1)
    expect(mockDeleteMany).not.toHaveBeenCalled()
  })

  it('deletes existing rows that are not present in the submitted list', async () => {
    mockFindMany.mockResolvedValue([{ id: 'log_1' }, { id: 'log_2' }] as never)
    mockUpdate.mockResolvedValue({ id: 'log_1' } as never)

    await updateMealGroup(clientId, date, mealType, [{ id: 'log_1', description: 'Coffee' }])

    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { id: { in: ['log_2'] } } })
  })

  it("rejects an item id that doesn't belong to this meal group and makes no mutations", async () => {
    mockFindMany.mockResolvedValue([{ id: 'log_1' }] as never)

    await expect(
      updateMealGroup(clientId, date, mealType, [
        { id: 'log_from_another_meal', description: 'Tampered' },
      ])
    ).rejects.toThrow()

    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mockDeleteMany).not.toHaveBeenCalled()
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('stamps a newly created item in a historical (non-today) meal group at the start of that UTC day', async () => {
    mockFindMany.mockResolvedValue([] as never)
    mockCreate.mockResolvedValue({ id: 'log_new' } as never)

    // `date` (2026-08-01) is far from "now" in this test run, so it is never
    // accidentally today's UTC day.
    await updateMealGroup(clientId, date, mealType, [
      { description: 'Leftover pizza', quantity: '2 slices' },
    ])

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ loggedAt: new Date('2026-08-01T00:00:00.000Z') }),
      })
    )
  })

  it("stamps a newly created item in today's meal group with the real current logging time", async () => {
    mockFindMany.mockResolvedValue([] as never)
    mockCreate.mockResolvedValue({ id: 'log_new' } as never)

    const today = new Date()
    const before = Date.now()

    await updateMealGroup(clientId, today, mealType, [{ description: 'Snack' }])

    const after = Date.now()
    const createArgs = mockCreate.mock.calls[0][0] as { data: { loggedAt: Date } }
    expect(createArgs.data.loggedAt.getTime()).toBeGreaterThanOrEqual(before)
    expect(createArgs.data.loggedAt.getTime()).toBeLessThanOrEqual(after)
  })

  it('runs updates, creates, and the removed-item delete inside a single $transaction call', async () => {
    mockFindMany.mockResolvedValue([{ id: 'log_1' }, { id: 'log_2' }] as never)
    mockUpdate.mockResolvedValue({ id: 'log_1' } as never)
    mockCreate.mockResolvedValue({ id: 'log_new' } as never)

    // log_1 is updated, log_2 is omitted (removed), and a brand-new item is added.
    await updateMealGroup(clientId, date, mealType, [
      { id: 'log_1', description: 'Coffee' },
      { description: 'New item' },
    ])

    expect(mockTransaction).toHaveBeenCalledTimes(1)
    const ops = mockTransaction.mock.calls[0][0] as unknown as unknown[]
    expect(ops).toHaveLength(3) // 1 update + 1 create + 1 deleteMany
    expect(mockUpdate).toHaveBeenCalledTimes(1)
    expect(mockCreate).toHaveBeenCalledTimes(1)
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { id: { in: ['log_2'] } } })
  })

  it('propagates a transaction failure without applying any partial mutation', async () => {
    mockFindMany.mockResolvedValue([{ id: 'log_1' }] as never)
    mockUpdate.mockResolvedValue({ id: 'log_1' } as never)
    mockTransaction.mockRejectedValueOnce(new Error('transaction aborted'))

    await expect(
      updateMealGroup(clientId, date, mealType, [{ id: 'log_1', description: 'Coffee' }])
    ).rejects.toThrow('transaction aborted')

    expect(mockTransaction).toHaveBeenCalledTimes(1)
  })
})

describe('parseNutritionDateParam', () => {
  it('returns today when given undefined', () => {
    const result = parseNutritionDateParam(undefined)
    const today = new Date()
    expect(result.toDateString()).toBe(today.toDateString())
  })

  it('returns today when given an invalid date string', () => {
    const result = parseNutritionDateParam('not-a-date')
    const today = new Date()
    expect(result.toDateString()).toBe(today.toDateString())
  })

  it('parses a valid past date string as the same UTC calendar date, independent of local TZ', () => {
    // Uses UTC-field assertions (not getFullYear/getMonth/getDate, which read
    // local-time fields) because dayRange — and every read query built on it —
    // computes day boundaries from UTC year/month/date. A local-time parse
    // here would silently disagree with dayRange whenever the process runs in
    // a timezone ahead of UTC.
    const result = parseNutritionDateParam('2026-01-15')
    expect(result.getUTCFullYear()).toBe(2026)
    expect(result.getUTCMonth()).toBe(0)
    expect(result.getUTCDate()).toBe(15)
    expect(result.toISOString()).toBe('2026-01-15T00:00:00.000Z')
  })

  it('clamps a future date to the current UTC day, independent of local TZ', () => {
    const now = new Date()
    const futureUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 5))
    const futureParam = `${futureUTC.getUTCFullYear()}-${String(futureUTC.getUTCMonth() + 1).padStart(2, '0')}-${String(futureUTC.getUTCDate()).padStart(2, '0')}`

    const result = parseNutritionDateParam(futureParam)

    const todayUTCMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    expect(result.getTime()).toBe(todayUTCMidnight)
  })
})

describe('resolveNutritionRange', () => {
  // A fixed Wednesday, so week boundaries are deterministic regardless of when the suite runs.
  const wednesday = new Date('2026-08-05T00:00:00Z')

  it('TODAY resolves to a single-day range on today', () => {
    const { start, end } = resolveNutritionRange('TODAY', wednesday)
    expect(start.toISOString()).toBe('2026-08-05T00:00:00.000Z')
    expect(end.toISOString()).toBe('2026-08-05T00:00:00.000Z')
  })

  it('THIS_WEEK starts on the preceding (or same) Monday and ends today', () => {
    const { start, end } = resolveNutritionRange('THIS_WEEK', wednesday)
    expect(start.toISOString()).toBe('2026-08-03T00:00:00.000Z') // Monday
    expect(end.toISOString()).toBe('2026-08-05T00:00:00.000Z') // today
  })

  it('LAST_WEEK is the full Monday-Sunday week before this one', () => {
    const { start, end } = resolveNutritionRange('LAST_WEEK', wednesday)
    expect(start.toISOString()).toBe('2026-07-27T00:00:00.000Z') // Monday
    expect(end.toISOString()).toBe('2026-08-02T00:00:00.000Z') // Sunday
  })

  it('THIS_MONTH starts on the 1st and ends today', () => {
    const { start, end } = resolveNutritionRange('THIS_MONTH', wednesday)
    expect(start.toISOString()).toBe('2026-08-01T00:00:00.000Z')
    expect(end.toISOString()).toBe('2026-08-05T00:00:00.000Z')
  })

  it('LAST_MONTH is the full calendar month before this one', () => {
    const { start, end } = resolveNutritionRange('LAST_MONTH', wednesday)
    expect(start.toISOString()).toBe('2026-07-01T00:00:00.000Z')
    expect(end.toISOString()).toBe('2026-07-31T00:00:00.000Z')
  })

  it('LAST_MONTH rolls back across a year boundary in January', () => {
    const januaryThursday = new Date('2026-01-15T00:00:00Z')
    const { start, end } = resolveNutritionRange('LAST_MONTH', januaryThursday)
    expect(start.toISOString()).toBe('2025-12-01T00:00:00.000Z')
    expect(end.toISOString()).toBe('2025-12-31T00:00:00.000Z')
  })

  it('CUSTOM uses the given bounds', () => {
    const { start, end } = resolveNutritionRange(
      'CUSTOM',
      wednesday,
      new Date('2026-07-10T00:00:00Z'),
      new Date('2026-07-20T00:00:00Z')
    )
    expect(start.toISOString()).toBe('2026-07-10T00:00:00.000Z')
    expect(end.toISOString()).toBe('2026-07-20T00:00:00.000Z')
  })

  it('CUSTOM clamps an end date beyond today to today', () => {
    const { start, end } = resolveNutritionRange(
      'CUSTOM',
      wednesday,
      new Date('2026-07-10T00:00:00Z'),
      new Date('2026-12-01T00:00:00Z')
    )
    expect(start.toISOString()).toBe('2026-07-10T00:00:00.000Z')
    expect(end.toISOString()).toBe('2026-08-05T00:00:00.000Z')
  })

  it('CUSTOM swaps an inverted start/end into a single-day range on the end date', () => {
    const { start, end } = resolveNutritionRange(
      'CUSTOM',
      wednesday,
      new Date('2026-07-20T00:00:00Z'),
      new Date('2026-07-10T00:00:00Z')
    )
    expect(start.toISOString()).toBe('2026-07-10T00:00:00.000Z')
    expect(end.toISOString()).toBe('2026-07-10T00:00:00.000Z')
  })

  it('CUSTOM without explicit bounds falls back to a single-day range on today', () => {
    const { start, end } = resolveNutritionRange('CUSTOM', wednesday)
    expect(start.toISOString()).toBe('2026-08-05T00:00:00.000Z')
    expect(end.toISOString()).toBe('2026-08-05T00:00:00.000Z')
  })
})

describe('parseNutritionRangeParams', () => {
  it('defaults to TODAY when range is missing', () => {
    const result = parseNutritionRangeParams({})
    expect(result.preset).toBe('TODAY')
    expect(result.start.getTime()).toBe(result.end.getTime())
  })

  it('defaults to TODAY when range is unrecognized', () => {
    const result = parseNutritionRangeParams({ range: 'not-a-real-preset' })
    expect(result.preset).toBe('TODAY')
  })

  it('accepts a lowercase preset value from the URL', () => {
    const result = parseNutritionRangeParams({ range: 'this_week' })
    expect(result.preset).toBe('THIS_WEEK')
  })

  it('parses custom start/end params', () => {
    const result = parseNutritionRangeParams({ range: 'custom', start: '2026-01-01', end: '2026-01-10' })
    expect(result.preset).toBe('CUSTOM')
    expect(result.start.toISOString()).toBe('2026-01-01T00:00:00.000Z')
    expect(result.end.toISOString()).toBe('2026-01-10T00:00:00.000Z')
  })
})
