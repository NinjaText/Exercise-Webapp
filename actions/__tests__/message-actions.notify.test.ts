import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/org-capabilities.server', async () => {
  const { getOrgCapabilities } = await vi.importActual<typeof import('@/lib/org-capabilities')>('@/lib/org-capabilities')
  return { getCapabilitiesForUser: vi.fn(async () => getOrgCapabilities(null)), canCoachInteract: vi.fn(async () => true), filterCoachableClientIds: vi.fn(async (_t: unknown, ids: string[]) => ids) }
})
vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(async () => ({ userId: 'clerk_t1' })) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/services/notification.service', () => ({
  notifyUser: vi.fn().mockResolvedValue(undefined),
  NOTIFICATION_TYPES: { NEW_MESSAGE: 'NEW_MESSAGE' },
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    organization: { findFirst: vi.fn() },
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
import { getCapabilitiesForUser, canCoachInteract, filterCoachableClientIds } from '@/lib/org-capabilities.server'
import { getOrgCapabilities, getUserCapabilities } from '@/lib/org-capabilities'
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

describe('messaging capability (club orgs)', () => {
  const blocked = { success: false, error: "Messaging isn't available for your account." }

  beforeEach(() => {
    vi.mocked(getCapabilitiesForUser).mockResolvedValue(getOrgCapabilities({ type: 'CLUB' }))
    mockGetClientIds.mockResolvedValue(['c1'])
  })

  it('refuses sendMessageAction for a club member without sending or notifying', async () => {
    mockUserFind.mockResolvedValue({ id: 'c9', firstName: 'Club', lastName: 'Member', role: 'CLIENT', clerkOrgId: 'org_club' } as never)
    expect(await sendMessageAction({ recipientId: 'staff', content: 'hello?' })).toEqual(blocked)
    expect(getCapabilitiesForUser).toHaveBeenCalledWith(expect.objectContaining({ id: 'c9', clerkOrgId: 'org_club' }))
    expect(mockSendMessage).not.toHaveBeenCalled()
    expect(notifyUser).not.toHaveBeenCalled()
  })

  it('refuses reply and broadcast too', async () => {
    expect(await replyToClientNoteAction('s1', 'be1', 'hi')).toEqual(blocked)
    expect(await sendBroadcastMessageAction({ content: 'hi', sendToAll: true })).toEqual(blocked)
    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  it('trainer orgs are unaffected (regression)', async () => {
    vi.mocked(getCapabilitiesForUser).mockResolvedValue(getOrgCapabilities(null))
    const result = await sendMessageAction({ recipientId: 'c1', content: 'still works' })
    expect(result.success).toBe(true)
    expect(notifyUser).toHaveBeenCalledTimes(1)
  })
})

describe('pair rule (trainer → client recipient)', () => {
  const blocked = { success: false, error: "Messaging isn't available for your account." }
  const clubTrainer = { ...dbTrainer, clerkOrgId: 'org_club' }
  const noteLog = {
    id: 'log1',
    clientNote: 'Felt heavy today',
    session: { clientId: 'm1', workout: { program: { trainerId: 't1' } } },
  }

  beforeEach(() => {
    mockUserFind.mockResolvedValue(clubTrainer as never)
    vi.mocked(getCapabilitiesForUser).mockResolvedValue(
      getUserCapabilities({ orgType: 'CLUB', role: 'TRAINER', coachingActive: false })
    )
  })

  it('refuses a club trainer → uncoached member', async () => {
    vi.mocked(canCoachInteract).mockResolvedValueOnce(false)
    expect(await sendMessageAction({ recipientId: 'm1', content: 'hi' })).toEqual(blocked)
    expect(canCoachInteract).toHaveBeenCalledWith(expect.objectContaining({ id: 't1', clerkOrgId: 'org_club' }), 'm1')
    expect(mockSendMessage).not.toHaveBeenCalled()
    expect(notifyUser).not.toHaveBeenCalled()
  })

  it('allows a club trainer → coached member', async () => {
    vi.mocked(canCoachInteract).mockResolvedValueOnce(true)
    const res = await sendMessageAction({ recipientId: 'm1', content: 'hi' })
    expect(res.success).toBe(true)
    expect(mockSendMessage).toHaveBeenCalledOnce()
  })

  it('refuses a note reply to an uncoached member', async () => {
    mockSessionExerciseLogFind.mockResolvedValue(noteLog as never)
    mockBlockExerciseFind.mockResolvedValue({ exercise: { name: 'Back Squat' } } as never)
    vi.mocked(canCoachInteract).mockResolvedValueOnce(false)
    expect(await replyToClientNoteAction('s1', 'be1', 'hi')).toEqual(blocked)
    expect(canCoachInteract).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }), 'm1')
    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  it('broadcasts only to members the trainer may message', async () => {
    mockGetClientIds.mockResolvedValue(['m1', 'm2'])
    vi.mocked(filterCoachableClientIds).mockResolvedValueOnce(['m2'])
    const res = await sendBroadcastMessageAction({ content: 'hi', sendToAll: true })
    expect(filterCoachableClientIds).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }), ['m1', 'm2'])
    expect(res).toEqual({ success: true, sentCount: 1 })
    expect(vi.mocked(notifyUser).mock.calls.map((c) => c[0].userId)).toEqual(['m2'])
  })

  it('fails a broadcast when no member is coached', async () => {
    mockGetClientIds.mockResolvedValue(['m1'])
    vi.mocked(filterCoachableClientIds).mockResolvedValueOnce([])
    expect(await sendBroadcastMessageAction({ content: 'hi', sendToAll: true })).toEqual({
      success: false,
      error: 'No valid recipients',
    })
    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  it('applies to a coached club member → their club trainer', async () => {
    mockUserFind.mockResolvedValue({ id: 'm1', firstName: 'M', lastName: 'One', role: 'CLIENT', clerkOrgId: 'org_club' } as never)
    vi.mocked(getCapabilitiesForUser).mockResolvedValue(
      getUserCapabilities({ orgType: 'CLUB', role: 'CLIENT', coachingActive: true })
    )
    vi.mocked(canCoachInteract).mockResolvedValueOnce(true)
    const res = await sendMessageAction({ recipientId: 't1', content: 'hi coach' })
    expect(res.success).toBe(true)
    expect(canCoachInteract).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1', clerkOrgId: 'org_club' }), 't1')
  })

  it('refuses a club member → someone outside their club (same-org rule)', async () => {
    mockUserFind.mockResolvedValue({ id: 'm1', firstName: 'M', lastName: 'One', role: 'CLIENT', clerkOrgId: 'org_club' } as never)
    vi.mocked(getCapabilitiesForUser).mockResolvedValue(
      getUserCapabilities({ orgType: 'CLUB', role: 'CLIENT', coachingActive: true })
    )
    vi.mocked(canCoachInteract).mockResolvedValueOnce(false)
    expect(await sendMessageAction({ recipientId: 't_other', content: 'hi' })).toEqual(blocked)
    expect(mockSendMessage).not.toHaveBeenCalled()
    expect(notifyUser).not.toHaveBeenCalled()
  })

  it('trainer-org client → trainer skips the pair rule (regression)', async () => {
    mockUserFind.mockResolvedValue({ id: 'c1', firstName: 'C', lastName: 'One', role: 'CLIENT', clerkOrgId: 'org_t' } as never)
    vi.mocked(getCapabilitiesForUser).mockResolvedValue(getOrgCapabilities(null))
    const res = await sendMessageAction({ recipientId: 't2', content: 'hi coach' })
    expect(res.success).toBe(true)
    expect(canCoachInteract).not.toHaveBeenCalled()
  })

  it('trainer-org trainer → client is unchanged (regression)', async () => {
    mockUserFind.mockResolvedValue({ ...dbTrainer, clerkOrgId: 'org_t' } as never)
    vi.mocked(getCapabilitiesForUser).mockResolvedValue(getOrgCapabilities(null))
    const res = await sendMessageAction({ recipientId: 'c1', content: 'still works' })
    expect(res.success).toBe(true)
    expect(notifyUser).toHaveBeenCalledTimes(1)
  })
})
