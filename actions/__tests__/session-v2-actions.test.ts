import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    workoutSessionV2: { findUnique: vi.fn(), update: vi.fn() },
    sessionExerciseLog: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    setLog: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    blockExerciseV2: { findUnique: vi.fn() },
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/services/notification.service', () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
  NOTIFICATION_TYPES: { SESSION_COMPLETED: 'SESSION_COMPLETED', EXERCISE_NOTE: 'EXERCISE_NOTE' },
}))
vi.mock('@/lib/email/resend', () => ({
  getResend: vi.fn(() => ({ emails: { send: vi.fn().mockResolvedValue({}) } })),
}))
vi.mock('@/lib/email/templates/session-completed', () => ({ SessionCompletedEmail: vi.fn() }))

import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { completeSessionV2Action, updateSetLogV2Action, markExerciseDoneAction, updateExerciseActualSetsAction } from '../session-v2-actions'

const mockAuth = vi.mocked(auth)
const mockUserFind = vi.mocked(prisma.user.findUnique)
const mockSessionFind = vi.mocked(prisma.workoutSessionV2.findUnique)
const mockSessionUpdate = vi.mocked(prisma.workoutSessionV2.update)
const mockExerciseLogFind = vi.mocked(prisma.sessionExerciseLog.findFirst)
const mockExerciseLogCreate = vi.mocked(prisma.sessionExerciseLog.create)
const mockExerciseLogUpdate = vi.mocked(prisma.sessionExerciseLog.update)
const mockSetLogFind = vi.mocked(prisma.setLog.findFirst)
const mockSetLogCreate = vi.mocked(prisma.setLog.create)
const mockBlockExerciseFind = vi.mocked(prisma.blockExerciseV2.findUnique)

const dbClient = { id: 'client_1', clerkId: 'clerk_1', firstName: 'Jane', lastName: 'Doe', role: 'CLIENT' }

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('completeSessionV2Action', () => {
  it('stamps scheduleVariance="ON_TIME" when completed the same UTC day as scheduled', async () => {
    vi.setSystemTime(new Date('2026-08-20T15:00:00.000Z'))
    mockAuth.mockResolvedValue({ userId: 'clerk_1' } as never)
    mockUserFind.mockResolvedValue(dbClient as never)
    mockSessionFind
      .mockResolvedValueOnce({ scheduledDate: new Date('2026-08-20T00:00:00.000Z') } as never)
      .mockResolvedValue(null as never)
    mockSessionUpdate.mockResolvedValue({} as never)

    const result = await completeSessionV2Action('session_1', 7, 'felt good')

    expect(result.success).toBe(true)
    expect(mockSessionUpdate).toHaveBeenCalledWith({
      where: { id: 'session_1', clientId: 'client_1' },
      data: {
        status: 'COMPLETED',
        completedAt: new Date('2026-08-20T15:00:00.000Z'),
        overallRPE: 7,
        overallNotes: 'felt good',
        scheduleVariance: 'ON_TIME',
      },
    })
  })

  it('stamps scheduleVariance="EARLY" when completed before the scheduled UTC day', async () => {
    vi.setSystemTime(new Date('2026-08-18T15:00:00.000Z'))
    mockAuth.mockResolvedValue({ userId: 'clerk_1' } as never)
    mockUserFind.mockResolvedValue(dbClient as never)
    mockSessionFind
      .mockResolvedValueOnce({ scheduledDate: new Date('2026-08-20T00:00:00.000Z') } as never)
      .mockResolvedValue(null as never)
    mockSessionUpdate.mockResolvedValue({} as never)

    await completeSessionV2Action('session_1')

    expect(mockSessionUpdate).toHaveBeenCalledWith({
      where: { id: 'session_1', clientId: 'client_1' },
      data: expect.objectContaining({ scheduleVariance: 'EARLY' }),
    })
  })

  it('returns an error and skips the update when the session is not found', async () => {
    mockAuth.mockResolvedValue({ userId: 'clerk_1' } as never)
    mockUserFind.mockResolvedValue(dbClient as never)
    mockSessionFind.mockResolvedValue(null as never)

    const result = await completeSessionV2Action('missing_session')

    expect(result.success).toBe(false)
    expect(mockSessionUpdate).not.toHaveBeenCalled()
  })

  it('stamps ON_TIME against a rescheduled session\'s CURRENT scheduledDate, not its original', async () => {
    // Regression guard for the adherence-neutrality rule: a session that was
    // rescheduled and then completed on the new date must read as ON_TIME.
    // completeSessionV2Action always fetches the session's current scheduledDate
    // fresh from the DB, so this passes by construction as long as nothing
    // reintroduces a cached/original date into this path.
    vi.setSystemTime(new Date('2026-08-24T12:00:00.000Z'))
    mockAuth.mockResolvedValue({ userId: 'clerk_1' } as never)
    mockUserFind.mockResolvedValue(dbClient as never)
    mockSessionFind
      // scheduledDate reflects the NEW date after a reschedule away from an
      // original of 2026-08-20 (originalScheduledDate is irrelevant here).
      .mockResolvedValueOnce({ scheduledDate: new Date('2026-08-24T00:00:00.000Z') } as never)
      .mockResolvedValue(null as never)
    mockSessionUpdate.mockResolvedValue({} as never)

    await completeSessionV2Action('session_1')

    expect(mockSessionUpdate).toHaveBeenCalledWith({
      where: { id: 'session_1', clientId: 'client_1' },
      data: expect.objectContaining({ scheduleVariance: 'ON_TIME' }),
    })
  })
})

describe('updateSetLogV2Action', () => {
  it('transitions a MISSED session to IN_PROGRESS with startedAt on first interaction', async () => {
    mockAuth.mockResolvedValue({ userId: 'clerk_1' } as never)
    mockUserFind.mockResolvedValue(dbClient as never)
    mockSessionFind.mockResolvedValue({ id: 'session_1', status: 'MISSED' } as never)
    mockSessionUpdate.mockResolvedValue({} as never)
    mockExerciseLogFind.mockResolvedValue(null as never)
    mockBlockExerciseFind.mockResolvedValue({ id: 'be_1', orderIndex: 0 } as never)
    mockExerciseLogCreate.mockResolvedValue({ id: 'log_1' } as never)
    mockSetLogFind.mockResolvedValue(null as never)
    mockSetLogCreate.mockResolvedValue({ id: 'setlog_1' } as never)

    const result = await updateSetLogV2Action('session_1', 'be_1', 0, { actualReps: 10 })

    expect(result.success).toBe(true)
    expect(mockSessionUpdate).toHaveBeenCalledWith({
      where: { id: 'session_1' },
      data: { status: 'IN_PROGRESS', startedAt: expect.any(Date) },
    })
  })
})

describe('markExerciseDoneAction', () => {
  it('transitions a MISSED session to IN_PROGRESS with startedAt on first interaction', async () => {
    mockAuth.mockResolvedValue({ userId: 'clerk_1' } as never)
    mockUserFind.mockResolvedValue(dbClient as never)
    mockSessionFind.mockResolvedValue({ status: 'MISSED' } as never)
    mockSessionUpdate.mockResolvedValue({} as never)
    mockBlockExerciseFind.mockResolvedValue({ id: 'be_1', orderIndex: 0 } as never)
    mockExerciseLogFind.mockResolvedValue(null as never)
    mockExerciseLogCreate.mockResolvedValue({ id: 'log_1' } as never)
    mockSetLogFind.mockResolvedValue(null as never)
    mockSetLogCreate.mockResolvedValue({ id: 'setlog_1' } as never)

    const result = await markExerciseDoneAction('session_1', 'be_1', 1, true)

    expect(result.success).toBe(true)
    expect(mockSessionUpdate).toHaveBeenCalledWith({
      where: { id: 'session_1' },
      data: { status: 'IN_PROGRESS', startedAt: expect.any(Date) },
    })
  })
})

describe('updateExerciseActualSetsAction', () => {
  it('allows a client updating actual sets on their own session', async () => {
    mockAuth.mockResolvedValue({ userId: 'clerk_1' } as never)
    mockUserFind.mockResolvedValue(dbClient as never)
    mockSessionFind.mockResolvedValue({ id: 'session_1', clientId: 'client_1' } as never)
    mockExerciseLogFind.mockResolvedValue({ id: 'log_1' } as never)
    mockExerciseLogUpdate.mockResolvedValue({} as never)

    const result = await updateExerciseActualSetsAction('session_1', 'be_1', 3)

    expect(result.success).toBe(true)
    expect(mockExerciseLogUpdate).toHaveBeenCalledWith({
      where: { id: 'log_1' },
      data: { actualSets: 3 },
    })
  })

  it("rejects updating actual sets on another client's session", async () => {
    mockAuth.mockResolvedValue({ userId: 'clerk_1' } as never)
    mockUserFind.mockResolvedValue(dbClient as never)
    mockSessionFind.mockResolvedValue(null as never)

    const result = await updateExerciseActualSetsAction('session_1', 'be_1', 3)

    expect(result.success).toBe(false)
    expect(mockExerciseLogFind).not.toHaveBeenCalled()
    expect(mockExerciseLogUpdate).not.toHaveBeenCalled()
  })
})
