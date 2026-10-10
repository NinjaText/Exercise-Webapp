import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn().mockResolvedValue({ userId: 'clerk_1' }),
  clerkClient: vi.fn().mockResolvedValue({
    organizations: { createOrganizationInvitation: vi.fn().mockResolvedValue({}) },
  }),
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    organization: { findFirst: vi.fn() },
    user: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'trainer_1', role: 'TRAINER', clerkOrgId: 'org_1',
        firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com',
      }),
    },
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/services/audit-log.service', () => ({
  logAudit: vi.fn(),
  deriveActorType: vi.fn(() => 'TRAINER'),
  AUDIT_ACTIONS: { USER_INVITED: 'USER_INVITED' },
}))

import { logAudit } from '@/lib/services/audit-log.service'
import { inviteClientAction } from '../invite-client-action'

const mockLogAudit = vi.mocked(logAudit)

beforeEach(() => vi.clearAllMocks())

it('logs USER_INVITED on a successful invite', async () => {
  const result = await inviteClientAction('client@example.com')
  expect(result.success).toBe(true)
  expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({
    action: 'USER_INVITED',
    orgId: 'org_1',
    targetLabel: 'client@example.com',
  }))
})
