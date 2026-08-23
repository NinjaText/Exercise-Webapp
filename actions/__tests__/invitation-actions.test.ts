import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  mockGetOrganizationInvitationList,
  mockRevokeOrganizationInvitation,
  mockCreateOrganizationInvitation,
} = vi.hoisted(() => ({
  mockGetOrganizationInvitationList: vi.fn().mockResolvedValue({
    data: [
      { id: 'inv_1', emailAddress: 'pending@example.com', status: 'pending', createdAt: 2, expiresAt: 100 },
      { id: 'inv_2', emailAddress: 'accepted@example.com', status: 'accepted', createdAt: 1, expiresAt: 100 },
    ],
  }),
  mockRevokeOrganizationInvitation: vi.fn().mockResolvedValue({}),
  mockCreateOrganizationInvitation: vi.fn().mockResolvedValue({}),
}))

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn().mockResolvedValue({ userId: 'clerk_1' }),
  clerkClient: vi.fn().mockResolvedValue({
    organizations: {
      getOrganizationInvitationList: mockGetOrganizationInvitationList,
      revokeOrganizationInvitation: mockRevokeOrganizationInvitation,
      createOrganizationInvitation: mockCreateOrganizationInvitation,
    },
  }),
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'trainer_1', role: 'TRAINER', clerkOrgId: 'org_1',
        firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com',
      }),
    },
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/current-user', () => ({
  requireSuperAdmin: vi.fn().mockResolvedValue({
    id: 'admin_1', firstName: 'Ada', lastName: 'Admin', email: 'ada@example.com',
  }),
}))
vi.mock('@/lib/services/audit-log.service', () => ({
  logAudit: vi.fn(),
  deriveActorType: vi.fn(() => 'TRAINER'),
  AUDIT_ACTIONS: { USER_INVITED: 'USER_INVITED', USER_INVITE_REVOKED: 'USER_INVITE_REVOKED' },
}))

import { logAudit } from '@/lib/services/audit-log.service'
import { getInvitationsAction, revokeInvitationAction, resendInvitationAction } from '../invitation-actions'

const mockLogAudit = vi.mocked(logAudit)

beforeEach(() => vi.clearAllMocks())

describe('getInvitationsAction', () => {
  it('returns invitations sorted newest first for the caller trainer org', async () => {
    const result = await getInvitationsAction()
    expect(result.success).toBe(true)
    if (!result.success) throw new Error('expected success')
    expect(mockGetOrganizationInvitationList).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org_1' })
    )
    expect(result.data.map((i) => i.email)).toEqual(['pending@example.com', 'accepted@example.com'])
  })
})

describe('revokeInvitationAction', () => {
  it('revokes the invitation and logs USER_INVITE_REVOKED', async () => {
    const result = await revokeInvitationAction('inv_1', 'pending@example.com')
    expect(result.success).toBe(true)
    expect(mockRevokeOrganizationInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org_1', invitationId: 'inv_1' })
    )
    expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'USER_INVITE_REVOKED',
      orgId: 'org_1',
      targetLabel: 'pending@example.com',
    }))
  })
})

describe('resendInvitationAction', () => {
  it('creates a fresh invitation and logs USER_INVITED', async () => {
    const result = await resendInvitationAction('expired@example.com')
    expect(result.success).toBe(true)
    expect(mockCreateOrganizationInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org_1', emailAddress: 'expired@example.com' })
    )
    expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'USER_INVITED',
      orgId: 'org_1',
      targetLabel: 'expired@example.com',
    }))
  })
})
