import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(async () => ({ userId: 'clerk_t1' })) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/services/notification.service', () => ({
  notifyUser: vi.fn().mockResolvedValue(undefined),
  NOTIFICATION_TYPES: { NEW_MESSAGE: 'NEW_MESSAGE' },
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    sessionExerciseLog: { findFirst: vi.fn() },
    blockExerciseV2: { findUnique: vi.fn() },
  },
}))
vi.mock('@/lib/services/message.service', () => ({
  sendMessage: vi.fn(),
}))
vi.mock('@/lib/services/client.service', () => ({
  getClientIdsForTrainer: vi.fn(),
}))
vi.mock('@/lib/pusher', () => ({
  pusherServer: { trigger: vi.fn().mockResolvedValue(undefined) },
}))

import { notifyUser } from '@/lib/services/notification.service'
import { prisma } from '@/lib/prisma'
import * as messageService from '@/lib/services/message.service'
import { getClientIdsForTrainer } from '@/lib/services/client.service'
import { sendMessageAction, replyToClientNoteAction, sendBroadcastMessageAction } from '../message-actions'

const mockUserFind = vi.mocked(prisma.user.findUnique)
const mockSendMessage = vi.mocked(messageService.sendMessage)
const mockSessionExerciseLogFind = vi.mocked(prisma.sessionExerciseLog.findFirst)
const mockBlockExerciseFind = vi.mocked(prisma.blockExerciseV2.findUnique)
const mockGetClientIds = vi.mocked(getClientIdsForTrainer)

const dbTrainer = { id: 't1', firstName: 'Mike', lastName: 'Chen', role: 'TRAINER' }

function makeMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'm1',
    senderId: 't1',
    recipientId: 'c1',
    content: 'Great work on the squat progression',
    audioUrl: null,
    audioDurationSec: null,
    isInternal: false,
    createdAt: new Date('2026-09-22T12:00:00.000Z'),
    editedAt: null,
    deletedAt: null,
    replyToExerciseName: null,
    replyToNoteExcerpt: null,
    sender: { firstName: 'Mike', lastName: 'Chen', imageUrl: null },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUserFind.mockResolvedValue(dbTrainer as never)
  mockSendMessage.mockImplementation(async (data) =>
    makeMessage({
      recipientId: data.recipientId,
      content: data.content,
      isInternal: data.isInternal ?? false,
    }) as never,
  )
})

describe('sendMessageAction', () => {
  it('notifies the recipient with the sender name and a preview', async () => {
    await sendMessageAction({ recipientId: 'c1', content: 'Great work on the squat progression' })

    expect(notifyUser).toHaveBeenCalledTimes(1)
    const arg = vi.mocked(notifyUser).mock.calls[0][0]
    expect(arg.type).toBe('NEW_MESSAGE')
    expect(arg.userId).toBe('c1')
    expect(arg.email).toMatchObject({ senderName: 'Mike Chen' })
    expect(arg.email!.preview).toContain('squat progression')
  })

  it('does not notify for an internal trainer-only note', async () => {
    await sendMessageAction({ recipientId: 'c1', content: 'internal', isInternal: true })

    expect(notifyUser).not.toHaveBeenCalled()
  })

  it('truncates a long preview to 200 characters', async () => {
    await sendMessageAction({ recipientId: 'c1', content: 'x'.repeat(500) })

    expect((vi.mocked(notifyUser).mock.calls[0][0].email!.preview as string).length)
      .toBeLessThanOrEqual(201)
  })

  it('does not notify when the message itself failed to send', async () => {
    mockSendMessage.mockRejectedValueOnce(new Error('db down'))

    await sendMessageAction({ recipientId: 'c1', content: 'hi' })

    expect(notifyUser).not.toHaveBeenCalled()
  })
})

describe('replyToClientNoteAction', () => {
  it('notifies the client who owns the session', async () => {
    mockSessionExerciseLogFind.mockResolvedValue({
      id: 'log1',
      clientNote: 'Felt heavy today',
      session: {
        clientId: 'c1',
        workout: { program: { trainerId: 't1' } },
      },
    } as never)
    mockBlockExerciseFind.mockResolvedValue({ exercise: { name: 'Back Squat' } } as never)

    await replyToClientNoteAction('s1', 'be1', 'Add 5lb next time')

    expect(vi.mocked(notifyUser).mock.calls[0][0].userId).toBe('c1')
  })
})

describe('sendBroadcastMessageAction', () => {
  beforeEach(() => {
    mockGetClientIds.mockResolvedValue(['c1', 'c2'])
  })

  it('notifies every recipient once', async () => {
    await sendBroadcastMessageAction({ content: 'Gym closed Friday', recipientIds: ['c1', 'c2'] })

    expect(notifyUser).toHaveBeenCalledTimes(2)
    expect(vi.mocked(notifyUser).mock.calls.map((c) => c[0].userId)).toEqual(['c1', 'c2'])
  })

  it('still notifies the rest when one notify call rejects', async () => {
    vi.mocked(notifyUser).mockRejectedValueOnce(new Error('boom'))

    const res = await sendBroadcastMessageAction({ content: 'x', recipientIds: ['c1', 'c2'] })

    expect(notifyUser).toHaveBeenCalledTimes(2)
    expect(res.success).toBe(true)
  })
})
