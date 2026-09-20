import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/current-user', () => ({ requireSuperAdmin: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      update: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/services/audit-log.service', () => ({
  logAudit: vi.fn(),
  deriveActorType: vi.fn(() => 'SUPER_ADMIN'),
  AUDIT_ACTIONS: {
    USER_DEACTIVATED: 'USER_DEACTIVATED',
    USER_REACTIVATED: 'USER_REACTIVATED',
    USER_DELETED: 'USER_DELETED',
  },
}))
vi.mock('@/lib/services/user-deletion.service', () => ({
  findDeletionBlockers: vi.fn(),
  deleteUserData: vi.fn(),
}))

import { requireSuperAdmin } from '@/lib/current-user'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/services/audit-log.service'
import { findDeletionBlockers, deleteUserData } from '@/lib/services/user-deletion.service'
import { archiveUserAction, restoreUserAction, deleteUserAction } from '../admin-actions'

const mockRequireSuperAdmin = vi.mocked(requireSuperAdmin)
const mockUserUpdate = vi.mocked(prisma.user.update)
const mockUserFindUnique = vi.mocked(prisma.user.findUnique)
const mockLogAudit = vi.mocked(logAudit)
const mockFindBlockers = vi.mocked(findDeletionBlockers)
const mockDeleteUserData = vi.mocked(deleteUserData)

beforeEach(() => {
  vi.clearAllMocks()
  mockRequireSuperAdmin.mockResolvedValue({ id: 'admin_1' } as any)
  mockUserFindUnique.mockResolvedValue({
    id: 'user_1', firstName: 'Sam', lastName: 'Client', email: 'sam@example.com',
    role: 'CLIENT', clerkOrgId: 'org_9',
  } as any)
  mockFindBlockers.mockResolvedValue([])
  mockDeleteUserData.mockResolvedValue(undefined)
})

describe('archiveUserAction', () => {
  it('sets isActive false and returns success', async () => {
    mockUserUpdate.mockResolvedValue({} as any)
    const result = await archiveUserAction('user_1')
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      data: { isActive: false },
    })
    expect(result.success).toBe(true)
    expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'USER_DEACTIVATED',
      targetType: 'User',
      targetId: 'user_1',
      orgId: 'org_9',
    }))
  })

  it('returns error when not super admin', async () => {
    mockRequireSuperAdmin.mockRejectedValue(new Error('Forbidden'))
    const result = await archiveUserAction('user_1')
    expect(result.success).toBe(false)
    expect((result as any).error).toBeDefined()
  })

  it('still returns success when the audit lookup (findUnique) fails', async () => {
    mockUserUpdate.mockResolvedValue({} as any)
    mockUserFindUnique.mockRejectedValue(new Error('transient db error'))
    const result = await archiveUserAction('user_1')
    expect(result).toEqual({ success: true })
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      data: { isActive: false },
    })
  })
})

describe('restoreUserAction', () => {
  it('sets isActive true and returns success', async () => {
    mockUserUpdate.mockResolvedValue({} as any)
    const result = await restoreUserAction('user_1')
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      data: { isActive: true },
    })
    expect(result.success).toBe(true)
    expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'USER_REACTIVATED',
      targetType: 'User',
      targetId: 'user_1',
      orgId: 'org_9',
    }))
  })
})

describe('deleteUserAction', () => {
  it('hard deletes the user and returns success', async () => {
    const result = await deleteUserAction('user_1')
    expect(mockDeleteUserData).toHaveBeenCalledWith('user_1')
    expect(result.success).toBe(true)
    expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'USER_DELETED',
      targetType: 'User',
      targetId: 'user_1',
      orgId: 'org_9',
    }))
  })

  it('logs USER_DELETED with the pre-fetched target, after the delete succeeds', async () => {
    const result = await deleteUserAction('user_1')

    expect(result.success).toBe(true)
    // The delete must actually succeed before the audit row is written, so a
    // failed delete never produces a false "deleted" audit entry.
    expect(mockDeleteUserData.mock.invocationCallOrder[0]).toBeLessThan(
      mockLogAudit.mock.invocationCallOrder[0]
    )
  })

  it('refuses when the user owns rows other users depend on', async () => {
    mockFindBlockers.mockResolvedValue([
      { code: 'PACKAGES', count: 1, message: 'this trainer has 1 coaching package(s) for sale. Remove them first.' },
    ])
    const result = await deleteUserAction('user_1')
    expect(result).toEqual({
      success: false,
      error: 'Cannot delete: this trainer has 1 coaching package(s) for sale. Remove them first.',
    })
    expect(mockDeleteUserData).not.toHaveBeenCalled()
    expect(mockLogAudit).not.toHaveBeenCalled()
  })

  it('does not log USER_DELETED when the delete itself fails with a relation error, and preserves the existing error message', async () => {
    const relationError = Object.assign(new Error('Foreign key constraint failed'), { code: 'P2003' })
    mockDeleteUserData.mockRejectedValue(relationError)

    const result = await deleteUserAction('user_1')

    expect(result).toEqual({
      success: false,
      error: "Cannot delete: this user has existing data that couldn't be fully cleared. Archive them instead.",
    })
    expect(mockLogAudit).not.toHaveBeenCalled()
  })
})
