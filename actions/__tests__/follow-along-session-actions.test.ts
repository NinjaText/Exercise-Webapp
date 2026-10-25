import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    workoutSessionV2: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/services/notification.service', () => ({
  notifyUser: vi.fn().mockResolvedValue(undefined),
  NOTIFICATION_TYPES: { SESSION_COMPLETED: 'SESSION_COMPLETED', EXERCISE_NOTE: 'EXERCISE_NOTE' },
}))
vi.mock('@/lib/services/audit-log.service', async () => {
  const actual = await vi.importActual<typeof import('@/lib/services/audit-log.service')>(
    '@/lib/services/audit-log.service'
  )
  return { ...actual, logUserAudit: vi.fn().mockResolvedValue(undefined) }
})
vi.mock('@/lib/org-capabilities.server', async () => {
  const { getOrgCapabilities } = await vi.importActual<typeof import('@/lib/org-capabilities')>('@/lib/org-capabilities')
  return {
    getCapabilitiesForUser: vi.fn(async () => getOrgCapabilities(null)),
    canCoachInteract: vi.fn(async () => true),
  }
})
vi.mock('@/lib/services/context-message.service', () => ({ sendContextMessageToTrainer: vi.fn() }))

import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { notifyUser } from '@/lib/services/notification.service'
import { logUserAudit } from '@/lib/services/audit-log.service'
import { getCapabilitiesForUser, canCoachInteract } from '@/lib/org-capabilities.server'
import { getOrgCapabilities } from '@/lib/org-capabilities'
import { sendContextMessageToTrainer } from '@/lib/services/context-message.service'
import { completeFollowAlongSessionAction } from '../session-v2-actions'

const mockAuth = vi.mocked(auth)
const mockUserFind = vi.mocked(prisma.user.findUnique)
const mockSessionFind = vi.mocked(prisma.workoutSessionV2.findUnique)
const mockSessionUpdate = vi.mocked(prisma.workoutSessionV2.updateMany)
const mockLogUserAudit = vi.mocked(logUserAudit)
const mockGetCaps = vi.mocked(getCapabilitiesForUser)
const mockCanCoach = vi.mocked(canCoachInteract)
const mockSendContext = vi.mocked(sendContextMessageToTrainer)

const dbClient = { id: 'client_1', clerkId: 'clerk_1', firstName: 'Jane', lastName: 'Doe', role: 'CLIENT' }

function videoSession(overrides: Record<string, unknown> = {}) {
  return {
    status: 'IN_PROGRESS',
    scheduledDate: new Date('2026-08-20T00:00:00.000Z'),
    startedAt: new Date('2026-08-20T14:40:00.000Z'),
    workout: {
      name: 'Mobility flow',
      videoUrl: 'https://media.example.com/follow-along/t1/a.mp4',
      // Day 12 of a 90-day program.
      weekIndex: 1,
      dayIndex: 4,
      program: {
        trainerId: 'trainer_1',
        contentFormat: 'FOLLOW_ALONG',
        durationWeeks: 13,
        workouts: [
          { weekIndex: 0, dayIndex: 0 },
          { weekIndex: 1, dayIndex: 4 },
          { weekIndex: 12, dayIndex: 5 },
        ],
      },
    },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-20T15:00:00.000Z'))
  mockAuth.mockResolvedValue({ userId: 'clerk_1' } as never)
  mockUserFind.mockResolvedValue(dbClient as never)
  mockSessionUpdate.mockResolvedValue({ count: 1 } as never)
  mockCanCoach.mockResolvedValue(true)
  mockSendContext.mockResolvedValue({ id: 'msg_1' } as never)
  // First lookup is the action's own; later ones are the notification helpers'.
  mockSessionFind.mockResolvedValueOnce(videoSession() as never).mockResolvedValue(null as never)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('completeFollowAlongSessionAction', () => {
  it('stores rating, comment, watched time and duration on the shared completion path', async () => {
    const result = await completeFollowAlongSessionAction({
      sessionId: 'session_1',
      feelingRating: 'JUST_RIGHT',
      comment: '  Loved the cooldown  ',
      watchedSeconds: 880,
    })

    expect(result).toEqual({ success: true, data: { messageSent: true, alreadyCompleted: false } })
    expect(mockSessionFind.mock.calls[0][0]).toMatchObject({ where: { id: 'session_1', clientId: 'client_1' } })
    expect(mockSessionUpdate).toHaveBeenCalledWith({
      where: { id: 'session_1', clientId: 'client_1', status: { not: 'COMPLETED' } },
      data: {
        status: 'COMPLETED',
        completedAt: new Date('2026-08-20T15:00:00.000Z'),
        overallRPE: undefined,
        overallNotes: 'Loved the cooldown',
        scheduleVariance: 'ON_TIME',
        feelingRating: 'JUST_RIGHT',
        watchedSeconds: 880,
        durationMinutes: 15,
      },
    })
  })

  it('audits both the completion and the feedback', async () => {
    await completeFollowAlongSessionAction({ sessionId: 'session_1', feelingRating: 'HARD', watchedSeconds: 60 })

    const actions = await Promise.all(mockLogUserAudit.mock.calls.map(([, build]) => build()))
    expect(actions.map((a) => a.action)).toEqual(['WORKOUT_COMPLETED', 'WORKOUT_FEEDBACK_SUBMITTED'])
    expect(actions[0].metadata).toMatchObject({ durationMinutes: 1 })
    expect(actions[1].metadata).toEqual({ feelingRating: 'HARD', hasComment: false })
  })

  it("sends the comment to the program's trainer with WORKOUT_FEEDBACK context", async () => {
    await completeFollowAlongSessionAction({
      sessionId: 'session_1',
      feelingRating: 'JUST_RIGHT',
      comment: 'Loved it',
      watchedSeconds: 900,
    })

    expect(mockCanCoach).toHaveBeenCalledWith(expect.objectContaining({ id: 'client_1' }), 'trainer_1')
    expect(mockSendContext).toHaveBeenCalledWith({
      client: { id: 'client_1', firstName: 'Jane', lastName: 'Doe' },
      trainerId: 'trainer_1',
      content: 'Loved it',
      context: {
        kind: 'WORKOUT_FEEDBACK',
        refId: 'session_1',
        title: 'Mobility flow',
        excerpt: 'Felt: Just right · Day 12 of 90',
      },
    })
  })

  it('does not message the trainer when there is no comment', async () => {
    const result = await completeFollowAlongSessionAction({
      sessionId: 'session_1',
      feelingRating: 'GREAT',
      comment: '   ',
      watchedSeconds: 900,
    })

    expect(result).toEqual({ success: true, data: { messageSent: false, alreadyCompleted: false } })
    expect(mockSendContext).not.toHaveBeenCalled()
  })

  it('does not message the trainer when the client has no messaging capability', async () => {
    mockGetCaps.mockResolvedValue({ ...getOrgCapabilities(null), messaging: false } as never)

    const result = await completeFollowAlongSessionAction({
      sessionId: 'session_1',
      comment: 'Hello?',
      watchedSeconds: 900,
    })

    expect(result).toEqual({ success: true, data: { messageSent: false, alreadyCompleted: false } })
    expect(mockSendContext).not.toHaveBeenCalled()
    expect(mockSessionUpdate).toHaveBeenCalled()
  })

  it('still completes when sending the message fails', async () => {
    mockSendContext.mockRejectedValue(new Error('pusher down'))

    const result = await completeFollowAlongSessionAction({ sessionId: 'session_1', comment: 'Hi', watchedSeconds: 30 })

    expect(result).toEqual({ success: true, data: { messageSent: false, alreadyCompleted: false } })
    expect(mockSessionUpdate).toHaveBeenCalled()
  })

  it("rejects another client's session (ownership is part of the lookup)", async () => {
    mockSessionFind.mockReset().mockResolvedValue(null as never)

    const result = await completeFollowAlongSessionAction({ sessionId: 'session_x', watchedSeconds: 10 })

    expect(result.success).toBe(false)
    expect(mockSessionUpdate).not.toHaveBeenCalled()
  })

  it('rejects a session that is not a video workout', async () => {
    mockSessionFind
      .mockReset()
      .mockResolvedValueOnce(videoSession({ workout: { ...videoSession().workout, videoUrl: null } }) as never)

    const result = await completeFollowAlongSessionAction({ sessionId: 'session_1', watchedSeconds: 10 })

    expect(result.success).toBe(false)
    expect(mockSessionUpdate).not.toHaveBeenCalled()
  })

  it('treats an already completed session as done without re-sending anything', async () => {
    mockSessionFind.mockReset().mockResolvedValueOnce(videoSession({ status: 'COMPLETED' }) as never)

    const result = await completeFollowAlongSessionAction({ sessionId: 'session_1', comment: 'again', watchedSeconds: 10 })

    expect(result).toEqual({ success: true, data: { messageSent: false, alreadyCompleted: true } })
    expect(mockSessionUpdate).not.toHaveBeenCalled()
    expect(mockSendContext).not.toHaveBeenCalled()
  })

  it('loses the atomic claim to a concurrent submit: no audit, no message', async () => {
    mockSessionUpdate.mockResolvedValue({ count: 0 } as never)

    const result = await completeFollowAlongSessionAction({
      sessionId: 'session_1',
      feelingRating: 'GREAT',
      comment: 'twice',
      watchedSeconds: 10,
    })

    expect(result).toEqual({ success: true, data: { messageSent: false, alreadyCompleted: true } })
    expect(mockLogUserAudit).not.toHaveBeenCalled()
    expect(mockSendContext).not.toHaveBeenCalled()
  })

  it('does not message when the pair rule forbids it (club coaching)', async () => {
    mockCanCoach.mockResolvedValue(false)

    const result = await completeFollowAlongSessionAction({ sessionId: 'session_1', comment: 'hi', watchedSeconds: 10 })

    expect(result).toEqual({ success: true, data: { messageSent: false, alreadyCompleted: false } })
    expect(mockSendContext).not.toHaveBeenCalled()
  })

  it('refuses to complete with nothing watched unless the video ended', async () => {
    const stopped = await completeFollowAlongSessionAction({ sessionId: 'session_1', watchedSeconds: 0 })
    expect(stopped.success).toBe(false)
    expect(mockUserFind).not.toHaveBeenCalled()

    const ended = await completeFollowAlongSessionAction({ sessionId: 'session_1', watchedSeconds: 0, videoEnded: true })
    expect(ended.success).toBe(true)
  })

  it('validates the input before touching the database', async () => {
    const tooLong = await completeFollowAlongSessionAction({
      sessionId: 'session_1',
      comment: 'x'.repeat(501),
      watchedSeconds: 10,
    })
    const badRating = await completeFollowAlongSessionAction({
      sessionId: 'session_1',
      feelingRating: 'MEH' as never,
      watchedSeconds: 10,
    })

    expect(tooLong.success).toBe(false)
    expect(badRating.success).toBe(false)
    expect(mockUserFind).not.toHaveBeenCalled()
  })

  it('returns Unauthorized without a signed-in user', async () => {
    mockAuth.mockResolvedValue({ userId: null } as never)

    const result = await completeFollowAlongSessionAction({ sessionId: 'session_1', watchedSeconds: 10 })

    expect(result).toEqual({ success: false, error: 'Unauthorized' })
  })

  it('fires the existing trainer completion notification path', async () => {
    mockSessionFind
      .mockReset()
      .mockResolvedValueOnce(videoSession() as never)
      .mockResolvedValueOnce({
        workout: {
          name: 'Mobility flow',
          program: {
            id: 'program_1',
            name: '90 day reset',
            trainer: { id: 'trainer_1', firstName: 'Tom', lastName: 'Coach', email: 't@example.com' },
          },
        },
      } as never)
      .mockResolvedValue(null as never)

    await completeFollowAlongSessionAction({ sessionId: 'session_1', watchedSeconds: 900 })

    expect(vi.mocked(notifyUser)).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'trainer_1', type: 'SESSION_COMPLETED' })
    )
  })
})
