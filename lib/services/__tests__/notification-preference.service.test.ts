import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    notificationPreference: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import { NOTIFICATION_TYPES } from '@/lib/notifications/types'
import {
  PREFERENCE_DEFAULTS,
  readPreference,
  getPreference,
  getOrCreatePreference,
  isAllowedByPrefs,
  isEmailAllowed,
  updatePreference,
  resolveUnsubToken,
} from '../notification-preference.service'

const row = {
  id: 'p1',
  userId: 'u1',
  emailEnabled: true,
  sessions: true,
  messages: false,
  nutrition: true,
  billing: true,
  unsubToken: 'tok_abc',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('readPreference', () => {
  it('returns defaults when no row exists', async () => {
    vi.mocked(prisma.notificationPreference.findUnique).mockResolvedValue(null)

    await expect(readPreference('u1')).resolves.toEqual(PREFERENCE_DEFAULTS)
  })

  it('propagates a lookup failure instead of returning all-off', async () => {
    vi.mocked(prisma.notificationPreference.findUnique).mockRejectedValue(new Error('db down'))

    await expect(readPreference('u1')).rejects.toThrow('db down')
  })
})

describe('getPreference', () => {
  it('returns defaults and writes nothing when no row exists', async () => {
    vi.mocked(prisma.notificationPreference.findUnique).mockResolvedValue(null)

    await expect(getPreference('u1')).resolves.toEqual(PREFERENCE_DEFAULTS)
    expect(prisma.notificationPreference.create).not.toHaveBeenCalled()
  })

  it('returns the stored row when one exists', async () => {
    vi.mocked(prisma.notificationPreference.findUnique).mockResolvedValue(row as never)

    const prefs = await getPreference('u1')

    expect(prefs.messages).toBe(false)
    expect(prefs.sessions).toBe(true)
  })

  it('fails closed to all-off when the lookup throws', async () => {
    vi.mocked(prisma.notificationPreference.findUnique).mockRejectedValue(new Error('db down'))

    const prefs = await getPreference('u1')

    expect(prefs.emailEnabled).toBe(false)
  })
})

describe('getOrCreatePreference', () => {
  it('creates a row with a 64-character hex token when none exists', async () => {
    vi.mocked(prisma.notificationPreference.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.notificationPreference.create).mockResolvedValue(row as never)

    await getOrCreatePreference('u1')

    expect(prisma.notificationPreference.create).toHaveBeenCalledTimes(1)
    const data = vi.mocked(prisma.notificationPreference.create).mock.calls[0][0]
      .data as Record<string, unknown>
    expect(data.userId).toBe('u1')
    expect(data.unsubToken).toMatch(/^[0-9a-f]{64}$/)
    expect(data.emailEnabled).toBe(true)
  })

  it('does not create a second row when one exists', async () => {
    vi.mocked(prisma.notificationPreference.findUnique).mockResolvedValue(row as never)

    const prefs = await getOrCreatePreference('u1')

    expect(prisma.notificationPreference.create).not.toHaveBeenCalled()
    expect(prefs.unsubToken).toBe('tok_abc')
  })

  // The nutrition nudge cron dispatches up to three notifyUser calls for the
  // same user in parallel, so all three can miss the findUnique and all three
  // can attempt the create. Before the re-read, the two P2002 losers threw,
  // notifyUser swallowed it, and two of the three emails vanished.
  it('converges on one row when concurrent calls race the create', async () => {
    vi.mocked(prisma.notificationPreference.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.notificationPreference.create)
      .mockResolvedValueOnce(row as never)
      .mockRejectedValue(
        Object.assign(new Error('Unique constraint failed on userId'), { code: 'P2002' })
      )
    vi.mocked(prisma.notificationPreference.findUniqueOrThrow).mockResolvedValue(row as never)

    const results = await Promise.all([
      getOrCreatePreference('u1'),
      getOrCreatePreference('u1'),
      getOrCreatePreference('u1'),
    ])

    // All three callers get a usable token, so all three emails still send.
    expect(results.map((r) => r.unsubToken)).toEqual(['tok_abc', 'tok_abc', 'tok_abc'])
    expect(results.every((r) => r.emailEnabled)).toBe(true)
    // Exactly one row: the two losers re-read rather than creating a second.
    expect(prisma.notificationPreference.create).toHaveBeenCalledTimes(3)
    expect(prisma.notificationPreference.findUniqueOrThrow).toHaveBeenCalledTimes(2)
    expect(prisma.notificationPreference.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { userId: 'u1' },
    })
  })

  it('still rejects when the create fails and no row turns up on the re-read', async () => {
    vi.mocked(prisma.notificationPreference.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.notificationPreference.create).mockRejectedValue(new Error('db down'))
    vi.mocked(prisma.notificationPreference.findUniqueOrThrow).mockRejectedValue(
      new Error('No NotificationPreference found')
    )

    await expect(getOrCreatePreference('u1')).rejects.toThrow('No NotificationPreference found')
  })
})

describe('isAllowedByPrefs', () => {
  const on = { ...PREFERENCE_DEFAULTS }

  it('allows a type whose category is on', () => {
    expect(isAllowedByPrefs(on, NOTIFICATION_TYPES.SESSION_REMINDER)).toBe(true)
  })

  it('blocks a type whose category is muted', () => {
    expect(
      isAllowedByPrefs({ ...on, sessions: false }, NOTIFICATION_TYPES.SESSION_REMINDER)
    ).toBe(false)
  })

  it('blocks everything non-transactional when the master switch is off', () => {
    expect(
      isAllowedByPrefs({ ...on, emailEnabled: false }, NOTIFICATION_TYPES.NEW_MESSAGE)
    ).toBe(false)
  })

  it('allows a transactional type even with the master switch and category off', () => {
    expect(
      isAllowedByPrefs(
        { ...on, emailEnabled: false, billing: false },
        NOTIFICATION_TYPES.PAYMENT_FAILED
      )
    ).toBe(true)
  })

  it('blocks an unknown type', () => {
    expect(isAllowedByPrefs(on, 'NOT_A_REAL_TYPE' as never)).toBe(false)
  })
})

describe('isEmailAllowed', () => {
  it('reads the row and applies it', async () => {
    vi.mocked(prisma.notificationPreference.findUnique).mockResolvedValue(row as never)

    await expect(isEmailAllowed('u1', NOTIFICATION_TYPES.NEW_MESSAGE)).resolves.toBe(false)
    await expect(isEmailAllowed('u1', NOTIFICATION_TYPES.SESSION_REMINDER)).resolves.toBe(true)
  })
})

describe('updatePreference', () => {
  it('upserts the patch and generates a token on create', async () => {
    await updatePreference('u1', { messages: false, nutrition: false })

    const args = vi.mocked(prisma.notificationPreference.upsert).mock.calls[0][0] as {
      where: { userId: string }
      create: Record<string, unknown>
      update: Record<string, unknown>
    }
    expect(args.where).toEqual({ userId: 'u1' })
    expect(args.update).toEqual({ messages: false, nutrition: false })
    expect(args.create.unsubToken).toMatch(/^[0-9a-f]{64}$/)
    expect(args.create.messages).toBe(false)
  })

  it('drops an attempted billing change', async () => {
    await updatePreference('u1', { billing: false, sessions: false } as never)

    const args = vi.mocked(prisma.notificationPreference.upsert).mock.calls[0][0] as {
      update: Record<string, unknown>
      create: Record<string, unknown>
    }
    expect(args.update).not.toHaveProperty('billing')
    expect(args.create.billing).toBe(true)
    expect(args.update.sessions).toBe(false)
  })

  it('ignores an empty patch without writing', async () => {
    await updatePreference('u1', {})

    expect(prisma.notificationPreference.upsert).not.toHaveBeenCalled()
  })
})

describe('resolveUnsubToken', () => {
  it('returns the userId for a known token', async () => {
    vi.mocked(prisma.notificationPreference.findUnique).mockResolvedValue(row as never)

    await expect(resolveUnsubToken('tok_abc')).resolves.toEqual({ userId: 'u1' })
  })

  it('returns null for an unknown token', async () => {
    vi.mocked(prisma.notificationPreference.findUnique).mockResolvedValue(null)

    await expect(resolveUnsubToken('nope')).resolves.toBeNull()
  })

  it('returns null for an empty token without querying', async () => {
    await expect(resolveUnsubToken('')).resolves.toBeNull()
    expect(prisma.notificationPreference.findUnique).not.toHaveBeenCalled()
  })
})
