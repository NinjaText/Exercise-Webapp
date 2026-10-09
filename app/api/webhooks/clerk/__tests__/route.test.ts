import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('svix', () => ({
  Webhook: vi.fn().mockImplementation(function () {
    return {
      verify: vi.fn((body: string) => JSON.parse(body)),
    }
  }),
}))
vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Map([
    ['svix-id', 'id'],
    ['svix-timestamp', 'ts'],
    ['svix-signature', 'sig'],
  ])),
}))
vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { deleteMany: vi.fn(), updateMany: vi.fn(), upsert: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn() },
    auditLog: { create: vi.fn() },
    organization: { updateMany: vi.fn(), findUnique: vi.fn() },
  },
}))
vi.mock('@/lib/services/user-deletion.service', () => ({
  deleteUserData: vi.fn(),
  findDeletionBlockers: vi.fn(),
}))

vi.mock('@/lib/services/club-member.service', () => ({ ensureMemberSubscription: vi.fn() }))
vi.mock('@/lib/services/member-billing.service', () => ({ cancelMemberBillingForDeletion: vi.fn() }))
vi.mock('@/lib/services/pending-program-assignment.service', () => ({
  applyPendingAssignmentsForNewClient: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))
vi.mock('@/lib/services/branding.service', () => ({
  brandingTag: (id: string) => `org-branding:${id}`,
}))

process.env.CLERK_WEBHOOK_SECRET = 'test_secret'

import { prisma } from '@/lib/prisma'
import { deleteUserData, findDeletionBlockers } from '@/lib/services/user-deletion.service'
import { revalidateTag } from 'next/cache'
import { clerkClient } from '@clerk/nextjs/server'
import { ensureMemberSubscription } from '@/lib/services/club-member.service'
import { applyPendingAssignmentsForNewClient } from '@/lib/services/pending-program-assignment.service'
import { cancelMemberBillingForDeletion } from '@/lib/services/member-billing.service'
import { POST } from '../route'

const mockFindUnique = vi.mocked(prisma.user.findUnique)
const mockAuditCreate = vi.mocked(prisma.auditLog.create)
const mockDeleteUserData = vi.mocked(deleteUserData)
const mockFindBlockers = vi.mocked(findDeletionBlockers)
const mockOrgUpdateMany = vi.mocked(prisma.organization.updateMany)
const mockRevalidateTag = vi.mocked(revalidateTag)

beforeEach(() => {
  vi.clearAllMocks()
  mockFindBlockers.mockResolvedValue([])
})

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/webhooks/clerk', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('session webhook events', () => {
  it('logs LOGIN on session.created for a known user', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'user_1',
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      role: 'TRAINER',
      clerkOrgId: 'org_1',
    } as never)

    await POST(makeRequest({ type: 'session.created', data: { user_id: 'clerk_1' } }))

    expect(mockAuditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: 'user_1',
        actorType: 'TRAINER',
        action: 'LOGIN',
        orgId: 'org_1',
      }),
    })
  })

  it('logs LOGOUT on session.ended', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'user_1',
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      role: 'TRAINER',
      clerkOrgId: null,
    } as never)

    await POST(makeRequest({ type: 'session.ended', data: { user_id: 'clerk_1' } }))

    expect(mockAuditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'LOGOUT' }),
    })
  })

  it('does nothing when the user is not found locally', async () => {
    mockFindUnique.mockResolvedValue(null)
    await POST(makeRequest({ type: 'session.created', data: { user_id: 'unknown' } }))
    expect(mockAuditCreate).not.toHaveBeenCalled()
  })
})

describe('user.deleted webhook event', () => {
  it('routes a user.deleted event through deleteUserData', async () => {
    mockFindUnique.mockResolvedValue({ id: 'user_1' } as never)
    mockDeleteUserData.mockResolvedValue(undefined)

    const res = await POST(makeRequest({ type: 'user.deleted', data: { id: 'clerk_1' } }))

    expect(mockFindUnique).toHaveBeenCalledWith({ where: { clerkId: 'clerk_1' }, select: { id: true } })
    expect(mockDeleteUserData).toHaveBeenCalledWith('user_1')
    expect(res.status).toBe(200)
  })

  it('is a no-op when no local user matches the Clerk id', async () => {
    mockFindUnique.mockResolvedValue(null)

    const res = await POST(makeRequest({ type: 'user.deleted', data: { id: 'clerk_unknown' } }))

    expect(mockDeleteUserData).not.toHaveBeenCalled()
    expect(res.status).toBe(200)
  })

  it('returns 500 without deleting the row when cleanup fails', async () => {
    mockFindUnique.mockResolvedValue({ id: 'user_1' } as never)
    mockDeleteUserData.mockRejectedValue(new Error('db down'))

    const res = await POST(makeRequest({ type: 'user.deleted', data: { id: 'clerk_1' } }))

    expect(res.status).toBe(500)
  })

  it('checks deletion blockers before destroying anything', async () => {
    mockFindUnique.mockResolvedValue({ id: 'user_1' } as never)
    mockDeleteUserData.mockResolvedValue(undefined)

    await POST(makeRequest({ type: 'user.deleted', data: { id: 'clerk_1' } }))

    expect(mockFindBlockers).toHaveBeenCalledWith('user_1', { includeActiveClients: false })
    expect(mockFindBlockers.mock.invocationCallOrder[0]).toBeLessThan(
      mockDeleteUserData.mock.invocationCallOrder[0]
    )
  })

  // deleteUserData deletes leaf-first and only trips the restrict on the user
  // row at the end, so running it on a blocked user would destroy health data
  // and then fail. Nothing must be deleted, and a retry cannot help, so the
  // event is acked rather than redelivered forever.
  it('deletes nothing and acks with 200 when a blocker is present', async () => {
    mockFindUnique.mockResolvedValue({ id: 'user_1' } as never)
    mockFindBlockers.mockResolvedValue([
      { code: 'CLIENT_SUBSCRIPTIONS', count: 1, message: 'this client has 1 billing subscription(s) on file. Cancel them first.' },
    ])

    const res = await POST(makeRequest({ type: 'user.deleted', data: { id: 'clerk_1' } }))

    expect(mockDeleteUserData).not.toHaveBeenCalled()
    expect(res.status).toBe(200)
  })

  it('cancels club member billing before deleting any data', async () => {
    mockFindUnique.mockResolvedValue({ id: 'user_1' } as never)
    mockDeleteUserData.mockResolvedValue(undefined)

    const res = await POST(makeRequest({ type: 'user.deleted', data: { id: 'clerk_1' } }))

    expect(res.status).toBe(200)
    expect(cancelMemberBillingForDeletion).toHaveBeenCalledWith('user_1')
    expect(vi.mocked(cancelMemberBillingForDeletion).mock.invocationCallOrder[0]).toBeLessThan(
      mockDeleteUserData.mock.invocationCallOrder[0]
    )
  })

  it('deletes nothing and returns 500 (Svix retries) when Stripe cancellation fails', async () => {
    mockFindUnique.mockResolvedValue({ id: 'user_1' } as never)
    vi.mocked(cancelMemberBillingForDeletion).mockRejectedValueOnce(new Error('stripe down'))

    const res = await POST(makeRequest({ type: 'user.deleted', data: { id: 'clerk_1' } }))

    expect(mockDeleteUserData).not.toHaveBeenCalled()
    expect(res.status).toBe(500)
  })

  it('returns 500 when the blocker lookup itself fails, so Svix retries', async () => {
    mockFindUnique.mockResolvedValue({ id: 'user_1' } as never)
    mockFindBlockers.mockRejectedValue(new Error('db down'))

    const res = await POST(makeRequest({ type: 'user.deleted', data: { id: 'clerk_1' } }))

    expect(mockDeleteUserData).not.toHaveBeenCalled()
    expect(res.status).toBe(500)
  })
})

describe('organization.updated webhook event', () => {
  it('syncs the org name to the DB row via updateMany', async () => {
    const res = await POST(makeRequest({ type: 'organization.updated', data: { id: 'org_1', name: 'New Name' } }))

    expect(res.status).toBe(200)
    expect(mockOrgUpdateMany).toHaveBeenCalledWith({
      where: { clerkOrgId: 'org_1' },
      data: { name: 'New Name' },
    })
  })

  it('expires the org branding cache tag after the rename (revalidateTag — updateTag throws in route handlers)', async () => {
    await POST(makeRequest({ type: 'organization.updated', data: { id: 'org_1', name: 'New Name' } }))

    expect(mockRevalidateTag).toHaveBeenCalledWith('org-branding:org_1', 'max')
    expect(mockOrgUpdateMany.mock.invocationCallOrder[0])
      .toBeLessThan(mockRevalidateTag.mock.invocationCallOrder[0])
  })

  it('ignores events without a non-empty string name', async () => {
    await POST(makeRequest({ type: 'organization.updated', data: { id: 'org_1', name: '' } }))
    await POST(makeRequest({ type: 'organization.updated', data: { id: 'org_1', name: '   ' } }))
    await POST(makeRequest({ type: 'organization.updated', data: { id: 'org_1' } }))
    await POST(makeRequest({ type: 'organization.updated', data: { id: 'org_1', name: 42 } }))

    expect(mockOrgUpdateMany).not.toHaveBeenCalled()
    expect(mockRevalidateTag).not.toHaveBeenCalled()
  })
})

describe('user.updated webhook event', () => {
  it('syncs the primary email address, not the first one in the list', async () => {
    await POST(
      makeRequest({
        type: 'user.updated',
        data: {
          id: 'clerk_1',
          image_url: 'https://img.clerk.com/a.png',
          primary_email_address_id: 'e_2',
          email_addresses: [
            { id: 'e_1', email_address: 'old@example.com' },
            { id: 'e_2', email_address: 'new@example.com' },
          ],
        },
      })
    )

    expect(vi.mocked(prisma.user.updateMany)).toHaveBeenCalledWith({
      where: { clerkId: 'clerk_1' },
      data: { imageUrl: 'https://img.clerk.com/a.png', email: 'new@example.com' },
    })
  })
})

describe('organizationMembership.created webhook event (club backup path)', () => {
  const membershipEvent = {
    type: 'organizationMembership.created',
    data: {
      organization: { id: 'org_club' },
      public_user_data: { user_id: 'clerk_1' },
    },
  }

  beforeEach(() => {
    vi.mocked(clerkClient).mockResolvedValue({
      users: {
        getUser: vi.fn().mockResolvedValue({
          emailAddresses: [{ id: 'e1', emailAddress: 'm@example.com' }],
          primaryEmailAddressId: 'e1',
          firstName: 'M',
          lastName: 'Ember',
          imageUrl: '',
        }),
      },
      organizations: { getOrganizationInvitationList: vi.fn().mockResolvedValue({ data: [] }) },
    } as never)
    vi.mocked(prisma.user.upsert).mockResolvedValue({ id: 'u1', role: 'CLIENT' } as never)
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null as never)
  })

  it('ensures a member subscription for a club org', async () => {
    const org = { clerkOrgId: 'org_club', type: 'CLUB' }
    vi.mocked(prisma.organization.findUnique).mockResolvedValue(org as never)

    const res = await POST(makeRequest(membershipEvent))

    expect(res.status).toBe(200)
    expect(ensureMemberSubscription).toHaveBeenCalledWith('u1', org)
  })

  it('does not touch subscriptions for a non-club org', async () => {
    vi.mocked(prisma.organization.findUnique).mockResolvedValue({ clerkOrgId: 'org_club', type: null } as never)

    await POST(makeRequest(membershipEvent))

    expect(ensureMemberSubscription).not.toHaveBeenCalled()
  })
})

describe('house coach events are ignored', () => {
  const coachClerkUser = (publicMetadata: unknown) => ({
    emailAddresses: [{ id: 'e1', emailAddress: 'house-coach+org_club@x.com' }],
    primaryEmailAddressId: 'e1',
    firstName: 'Coach',
    lastName: 'Pine',
    imageUrl: 'https://img.clerk.com/default.png',
    publicMetadata,
  })

  beforeEach(() => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never)
    vi.mocked(prisma.organization.findUnique).mockResolvedValue(null as never)
  })

  it('organizationMembership.created for a Clerk user flagged houseCoach creates nothing', async () => {
    vi.mocked(clerkClient).mockResolvedValue({
      users: { getUser: vi.fn().mockResolvedValue(coachClerkUser({ houseCoach: true })) },
      organizations: { getOrganizationInvitationList: vi.fn() },
    } as never)

    const res = await POST(
      makeRequest({
        type: 'organizationMembership.created',
        data: { organization: { id: 'org_club' }, public_user_data: { user_id: 'clerk_hc' } },
      })
    )

    expect(res.status).toBe(200)
    expect(prisma.user.upsert).not.toHaveBeenCalled()
    expect(prisma.user.updateMany).not.toHaveBeenCalled()
    expect(ensureMemberSubscription).not.toHaveBeenCalled()
  })

  it('organizationMembership.created is also ignored when only the DB link identifies the coach', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'u_hc', clerkOrgId: 'org_club' } as never)
    vi.mocked(prisma.organization.findUnique).mockResolvedValue({ clerkOrgId: 'org_club', houseCoachUserId: 'u_hc' } as never)
    vi.mocked(clerkClient).mockResolvedValue({
      users: { getUser: vi.fn().mockResolvedValue(coachClerkUser({})) },
      organizations: { getOrganizationInvitationList: vi.fn() },
    } as never)

    await POST(
      makeRequest({
        type: 'organizationMembership.created',
        data: { organization: { id: 'org_club' }, public_user_data: { user_id: 'clerk_hc' } },
      })
    )

    expect(prisma.user.upsert).not.toHaveBeenCalled()
  })

  it('user.updated for a houseCoach user does not overwrite the row (image, email)', async () => {
    const res = await POST(
      makeRequest({
        type: 'user.updated',
        data: {
          id: 'clerk_hc',
          image_url: 'https://img.clerk.com/default.png',
          public_metadata: { houseCoach: true },
          primary_email_address_id: 'e1',
          email_addresses: [{ id: 'e1', email_address: 'house-coach+org_club@x.com' }],
        },
      })
    )

    expect(res.status).toBe(200)
    expect(prisma.user.updateMany).not.toHaveBeenCalled()
  })

  it('organizationMembership.deleted for the house coach does not null its clerkOrgId', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'u_hc', clerkOrgId: 'org_club' } as never)
    vi.mocked(prisma.organization.findUnique).mockResolvedValue({ clerkOrgId: 'org_club', houseCoachUserId: 'u_hc' } as never)

    await POST(
      makeRequest({
        type: 'organizationMembership.deleted',
        data: { organization: { id: 'org_club' }, public_user_data: { user_id: 'clerk_hc' } },
      })
    )

    expect(prisma.user.updateMany).not.toHaveBeenCalled()
  })

  it('organizationMembership.deleted for a normal member nulls its clerkOrgId', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'u_member', clerkOrgId: 'org_club' } as never)
    vi.mocked(prisma.organization.findUnique).mockResolvedValue({ clerkOrgId: 'org_club', houseCoachUserId: 'u_hc' } as never)

    await POST(
      makeRequest({
        type: 'organizationMembership.deleted',
        data: { organization: { id: 'org_club' }, public_user_data: { user_id: 'clerk_member' } },
      })
    )

    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { clerkId: 'clerk_member' },
      data: { clerkOrgId: null },
    })
  })
})
