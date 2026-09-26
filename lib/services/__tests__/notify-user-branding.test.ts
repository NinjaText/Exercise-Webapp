import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as React from 'react'

/**
 * Brand follows the recipient's relationship (spec §7): emails a CLIENT
 * receives carry their coach's org brand; trainer-recipient and billing mail
 * stays product-branded.
 */

const { FakeTemplate } = vi.hoisted(() => ({
  FakeTemplate: () => React.createElement('div', null, 'body'),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    notification: { create: vi.fn(), findFirst: vi.fn() },
    notificationPreference: { findUnique: vi.fn(), create: vi.fn(), upsert: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}))

vi.mock('@/lib/email/send', () => ({ sendEmail: vi.fn() }))
vi.mock('@/lib/email/branding', () => ({
  getClientEmailBranding: vi.fn(),
  templateBrand: (b: { enabled: boolean; organizationName: string; accent: string; logoUrl?: string }) =>
    b.enabled ? { organizationName: b.organizationName, accent: b.accent, logoUrl: b.logoUrl } : undefined,
}))

vi.mock('@/lib/notifications/registry', () => {
  const base = { transactional: false, template: FakeTemplate, subject: () => 'S', cooldownMinutes: null }
  return {
    NOTIFICATION_REGISTRY: {
      SESSION_REMINDER: { ...base, category: 'sessions', clientFacing: true },
      NEW_MESSAGE: { ...base, category: 'messages', clientFacing: true },
      SESSION_COMPLETED: { ...base, category: 'sessions', clientFacing: false },
      PAYMENT_FAILED: { ...base, category: 'billing', transactional: true, clientFacing: false },
    },
  }
})

import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email/send'
import { getClientEmailBranding } from '@/lib/email/branding'
import { notifyUser } from '../notification.service'

const BRANDED = {
  enabled: true,
  organizationName: 'Summit PT',
  accent: '#0f766e',
  logoUrl: 'https://assets.test/branding/org_1/logo.png',
  fromName: 'Summit PT',
  replyTo: 'desk@summit.test',
}

const base = {
  userId: 'u1',
  title: 'T',
  recipientEmail: 'sarah@example.com',
  recipientName: 'Sarah Lee',
  email: {},
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.test'
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.mocked(prisma.notification.create).mockResolvedValue({ id: 'n_new' } as never)
  vi.mocked(prisma.notification.findFirst).mockResolvedValue(null)
  vi.mocked(prisma.notificationPreference.findUnique).mockResolvedValue({
    id: 'p1', userId: 'u1', emailEnabled: true,
    sessions: true, messages: true, nutrition: true, billing: true, unsubToken: 'tok',
  } as never)
  vi.mocked(sendEmail).mockResolvedValue(true)
  vi.mocked(getClientEmailBranding).mockResolvedValue(BRANDED)
})

describe('notifyUser — client-recipient types carry the org brand', () => {
  it('passes brand props to the template and From/Reply-To to sendEmail', async () => {
    await notifyUser({ ...base, type: 'SESSION_REMINDER' as never })

    expect(getClientEmailBranding).toHaveBeenCalledWith('u1')
    const args = vi.mocked(sendEmail).mock.calls[0][0]
    expect(args.fromName).toBe('Summit PT')
    expect(args.replyTo).toBe('desk@summit.test')
    const props = args.react.props as Record<string, unknown>
    expect(props.brand).toEqual({
      organizationName: 'Summit PT',
      accent: '#0f766e',
      logoUrl: 'https://assets.test/branding/org_1/logo.png',
    })
  })

  it('keeps the unsubscribe URL and headers intact', async () => {
    await notifyUser({ ...base, type: 'SESSION_REMINDER' as never })

    const args = vi.mocked(sendEmail).mock.calls[0][0]
    expect(args.unsubscribeUrl).toBe(
      'https://app.test/api/notifications/unsubscribe?token=tok&category=sessions'
    )
    expect((args.react.props as Record<string, unknown>).unsubscribeUrl).toBe(args.unsubscribeUrl)
  })

  it('an unbranded org gets no From name, Reply-To or template brand', async () => {
    vi.mocked(getClientEmailBranding).mockResolvedValue({
      enabled: false, organizationName: 'INMOTUS RX', accent: '#2563eb', fromName: 'INMOTUS RX', replyTo: 'desk@summit.test',
    })

    await notifyUser({ ...base, type: 'SESSION_REMINDER' as never })

    const args = vi.mocked(sendEmail).mock.calls[0][0]
    // Unbranded client mail is sent exactly as before branding existed.
    expect('fromName' in args).toBe(false)
    expect('replyTo' in args).toBe(false)
    expect((args.react.props as Record<string, unknown>).brand).toBeUndefined()
  })

  it('a bidirectional type sent to a trainer (lookup returns null) stays unbranded', async () => {
    vi.mocked(getClientEmailBranding).mockResolvedValue(null)

    await notifyUser({ ...base, type: 'NEW_MESSAGE' as never })

    const args = vi.mocked(sendEmail).mock.calls[0][0]
    expect(args.fromName).toBeUndefined()
    expect(args.replyTo).toBeUndefined()
    expect('brand' in (args.react.props as Record<string, unknown>)).toBe(false)
  })

  it('still sends, unbranded, when the branding lookup rejects', async () => {
    vi.mocked(getClientEmailBranding).mockRejectedValue(new Error('boom'))

    await notifyUser({ ...base, type: 'SESSION_REMINDER' as never })

    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(vi.mocked(sendEmail).mock.calls[0][0].fromName).toBeUndefined()
    expect(console.error).toHaveBeenCalled()
  })
})

describe('notifyUser — trainer-recipient and billing types are never branded', () => {
  for (const type of ['SESSION_COMPLETED', 'PAYMENT_FAILED']) {
    it(`${type} skips the branding lookup entirely`, async () => {
      await notifyUser({ ...base, type: type as never })

      expect(getClientEmailBranding).not.toHaveBeenCalled()
      const args = vi.mocked(sendEmail).mock.calls[0][0]
      expect(args.fromName).toBeUndefined()
      expect(args.replyTo).toBeUndefined()
      expect('brand' in (args.react.props as Record<string, unknown>)).toBe(false)
    })
  }
})
