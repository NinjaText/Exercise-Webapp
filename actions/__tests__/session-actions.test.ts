import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    workoutSessionV2: { findUnique: vi.fn(), update: vi.fn() },
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { rescheduleSessionAction } from '../session-actions'

const mockAuth = vi.mocked(auth)
const mockUserFind = vi.mocked(prisma.user.findUnique)
const mockSessionFind = vi.mocked(prisma.workoutSessionV2.findUnique)
const mockSessionUpdate = vi.mocked(prisma.workoutSessionV2.update)

const dbTrainer = { id: 'trainer_1', clerkId: 'clerk_1', role: 'TRAINER' }
const dbClient = { id: 'client_1', clerkId: 'clerk_1', role: 'CLIENT' }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('rescheduleSessionAction', () => {
  it('derives rescheduledBy="coach" for a TRAINER user', async () => {
    mockAuth.mockResolvedValue({ userId: 'clerk_1' } as never)
    mockUserFind.mockResolvedValue(dbTrainer as never)
    mockSessionFind
      .mockResolvedValueOnce({
        clientId: 'client_1',
        workout: { program: { trainerId: 'trainer_1' } },
      } as never)
      .mockResolvedValueOnce({
        scheduledDate: new Date('2026-08-20T00:00:00.000Z'),
        originalScheduledDate: null,
      } as never)
    mockSessionUpdate.mockResolvedValue({ id: 'session_1' } as never)

    const result = await rescheduleSessionAction('session_1', '2026-08-22T00:00:00.000Z')

    expect(result.success).toBe(true)
    expect(mockSessionUpdate).toHaveBeenCalledWith({
      where: { id: 'session_1' },
      data: expect.objectContaining({ rescheduledBy: 'coach' }),
    })
  })

  it('derives rescheduledBy="client" for a CLIENT user', async () => {
    mockAuth.mockResolvedValue({ userId: 'clerk_1' } as never)
    mockUserFind.mockResolvedValue(dbClient as never)
    mockSessionFind
      .mockResolvedValueOnce({
        clientId: 'client_1',
        workout: { program: { trainerId: 'trainer_1' } },
      } as never)
      .mockResolvedValueOnce({
        scheduledDate: new Date('2026-08-20T00:00:00.000Z'),
        originalScheduledDate: null,
      } as never)
    mockSessionUpdate.mockResolvedValue({ id: 'session_1' } as never)

    const result = await rescheduleSessionAction('session_1', '2026-08-22T00:00:00.000Z')

    expect(result.success).toBe(true)
    expect(mockSessionUpdate).toHaveBeenCalledWith({
      where: { id: 'session_1' },
      data: expect.objectContaining({ rescheduledBy: 'client' }),
    })
  })
})

describe('rescheduleSessionAction — ownership', () => {
  it('allows a trainer to reschedule a session in their own program', async () => {
    mockAuth.mockResolvedValue({ userId: 'clerk_1' } as never)
    mockUserFind.mockResolvedValue(dbTrainer as never)
    mockSessionFind
      .mockResolvedValueOnce({ clientId: 'client_1', workout: { program: { trainerId: 'trainer_1' } } } as never)
      .mockResolvedValueOnce({ scheduledDate: new Date('2026-08-20T00:00:00.000Z'), originalScheduledDate: null } as never)
    mockSessionUpdate.mockResolvedValue({ id: 'session_1' } as never)

    const result = await rescheduleSessionAction('session_1', '2026-08-22T00:00:00.000Z')

    expect(result.success).toBe(true)
  })

  it('rejects a trainer rescheduling a session outside their own program', async () => {
    mockAuth.mockResolvedValue({ userId: 'clerk_1' } as never)
    mockUserFind.mockResolvedValue(dbTrainer as never)
    mockSessionFind.mockResolvedValueOnce({
      clientId: 'client_1',
      workout: { program: { trainerId: 'someone_else' } },
    } as never)

    const result = await rescheduleSessionAction('session_1', '2026-08-22T00:00:00.000Z')

    expect(result).toEqual({ success: false, error: 'Session not found' })
    expect(mockSessionUpdate).not.toHaveBeenCalled()
  })

  it('allows a client to reschedule their own session', async () => {
    mockAuth.mockResolvedValue({ userId: 'clerk_1' } as never)
    mockUserFind.mockResolvedValue(dbClient as never)
    mockSessionFind
      .mockResolvedValueOnce({ clientId: 'client_1', workout: { program: { trainerId: 'trainer_1' } } } as never)
      .mockResolvedValueOnce({ scheduledDate: new Date('2026-08-20T00:00:00.000Z'), originalScheduledDate: null } as never)
    mockSessionUpdate.mockResolvedValue({ id: 'session_1' } as never)

    const result = await rescheduleSessionAction('session_1', '2026-08-22T00:00:00.000Z')

    expect(result.success).toBe(true)
  })

  it("rejects a client rescheduling another client's session", async () => {
    mockAuth.mockResolvedValue({ userId: 'clerk_1' } as never)
    mockUserFind.mockResolvedValue(dbClient as never)
    mockSessionFind.mockResolvedValueOnce({
      clientId: 'someone_else',
      workout: { program: { trainerId: 'trainer_1' } },
    } as never)

    const result = await rescheduleSessionAction('session_1', '2026-08-22T00:00:00.000Z')

    expect(result).toEqual({ success: false, error: 'Session not found' })
    expect(mockSessionUpdate).not.toHaveBeenCalled()
  })

  it('returns the same error shape when the session does not exist', async () => {
    mockAuth.mockResolvedValue({ userId: 'clerk_1' } as never)
    mockUserFind.mockResolvedValue(dbTrainer as never)
    mockSessionFind.mockResolvedValueOnce(null as never)

    const result = await rescheduleSessionAction('session_1', '2026-08-22T00:00:00.000Z')

    expect(result).toEqual({ success: false, error: 'Session not found' })
    expect(mockSessionUpdate).not.toHaveBeenCalled()
  })

  it('gracefully handles a Prisma error thrown by the ownership-check query', async () => {
    mockAuth.mockResolvedValue({ userId: 'clerk_1' } as never)
    mockUserFind.mockResolvedValue(dbTrainer as never)
    mockSessionFind.mockRejectedValueOnce(new Error('Invalid ObjectId'))

    const result = await rescheduleSessionAction('not-a-valid-id', '2026-08-22T00:00:00.000Z')

    expect(result).toEqual({ success: false, error: 'Failed to reschedule session' })
    expect(mockSessionUpdate).not.toHaveBeenCalled()
  })
})
