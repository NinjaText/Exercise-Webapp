import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/org-capabilities.server', () => ({ getCapabilitiesForUser: vi.fn(), canCoachInteract: vi.fn(async () => true), filterCoachableClientIds: vi.fn(async (_t: unknown, ids: string[]) => ids) }))
vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(async () => ({ userId: 'clerk_1' })) }))
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: vi.fn() } } }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@aws-sdk/client-s3', () => ({
  PutObjectCommand: vi.fn(),
  DeleteObjectCommand: vi.fn(),
  CopyObjectCommand: vi.fn(),
}))
vi.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: vi.fn(async () => 'https://r2/presigned') }))
vi.mock('@/lib/r2', () => ({
  getR2Client: vi.fn(() => ({ send: vi.fn().mockResolvedValue({}) })),
  R2_BUCKET_NAME: 'bucket',
  R2_PUBLIC_URL: 'https://r2.example.com',
}))
vi.mock('@/lib/services/message.service', () => ({ sendVoiceMessage: vi.fn() }))
vi.mock('../message-actions', () => ({ broadcastNewMessage: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import * as messageService from '@/lib/services/message.service'
import { getCapabilitiesForUser, canCoachInteract } from '@/lib/org-capabilities.server'
import { getOrgCapabilities, getUserCapabilities, MESSAGING_UNAVAILABLE } from '@/lib/org-capabilities'
import { generateVoiceMessageUploadUrl, confirmVoiceMessage } from '../voice-message-actions'

const PENDING = 'voice-messages/pending/123e4567-e89b-12d3-a456-426614174000.webm'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'u1', clerkOrgId: 'org_1' } as never)
})

describe('voice message send actions — messaging capability', () => {
  it('refuses both steps for a club member', async () => {
    vi.mocked(getCapabilitiesForUser).mockResolvedValue(getOrgCapabilities({ type: 'CLUB' }))
    const blocked = { success: false, error: "Messaging isn't available for your account." }

    expect(await generateVoiceMessageUploadUrl('r1', 'webm')).toEqual(blocked)
    expect(await confirmVoiceMessage('r1', PENDING, 10)).toEqual(blocked)
    expect(getSignedUrl).not.toHaveBeenCalled()
    expect(messageService.sendVoiceMessage).not.toHaveBeenCalled()
  })

  it('works unchanged for trainer orgs (regression)', async () => {
    vi.mocked(getCapabilitiesForUser).mockResolvedValue(getOrgCapabilities(null))
    vi.mocked(messageService.sendVoiceMessage).mockResolvedValue({ id: 'm1' } as never)

    expect((await generateVoiceMessageUploadUrl('r1', 'webm')).success).toBe(true)
    expect(await confirmVoiceMessage('r1', PENDING, 10)).toEqual({ success: true })
    expect(messageService.sendVoiceMessage).toHaveBeenCalledWith(
      expect.objectContaining({ senderId: 'u1', recipientId: 'r1', audioDurationSec: 10 })
    )
  })
})

describe('voice message send actions — pair rule', () => {
  const blocked = { success: false, error: "Messaging isn't available for your account." }

  beforeEach(() => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 't1', role: 'TRAINER', clerkOrgId: 'org_club' } as never)
    vi.mocked(getCapabilitiesForUser).mockResolvedValue(
      getUserCapabilities({ orgType: 'CLUB', role: 'TRAINER', coachingActive: false })
    )
    vi.mocked(messageService.sendVoiceMessage).mockResolvedValue({ id: 'm1' } as never)
  })

  afterEach(() => {
    vi.mocked(canCoachInteract).mockResolvedValue(true)
  })

  it('refuses a club trainer → uncoached member at both steps', async () => {
    vi.mocked(canCoachInteract).mockResolvedValue(false)
    expect(await generateVoiceMessageUploadUrl('m1', 'webm')).toEqual(blocked)
    expect(await confirmVoiceMessage('m1', PENDING, 10)).toEqual(blocked)
    expect(canCoachInteract).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }), 'm1')
    expect(getSignedUrl).not.toHaveBeenCalled()
    expect(messageService.sendVoiceMessage).not.toHaveBeenCalled()
  })

  it('allows a club trainer → coached member', async () => {
    vi.mocked(canCoachInteract).mockResolvedValue(true)
    expect((await generateVoiceMessageUploadUrl('m1', 'webm')).success).toBe(true)
    expect(await confirmVoiceMessage('m1', PENDING, 10)).toEqual({ success: true })
  })

  it('applies to a coached club member → their club trainer', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'm1', role: 'CLIENT', clerkOrgId: 'org_club' } as never)
    vi.mocked(getCapabilitiesForUser).mockResolvedValue(
      getUserCapabilities({ orgType: 'CLUB', role: 'CLIENT', coachingActive: true })
    )
    vi.mocked(canCoachInteract).mockResolvedValue(true)
    expect(await confirmVoiceMessage('t1', PENDING, 10)).toEqual({ success: true })
    expect(canCoachInteract).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1' }), 't1')
  })

  it('refuses a club member → someone outside their club', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'm1', role: 'CLIENT', clerkOrgId: 'org_club' } as never)
    vi.mocked(getCapabilitiesForUser).mockResolvedValue(
      getUserCapabilities({ orgType: 'CLUB', role: 'CLIENT', coachingActive: true })
    )
    vi.mocked(canCoachInteract).mockResolvedValue(false)
    expect(await generateVoiceMessageUploadUrl('t_other', 'webm')).toEqual({ success: false, error: MESSAGING_UNAVAILABLE })
    expect(await confirmVoiceMessage('t_other', PENDING, 10)).toEqual({ success: false, error: MESSAGING_UNAVAILABLE })
    expect(messageService.sendVoiceMessage).not.toHaveBeenCalled()
  })

  it('trainer-org client → trainer skips the pair rule (regression)', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'c1', role: 'CLIENT', clerkOrgId: 'org_t' } as never)
    vi.mocked(getCapabilitiesForUser).mockResolvedValue(getOrgCapabilities(null))
    expect(await confirmVoiceMessage('t2', PENDING, 10)).toEqual({ success: true })
    expect(canCoachInteract).not.toHaveBeenCalled()
  })

  it('trainer-org trainer → client is unchanged (regression)', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 't2', role: 'TRAINER', clerkOrgId: 'org_t' } as never)
    vi.mocked(getCapabilitiesForUser).mockResolvedValue(getOrgCapabilities(null))
    expect((await generateVoiceMessageUploadUrl('c1', 'webm')).success).toBe(true)
    expect(await confirmVoiceMessage('c1', PENDING, 10)).toEqual({ success: true })
    expect(canCoachInteract).toHaveBeenCalledWith(expect.objectContaining({ id: 't2' }), 'c1')
    expect(messageService.sendVoiceMessage).toHaveBeenCalledWith(expect.objectContaining({ senderId: 't2', recipientId: 'c1' }))
  })
})
