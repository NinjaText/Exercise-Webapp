import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    clubAlertSubscriber: { upsert: vi.fn(), update: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), deleteMany: vi.fn() },
    user: { findMany: vi.fn() },
    organization: { findMany: vi.fn() },
    message: { groupBy: vi.fn() },
    checkInResponse: { findMany: vi.fn() },
    memberCoaching: { groupBy: vi.fn() },
  },
}))

const getUserList = vi.fn()
vi.mock('@clerk/nextjs/server', () => ({ clerkClient: async () => ({ users: { getUserList } }) }))

import { prisma } from '@/lib/prisma'
import {
  ensureClubAlertSubscriber,
  getClubAlertRecipients,
  getClubAttentionCounts,
  setClubAlertsMuted,
} from '../club-alerts.service'

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.SUPER_ADMIN_EMAILS
})

describe('club alert subscribers', () => {
  it('upsert never touches muted', async () => {
    await ensureClubAlertSubscriber({ id: 'a1', email: 'a@x.test' })
    const arg = vi.mocked(prisma.clubAlertSubscriber.upsert).mock.calls[0][0]
    expect(arg.update).toEqual({ email: 'a@x.test' })
    expect(arg.create).toEqual({ userId: 'a1', email: 'a@x.test' })
  })

  it('setClubAlertsMuted updates the flag', async () => {
    await setClubAlertsMuted('a1', true)
    expect(prisma.clubAlertSubscriber.update).toHaveBeenCalledWith({ where: { userId: 'a1' }, data: { muted: true } })
  })

  it('recipients query excludes muted', async () => {
    vi.mocked(prisma.clubAlertSubscriber.findMany).mockResolvedValue([{ userId: 'a1', email: 'a@x.test' }] as never)
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 'a1', clerkId: 'ck_a1', email: 'a@x.test' }] as never)
    getUserList.mockResolvedValue({ data: [{ id: 'ck_a1', publicMetadata: { superAdmin: true } }] })
    expect(await getClubAlertRecipients()).toEqual([{ userId: 'a1', email: 'a@x.test' }])
    expect(vi.mocked(prisma.clubAlertSubscriber.findMany).mock.calls[0][0]?.where).toEqual({ muted: false })
    expect(getUserList).toHaveBeenCalledWith({ userId: ['ck_a1'], limit: 1 })
  })
})

describe('getClubAlertRecipients re-verifies super admins at send time', () => {
  beforeEach(() => {
    vi.mocked(prisma.clubAlertSubscriber.findMany).mockResolvedValue([
      { userId: 'env', email: 'env@x.test' },
      { userId: 'clerk', email: 'clerk@x.test' },
      { userId: 'gone', email: 'gone@x.test' },
    ] as never)
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'env', clerkId: 'ck_env', email: 'Env@x.test' },
      { id: 'clerk', clerkId: 'ck_clerk', email: 'clerk@x.test' },
      { id: 'gone', clerkId: 'ck_gone', email: 'gone@x.test' },
    ] as never)
    process.env.SUPER_ADMIN_EMAILS = ' env@x.test , other@x.test'
  })

  it('drops and deletes a subscriber who is no longer a super admin', async () => {
    getUserList.mockResolvedValue({
      data: [
        { id: 'ck_env', publicMetadata: {} },
        { id: 'ck_clerk', publicMetadata: { superAdmin: true } },
        { id: 'ck_gone', publicMetadata: { superAdmin: false } },
      ],
    })
    expect(await getClubAlertRecipients()).toEqual([
      { userId: 'env', email: 'env@x.test' },
      { userId: 'clerk', email: 'clerk@x.test' },
    ])
    expect(prisma.clubAlertSubscriber.deleteMany).toHaveBeenCalledWith({ where: { userId: { in: ['gone'] } } })
  })

  it('falls back to SUPER_ADMIN_EMAILS only, deleting nothing, when Clerk fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    getUserList.mockRejectedValue(new Error('clerk down'))
    expect(await getClubAlertRecipients()).toEqual([{ userId: 'env', email: 'env@x.test' }])
    expect(prisma.clubAlertSubscriber.deleteMany).not.toHaveBeenCalled()
  })
})

describe('getClubAttentionCounts', () => {
  it('sums messages, unreviewed check-ins and coaching requests per club in batched queries', async () => {
    vi.mocked(prisma.organization.findMany).mockResolvedValue([
      { clerkOrgId: 'org_a', houseCoachUserId: 'hcA' },
      { clerkOrgId: 'org_b', houseCoachUserId: 'hcB' },
      { clerkOrgId: 'org_c', houseCoachUserId: 'hcC' },
    ] as never)
    vi.mocked(prisma.message.groupBy).mockResolvedValue([
      { recipientId: 'hcA', _count: { _all: 2 } },
      { recipientId: 'hcB', _count: { _all: 1 } },
    ] as never)
    vi.mocked(prisma.checkInResponse.findMany).mockResolvedValue([
      { assignment: { trainerId: 'hcA' } },
      { assignment: { trainerId: 'hcA' } },
    ] as never)
    vi.mocked(prisma.memberCoaching.groupBy).mockResolvedValue([{ clerkOrgId: 'org_a', _count: { _all: 3 } }] as never)

    const counts = await getClubAttentionCounts()

    expect(counts.get('org_a')).toBe(7)
    expect(counts.get('org_b')).toBe(1)
    expect(counts.get('org_c')).toBe(0)
    expect(prisma.message.groupBy).toHaveBeenCalledTimes(1)
    expect(prisma.checkInResponse.findMany).toHaveBeenCalledTimes(1)
    expect(prisma.memberCoaching.groupBy).toHaveBeenCalledTimes(1)
    expect(vi.mocked(prisma.checkInResponse.findMany).mock.calls[0][0]?.where).toMatchObject({
      isReviewed: false,
      assignment: { trainerId: { in: ['hcA', 'hcB', 'hcC'] } },
    })
  })

  it('returns an empty map and runs no source queries without clubs', async () => {
    vi.mocked(prisma.organization.findMany).mockResolvedValue([])
    expect((await getClubAttentionCounts()).size).toBe(0)
    expect(prisma.message.groupBy).not.toHaveBeenCalled()
  })
})
