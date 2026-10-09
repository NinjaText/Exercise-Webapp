import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: { message: { updateMany: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() } },
}))

import { prisma } from '@/lib/prisma'
import { markRead, getThread, getInboxThreads } from '../message.service'

const mockUpdateMany = vi.mocked(prisma.message.updateMany)

beforeEach(() => vi.clearAllMocks())

describe('markRead', () => {
  it('sets isRead and a readAt timestamp on unread messages from the sender', async () => {
    mockUpdateMany.mockResolvedValue({ count: 2 } as any)

    await markRead('sender_id', 'recipient_id')

    expect(mockUpdateMany).toHaveBeenCalledOnce()
    const arg = mockUpdateMany.mock.calls[0][0] as any
    expect(arg.where).toEqual({ senderId: 'sender_id', recipientId: 'recipient_id', isRead: false })
    expect(arg.data.isRead).toBe(true)
    expect(arg.data.readAt).toBeInstanceOf(Date)
  })
})

describe('getThread sentByAdminId', () => {
  const row = { id: 'm1', content: 'hi', deletedAt: null, sentByAdminId: 'admin_1' }

  it('strips it from the client view', async () => {
    vi.mocked(prisma.message.findMany).mockResolvedValue([row] as any)
    const [m] = await getThread('t', 'c', { includeInternal: false })
    expect(m).not.toHaveProperty('sentByAdminId')
  })

  it('strips it by default even when includeInternal is set', async () => {
    vi.mocked(prisma.message.findMany).mockResolvedValue([row] as any)
    const [m] = await getThread('t', 'c', { includeInternal: true })
    expect(m).not.toHaveProperty('sentByAdminId')
  })

  it('keeps it for the staff view', async () => {
    vi.mocked(prisma.message.findMany).mockResolvedValue([row] as any)
    const [m] = await getThread('t', 'c', { includeInternal: true, viewer: 'staff' })
    expect(m.sentByAdminId).toBe('admin_1')
  })
})

describe('getInboxThreads sentByAdminId', () => {
  it('omits it from lastMessage', async () => {
    const user = { id: 'c', firstName: 'C', lastName: 'C', email: 'e', imageUrl: null, role: 'CLIENT' }
    vi.mocked(prisma.message.findMany).mockResolvedValue([
      { id: 'm1', content: 'hi', deletedAt: null, createdAt: new Date(), senderId: 't', recipientId: 'c', sentByAdminId: 'admin_1', sender: { ...user, id: 't' }, recipient: user },
    ] as any)
    vi.mocked(prisma.message.groupBy).mockResolvedValue([] as any)
    const [thread] = await getInboxThreads('c')
    expect(thread.lastMessage).not.toHaveProperty('sentByAdminId')
  })
})
