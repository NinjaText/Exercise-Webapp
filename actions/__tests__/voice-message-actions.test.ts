import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/org-capabilities.server', () => ({ getCapabilitiesForUser: vi.fn() }))
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
import { getCapabilitiesForUser } from '@/lib/org-capabilities.server'
import { getOrgCapabilities } from '@/lib/org-capabilities'
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
