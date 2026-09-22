import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as React from 'react'

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

vi.mock('@/lib/notifications/registry', () => ({
  NOTIFICATION_REGISTRY: {
    SESSION_REMINDER: {
      category: 'sessions',
      transactional: false,
      template: FakeTemplate,
      subject: (d: Record<string, unknown>) => `Reminder: ${d.workoutName}`,
      cooldownMinutes: null,
    },
    NEW_MESSAGE: {
      category: 'messages',
      transactional: false,
      template: FakeTemplate,
      subject: (d: Record<string, unknown>) => `New message from ${d.senderName}`,
      cooldownMinutes: 60,
    },
    EXERCISE_NOTE: {
      category: 'sessions',
      transactional: false,
      template: null,
      subject: () => '',
      cooldownMinutes: null,
    },
    PAYMENT_FAILED: {
      category: 'billing',
      transactional: true,
      template: FakeTemplate,
      subject: () => 'Action required: your payment failed',
      cooldownMinutes: null,
    },
  },
}))

import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email/send'
import { notifyUser } from '../notification.service'

const PREFS_ALL_ON = {
  id: 'p1', userId: 'u1', emailEnabled: true,
  sessions: true, messages: true, nutrition: true, billing: true,
  unsubToken: 'tok_abc',
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.test'
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.mocked(prisma.notification.create).mockResolvedValue({ id: 'n_new' } as never)
  vi.mocked(prisma.notification.findFirst).mockResolvedValue(null)
  vi.mocked(prisma.notificationPreference.findUnique).mockResolvedValue(PREFS_ALL_ON as never)
  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    email: 'sarah@example.com', firstName: 'Sarah', lastName: 'Lee',
  } as never)
  vi.mocked(sendEmail).mockResolvedValue(true)
})

const reminder = {
  userId: 'u1',
  type: 'SESSION_REMINDER' as never,
  title: 'Session Reminder',
  body: 'Tomorrow',
  link: '/sessions',
  email: { workoutName: 'Lower Body A' },
}

describe('notifyUser — the in-app notification is never gated', () => {
  it('creates it before any other work', async () => {
    await notifyUser(reminder)
    expect(prisma.notification.create).toHaveBeenCalledTimes(1)
  })

  it('creates it even when the category is muted', async () => {
    vi.mocked(prisma.notificationPreference.findUnique).mockResolvedValue({
      ...PREFS_ALL_ON, sessions: false,
    } as never)

    await notifyUser(reminder)

    expect(prisma.notification.create).toHaveBeenCalledTimes(1)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('creates it even when the master switch is off', async () => {
    vi.mocked(prisma.notificationPreference.findUnique).mockResolvedValue({
      ...PREFS_ALL_ON, emailEnabled: false,
    } as never)

    await notifyUser(reminder)

    expect(prisma.notification.create).toHaveBeenCalledTimes(1)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('creates it even when the send fails', async () => {
    vi.mocked(sendEmail).mockResolvedValue(false)

    await notifyUser(reminder)

    expect(prisma.notification.create).toHaveBeenCalledTimes(1)
  })

  it('creates it for an in-app-only type and sends nothing', async () => {
    await notifyUser({ ...reminder, type: 'EXERCISE_NOTE' as never })

    expect(prisma.notification.create).toHaveBeenCalledTimes(1)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('creates it for a type missing from the registry, and logs', async () => {
    await notifyUser({ ...reminder, type: 'GHOST_TYPE' as never })

    expect(prisma.notification.create).toHaveBeenCalledTimes(1)
    expect(sendEmail).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalled()
  })
})

describe('notifyUser — sending', () => {
  it('sends with the registry subject and the resolved recipient', async () => {
    await notifyUser(reminder)

    expect(sendEmail).toHaveBeenCalledTimes(1)
    const args = vi.mocked(sendEmail).mock.calls[0][0]
    expect(args.to).toBe('sarah@example.com')
    expect(args.subject).toBe('Reminder: Lower Body A')
  })

  it('merges recipientName and unsubscribeUrl into the template props', async () => {
    await notifyUser(reminder)

    const props = vi.mocked(sendEmail).mock.calls[0][0].react.props as Record<string, unknown>
    expect(props.workoutName).toBe('Lower Body A')
    expect(props.recipientName).toBe('Sarah Lee')
    expect(props.unsubscribeUrl).toBe(
      'https://app.test/api/notifications/unsubscribe?token=tok_abc&category=sessions'
    )
  })

  it('skips the user lookup when the caller supplies the address and name', async () => {
    await notifyUser({ ...reminder, recipientEmail: 'direct@example.com', recipientName: 'Direct' })

    expect(prisma.user.findUnique).not.toHaveBeenCalled()
    expect(vi.mocked(sendEmail).mock.calls[0][0].to).toBe('direct@example.com')
  })

  it('skips the send when the user has no email address', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never)

    await notifyUser(reminder)

    expect(sendEmail).not.toHaveBeenCalled()
    expect(prisma.notification.create).toHaveBeenCalledTimes(1)
  })
})

describe('notifyUser — cooldown', () => {
  const message = {
    userId: 'u1',
    type: 'NEW_MESSAGE' as never,
    title: 'New message',
    email: { senderName: 'Mike Chen' },
  }

  it('suppresses the email when a same-type notification is inside the window', async () => {
    vi.mocked(prisma.notification.findFirst).mockResolvedValue({ id: 'n_old' } as never)

    await notifyUser(message)

    expect(prisma.notification.create).toHaveBeenCalledTimes(1)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('excludes the row it just created from the cooldown query', async () => {
    await notifyUser(message)

    const where = vi.mocked(prisma.notification.findFirst).mock.calls[0][0]!.where as {
      id: { not: string }
      type: string
      userId: string
    }
    expect(where.id).toEqual({ not: 'n_new' })
    expect(where.type).toBe('NEW_MESSAGE')
    expect(where.userId).toBe('u1')
  })

  it('queries the window from the registry cooldown', async () => {
    const before = Date.now()

    await notifyUser(message)

    const where = vi.mocked(prisma.notification.findFirst).mock.calls[0][0]!.where as {
      createdAt: { gte: Date }
    }
    const windowMs = before - where.createdAt.gte.getTime()
    expect(windowMs).toBeGreaterThanOrEqual(60 * 60_000 - 1000)
    expect(windowMs).toBeLessThanOrEqual(60 * 60_000 + 1000)
  })

  it('does not query at all for a type with no cooldown', async () => {
    await notifyUser(reminder)

    expect(prisma.notification.findFirst).not.toHaveBeenCalled()
    expect(sendEmail).toHaveBeenCalledTimes(1)
  })
})

describe('notifyUser — transactional mail', () => {
  const payment = {
    userId: 'u1',
    type: 'PAYMENT_FAILED' as never,
    title: 'Payment failed',
    email: { amountDue: '$49.00' },
  }

  it('sends even with the master switch and the category off', async () => {
    vi.mocked(prisma.notificationPreference.findUnique).mockResolvedValue({
      ...PREFS_ALL_ON, emailEnabled: false, billing: false,
    } as never)

    await notifyUser(payment)

    expect(sendEmail).toHaveBeenCalledTimes(1)
  })

  it('carries no unsubscribe URL and creates no preference row', async () => {
    vi.mocked(prisma.notificationPreference.findUnique).mockResolvedValue(null as never)

    await notifyUser(payment)

    const props = vi.mocked(sendEmail).mock.calls[0][0].react.props as Record<string, unknown>
    expect(props.unsubscribeUrl).toBeUndefined()
    expect(prisma.notificationPreference.create).not.toHaveBeenCalled()
  })
})

describe('notifyUser — never throws', () => {
  it('swallows a rejected send', async () => {
    vi.mocked(sendEmail).mockRejectedValue(new Error('boom'))
    await expect(notifyUser(reminder)).resolves.toBeUndefined()
  })

  it('swallows a rejected preference lookup', async () => {
    vi.mocked(prisma.notificationPreference.findUnique).mockRejectedValue(new Error('db down'))
    await expect(notifyUser(reminder)).resolves.toBeUndefined()
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('swallows a rejected cooldown query', async () => {
    vi.mocked(prisma.notification.findFirst).mockRejectedValue(new Error('db down'))
    await expect(
      notifyUser({ userId: 'u1', type: 'NEW_MESSAGE' as never, title: 'T', email: {} })
    ).resolves.toBeUndefined()
  })

  it('swallows a subject function that throws', async () => {
    await expect(
      notifyUser({ userId: 'u1', type: 'SESSION_REMINDER' as never, title: 'T' })
    ).resolves.toBeUndefined()
  })

  it('resolves rather than throwing when the notification write itself fails', async () => {
    vi.mocked(prisma.notification.create).mockRejectedValue(new Error('db down'))

    await expect(notifyUser(reminder)).resolves.toBeUndefined()
    expect(sendEmail).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalled()
  })
})
