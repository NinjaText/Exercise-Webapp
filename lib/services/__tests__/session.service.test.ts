import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    workoutSessionV2: {
      updateMany: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import {
  markPastDueSessionsMissed,
  MISSED_SESSION_GRACE_HOURS,
  getClientPastSessions,
  computeAdherenceStats,
  computeScheduleVariance,
  rescheduleSession,
} from '../session.service'

const mockUpdateMany = vi.mocked(prisma.workoutSessionV2.updateMany)
const mockFindMany = vi.mocked(prisma.workoutSessionV2.findMany)
const mockFindUnique = vi.mocked(prisma.workoutSessionV2.findUnique)
const mockUpdate = vi.mocked(prisma.workoutSessionV2.update)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('markPastDueSessionsMissed', () => {
  it('flips only SCHEDULED sessions past the grace period to MISSED', async () => {
    mockUpdateMany.mockResolvedValue({ count: 3 } as never)

    const now = new Date('2026-07-14T12:00:00.000Z')
    const expectedCutoff = new Date(
      now.getTime() - MISSED_SESSION_GRACE_HOURS * 60 * 60 * 1000
    )

    const result = await markPastDueSessionsMissed(now)

    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: {
        status: 'SCHEDULED',
        scheduledDate: { lt: expectedCutoff },
      },
      data: { status: 'MISSED' },
    })
    expect(result).toEqual({ markedMissed: 3 })
  })

  it('computes the cutoff exactly MISSED_SESSION_GRACE_HOURS before now', async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 } as never)

    const now = new Date('2026-07-14T12:00:00.000Z')
    await markPastDueSessionsMissed(now)

    const call = mockUpdateMany.mock.calls[0][0] as {
      where: { scheduledDate: { lt: Date } }
    }
    const cutoff = call.where.scheduledDate.lt
    expect(now.getTime() - cutoff.getTime()).toBe(
      MISSED_SESSION_GRACE_HOURS * 60 * 60 * 1000
    )
  })

  it('returns a zero count when nothing is overdue', async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 } as never)

    const result = await markPastDueSessionsMissed(new Date())

    expect(result).toEqual({ markedMissed: 0 })
    expect(mockUpdateMany).toHaveBeenCalledTimes(1)
  })
})

describe('getClientPastSessions', () => {
  it('scopes to the client and only fetches sessions scheduled on/before now', async () => {
    mockFindMany.mockResolvedValue([] as never)
    await getClientPastSessions('client_1')

    const call = mockFindMany.mock.calls[0][0] as {
      where: { clientId: string; scheduledDate: { lte: Date } }
      orderBy: unknown
      take: number
    }
    expect(call.where.clientId).toBe('client_1')
    expect(call.where.scheduledDate.lte).toBeInstanceOf(Date)
    expect(call.orderBy).toEqual({ scheduledDate: 'desc' })
    expect(call.take).toBe(100)
  })
})

describe('computeAdherenceStats', () => {
  it('computes counts, completion rate, and average RPE', () => {
    const stats = computeAdherenceStats([
      { status: 'COMPLETED', overallRPE: 6 },
      { status: 'COMPLETED', overallRPE: 8 },
      { status: 'MISSED', overallRPE: null },
      { status: 'SKIPPED', overallRPE: null },
    ])

    expect(stats.total).toBe(4)
    expect(stats.completed).toBe(2)
    expect(stats.missed).toBe(1)
    expect(stats.skipped).toBe(1)
    expect(stats.completionRate).toBe(50)
    expect(stats.avgRPE).toBe(7)
  })

  it('rounds average RPE to one decimal place', () => {
    const stats = computeAdherenceStats([
      { status: 'COMPLETED', overallRPE: 6 },
      { status: 'COMPLETED', overallRPE: 6 },
      { status: 'COMPLETED', overallRPE: 7 },
    ])

    expect(stats.avgRPE).toBe(6.3)
  })

  it('returns null avgRPE when no session has an RPE', () => {
    const stats = computeAdherenceStats([
      { status: 'COMPLETED', overallRPE: null },
      { status: 'MISSED', overallRPE: null },
    ])

    expect(stats.avgRPE).toBeNull()
  })

  it('returns zeroed stats for an empty session list', () => {
    const stats = computeAdherenceStats([])

    expect(stats).toEqual({
      total: 0,
      completed: 0,
      missed: 0,
      skipped: 0,
      completionRate: 0,
      avgRPE: null,
    })
  })
})

describe('computeScheduleVariance', () => {
  it('classifies same UTC calendar day as ON_TIME regardless of time of day', () => {
    const scheduledDate = new Date('2026-08-20T00:00:00.000Z')
    const completedAt = new Date('2026-08-20T23:59:59.000Z')
    expect(computeScheduleVariance(scheduledDate, completedAt)).toBe('ON_TIME')
  })

  it('classifies a completion on an earlier UTC calendar day as EARLY', () => {
    const scheduledDate = new Date('2026-08-20T00:00:00.000Z')
    const completedAt = new Date('2026-08-19T23:59:59.000Z')
    expect(computeScheduleVariance(scheduledDate, completedAt)).toBe('EARLY')
  })

  it('classifies a completion several days early as EARLY', () => {
    const scheduledDate = new Date('2026-08-20T00:00:00.000Z')
    const completedAt = new Date('2026-08-15T10:00:00.000Z')
    expect(computeScheduleVariance(scheduledDate, completedAt)).toBe('EARLY')
  })

  it('classifies a completion on a later UTC calendar day as DELAYED', () => {
    const scheduledDate = new Date('2026-08-20T00:00:00.000Z')
    const completedAt = new Date('2026-08-21T00:00:01.000Z')
    expect(computeScheduleVariance(scheduledDate, completedAt)).toBe('DELAYED')
  })

  it('classifies a completion several days late as DELAYED', () => {
    const scheduledDate = new Date('2026-08-20T00:00:00.000Z')
    const completedAt = new Date('2026-08-25T10:00:00.000Z')
    expect(computeScheduleVariance(scheduledDate, completedAt)).toBe('DELAYED')
  })
})

describe('rescheduleSession', () => {
  it('sets originalScheduledDate to the prior scheduledDate on first reschedule', async () => {
    mockFindUnique.mockResolvedValue({
      scheduledDate: new Date('2026-08-20T00:00:00.000Z'),
      originalScheduledDate: null,
    } as never)
    mockUpdate.mockResolvedValue({} as never)

    await rescheduleSession('session_1', new Date('2026-08-22T00:00:00.000Z'), 'coach')

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'session_1' },
      data: {
        originalScheduledDate: new Date('2026-08-20T00:00:00.000Z'),
        rescheduledBy: 'coach',
        rescheduledAt: expect.any(Date),
        scheduledDate: new Date('2026-08-22T00:00:00.000Z'),
      },
    })
  })

  it('preserves an existing originalScheduledDate on a second reschedule', async () => {
    mockFindUnique.mockResolvedValue({
      scheduledDate: new Date('2026-08-22T00:00:00.000Z'),
      originalScheduledDate: new Date('2026-08-20T00:00:00.000Z'),
    } as never)
    mockUpdate.mockResolvedValue({} as never)

    await rescheduleSession('session_1', new Date('2026-08-24T00:00:00.000Z'), 'client')

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'session_1' },
      data: expect.objectContaining({
        originalScheduledDate: new Date('2026-08-20T00:00:00.000Z'),
        rescheduledBy: 'client',
      }),
    })
  })

  it('throws when the session does not exist', async () => {
    mockFindUnique.mockResolvedValue(null as never)

    await expect(
      rescheduleSession('missing_session', new Date('2026-08-22T00:00:00.000Z'), 'system')
    ).rejects.toThrow('missing_session')
  })

  it('recomputes scheduleVariance against the new date when rescheduling a COMPLETED session', async () => {
    mockFindUnique.mockResolvedValue({
      scheduledDate: new Date('2026-08-20T00:00:00.000Z'),
      originalScheduledDate: null,
      status: 'COMPLETED',
      completedAt: new Date('2026-08-20T15:00:00.000Z'),
    } as never)
    mockUpdate.mockResolvedValue({} as never)

    await rescheduleSession('session_1', new Date('2026-08-25T00:00:00.000Z'), 'coach')

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'session_1' },
      data: expect.objectContaining({
        scheduledDate: new Date('2026-08-25T00:00:00.000Z'),
        scheduleVariance: 'EARLY',
      }),
    })
  })

  it('does not include scheduleVariance when rescheduling a non-completed session', async () => {
    mockFindUnique.mockResolvedValue({
      scheduledDate: new Date('2026-08-20T00:00:00.000Z'),
      originalScheduledDate: null,
      status: 'SCHEDULED',
      completedAt: null,
    } as never)
    mockUpdate.mockResolvedValue({} as never)

    await rescheduleSession('session_1', new Date('2026-08-22T00:00:00.000Z'), 'coach')

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'session_1' },
      data: expect.not.objectContaining({ scheduleVariance: expect.anything() }),
    })
  })
})
