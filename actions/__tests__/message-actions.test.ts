import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/services/message.service', () => ({
  sendMessage: vi.fn(),
  markRead: vi.fn(),
}))
vi.mock('@/lib/services/client.service', () => ({
  getClientIdsForTrainer: vi.fn(),
}))
vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique: vi.fn() }, message: { create: vi.fn(), updateMany: vi.fn() } },
}))
vi.mock('@/lib/pusher', () => ({ pusherServer: { trigger: vi.fn() } }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/services/notification.service', () => ({
  notifyUser: vi.fn().mockResolvedValue(undefined),
  NOTIFICATION_TYPES: { NEW_MESSAGE: 'NEW_MESSAGE' },
}))

import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { pusherServer } from '@/lib/pusher'
import * as messageService from '@/lib/services/message.service'
import { getClientIdsForTrainer } from '@/lib/services/client.service'
import {
  sendMessageAction,
  markMessagesReadAction,
  sendBroadcastMessageAction,
} from '../message-actions'

const mockAuth = vi.mocked(auth)
const mockFindUnique = vi.mocked(prisma.user.findUnique)
const mockUpdateMany = vi.mocked(prisma.message.updateMany)
const mockTrigger = vi.mocked(pusherServer.trigger)
const mockSendMessage = vi.mocked(messageService.sendMessage)
const mockMarkRead = vi.mocked(messageService.markRead)
const mockGetClientIds = vi.mocked(getClientIdsForTrainer)

beforeEach(() => vi.clearAllMocks())

const baseMessage = {
  id: 'msg_1',
  senderId: 'sender_id',
  recipientId: 'recipient_id',
  content: 'Hello',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  sender: { firstName: 'Alice', lastName: 'Smith', imageUrl: null },
  recipient: { firstName: 'Bob', lastName: 'Jones', imageUrl: null },
}

describe('sendMessageAction', () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue({ userId: 'clerk_123' } as any)
    mockFindUnique.mockResolvedValue({ id: 'sender_id', firstName: 'Alice', lastName: 'Smith', imageUrl: null } as any)
    mockSendMessage.mockResolvedValue(baseMessage as any)
    mockTrigger.mockResolvedValue({} as any)
  })

  it('saves the message and returns success', async () => {
    const result = await sendMessageAction({ recipientId: 'recipient_id', content: 'Hello' })
    expect(result.success).toBe(true)
    expect(mockSendMessage).toHaveBeenCalledOnce()
  })

  it('fires a new-message event on the thread channel', async () => {
    await sendMessageAction({ recipientId: 'recipient_id', content: 'Hello' })
    // Allow the fire-and-forget Promise.all to resolve
    await new Promise((r) => setTimeout(r, 0))
    const threadTrigger = mockTrigger.mock.calls.find((c) => (c[0] as string).startsWith('private-thread-'))
    expect(threadTrigger).toBeDefined()
    expect(threadTrigger![1]).toBe('new-message')
    expect(threadTrigger![2]).toMatchObject({ id: 'msg_1', content: 'Hello' })
  })

  it('fires a new-message event on the recipients inbox channel', async () => {
    await sendMessageAction({ recipientId: 'recipient_id', content: 'Hello' })
    await new Promise((r) => setTimeout(r, 0))
    const inboxTrigger = mockTrigger.mock.calls.find((c) => c[0] === 'presence-inbox-recipient_id')
    expect(inboxTrigger).toBeDefined()
    expect(inboxTrigger![1]).toBe('new-message')
  })

  it('still returns success when Pusher trigger throws', async () => {
    mockTrigger.mockRejectedValue(new Error('Pusher unavailable'))
    const result = await sendMessageAction({ recipientId: 'recipient_id', content: 'Hello' })
    expect(result.success).toBe(true)
  })
})

describe('markMessagesReadAction', () => {
  it('fires a messages-read event on the thread channel', async () => {
    mockAuth.mockResolvedValue({ userId: 'clerk_123' } as any)
    mockFindUnique.mockResolvedValue({ id: 'reader_id' } as any)
    mockUpdateMany.mockResolvedValue({ count: 2 } as any)
    mockMarkRead.mockResolvedValue({ count: 2 } as any)
    mockTrigger.mockResolvedValue({} as any)

    await markMessagesReadAction('sender_id')
    await new Promise((r) => setTimeout(r, 0))

    const call = mockTrigger.mock.calls.find((c) => (c[0] as string).startsWith('private-thread-'))
    expect(call).toBeDefined()
    expect(call![1]).toBe('messages-read')
    expect(call![2]).toEqual({ readByUserId: 'reader_id' })
  })
})

describe('sendBroadcastMessageAction', () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue({ userId: 'clerk_trainer' } as any)
    mockFindUnique.mockResolvedValue({ id: 'trainer_id', role: 'TRAINER' } as any)
    mockGetClientIds.mockResolvedValue(['client_1', 'client_2', 'client_3'])
    mockSendMessage.mockImplementation(
      async ({ recipientId, content }: any) =>
        ({ ...baseMessage, senderId: 'trainer_id', recipientId, content }) as any,
    )
    mockTrigger.mockResolvedValue({} as any)
  })

  it('rejects non-trainers', async () => {
    mockFindUnique.mockResolvedValue({ id: 'client_id', role: 'CLIENT' } as any)
    const result = await sendBroadcastMessageAction({ recipientIds: ['client_1'], content: 'Hi' })
    expect(result.success).toBe(false)
    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  it('sends to each selected recipient in the roster', async () => {
    const result = await sendBroadcastMessageAction({
      recipientIds: ['client_1', 'client_2'],
      content: 'Hello team',
    })
    expect(result.success).toBe(true)
    expect(result.success && result.sentCount).toBe(2)
    expect(mockSendMessage).toHaveBeenCalledTimes(2)
  })

  it('drops recipient ids that are not in the trainer roster', async () => {
    const result = await sendBroadcastMessageAction({
      recipientIds: ['client_1', 'not_my_client'],
      content: 'Hello',
    })
    expect(result.success).toBe(true)
    expect(result.success && result.sentCount).toBe(1)
    expect(mockSendMessage).toHaveBeenCalledOnce()
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: 'client_1' }),
    )
  })

  it('resolves the full roster server-side when sendToAll is set', async () => {
    const result = await sendBroadcastMessageAction({ sendToAll: true, content: 'Hi all' })
    expect(result.success).toBe(true)
    expect(result.success && result.sentCount).toBe(3)
    expect(mockSendMessage).toHaveBeenCalledTimes(3)
  })

  it('fails when no valid recipients resolve', async () => {
    const result = await sendBroadcastMessageAction({
      recipientIds: ['not_my_client'],
      content: 'Hi',
    })
    expect(result.success).toBe(false)
    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  it('fires new-message events for each delivered message', async () => {
    await sendBroadcastMessageAction({ recipientIds: ['client_1', 'client_2'], content: 'Hi' })
    await new Promise((r) => setTimeout(r, 0))
    const inbox1 = mockTrigger.mock.calls.find((c) => c[0] === 'presence-inbox-client_1')
    const inbox2 = mockTrigger.mock.calls.find((c) => c[0] === 'presence-inbox-client_2')
    expect(inbox1).toBeDefined()
    expect(inbox2).toBeDefined()
  })
})
