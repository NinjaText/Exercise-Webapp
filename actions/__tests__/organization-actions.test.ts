import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetOrganization = vi.fn().mockResolvedValue({
  name: 'Old Name',
  publicMetadata: { tagline: 'Old tagline' },
})
const mockUpdateOrganization = vi.fn().mockResolvedValue({})

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn().mockResolvedValue({ userId: 'clerk_1' }),
  clerkClient: vi.fn().mockResolvedValue({
    organizations: {
      getOrganization: (...args: any[]) => mockGetOrganization(...args),
      updateOrganization: (...args: any[]) => mockUpdateOrganization(...args),
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
vi.mock('@/lib/services/audit-log.service', () => ({
  logAudit: vi.fn(),
  deriveActorType: vi.fn(() => 'TRAINER'),
  diffFields: (before: any, after: any, keys: string[]) => {
    const b: any = {}, a: any = {}
    let changed = false
    for (const k of keys) if (after[k] !== before[k]) { b[k] = before[k]; a[k] = after[k]; changed = true }
    return changed ? { before: b, after: a } : undefined
  },
  AUDIT_ACTIONS: { CLINIC_SETTINGS_UPDATED: 'CLINIC_SETTINGS_UPDATED' },
}))

import { logAudit } from '@/lib/services/audit-log.service'
import { getOrganizationProfile, saveOrganizationProfile } from '../organization-actions'

const mockLogAudit = vi.mocked(logAudit)

beforeEach(() => {
  vi.clearAllMocks()
  mockGetOrganization.mockResolvedValue({
    name: 'Old Name',
    publicMetadata: { tagline: 'Old tagline' },
  })
  mockUpdateOrganization.mockResolvedValue({})
})

it('logs CLINIC_SETTINGS_UPDATED with a before/after diff', async () => {
  const result = await saveOrganizationProfile({ organizationName: 'New Name', tagline: 'Old tagline' })
  expect(result.success).toBe(true)
  expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({
    action: 'CLINIC_SETTINGS_UPDATED',
    orgId: 'org_1',
    metadata: { before: { organizationName: 'Old Name' }, after: { organizationName: 'New Name' } },
  }))
})

it('still saves successfully and logs with no diff metadata when the "before" fetch (getOrganizationProfile) fails', async () => {
  mockGetOrganization.mockRejectedValue(new Error('Clerk API unavailable'))
  const result = await saveOrganizationProfile({ organizationName: 'New Name', tagline: 'Old tagline' })
  expect(result).toEqual({ success: true })
  expect(mockUpdateOrganization).toHaveBeenCalled()
  expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({
    action: 'CLINIC_SETTINGS_UPDATED',
    orgId: 'org_1',
    metadata: undefined,
  }))
})

it('defaults exerciseSourcePreference to BOTH when not set in publicMetadata', async () => {
  mockGetOrganization.mockResolvedValue({ name: 'Old Name', publicMetadata: {} })
  const profile = await getOrganizationProfile()
  expect(profile?.exerciseSourcePreference).toBe('BOTH')
})

it('returns a stored valid exerciseSourcePreference as-is', async () => {
  mockGetOrganization.mockResolvedValue({
    name: 'Old Name',
    publicMetadata: { exerciseSourcePreference: 'UNIVERSAL' },
  })
  const profile = await getOrganizationProfile()
  expect(profile?.exerciseSourcePreference).toBe('UNIVERSAL')
})

it('falls back to BOTH for a corrupted or unrecognized stored value', async () => {
  mockGetOrganization.mockResolvedValue({
    name: 'Old Name',
    publicMetadata: { exerciseSourcePreference: 'GARBAGE' },
  })
  const profile = await getOrganizationProfile()
  expect(profile?.exerciseSourcePreference).toBe('BOTH')
})

it('saves exerciseSourcePreference and includes it in the audit diff', async () => {
  mockGetOrganization.mockResolvedValue({
    name: 'Old Name',
    publicMetadata: { tagline: 'Old tagline', exerciseSourcePreference: 'BOTH' },
  })
  const result = await saveOrganizationProfile({
    organizationName: 'New Name',
    tagline: 'Old tagline',
    exerciseSourcePreference: 'ORGANIZATION',
  })
  expect(result.success).toBe(true)
  expect(mockUpdateOrganization).toHaveBeenCalledWith('org_1', expect.objectContaining({
    publicMetadata: expect.objectContaining({ exerciseSourcePreference: 'ORGANIZATION' }),
  }))
  expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({
    metadata: expect.objectContaining({
      after: expect.objectContaining({ exerciseSourcePreference: 'ORGANIZATION' }),
    }),
  }))
})

it('rejects an invalid exerciseSourcePreference by falling back to BOTH rather than storing garbage', async () => {
  mockGetOrganization.mockResolvedValue({
    name: 'Old Name',
    publicMetadata: { tagline: 'Old tagline', exerciseSourcePreference: 'BOTH' },
  })
  const result = await saveOrganizationProfile({
    organizationName: 'New Name',
    tagline: 'Old tagline',
    exerciseSourcePreference: 'NOT_REAL' as never,
  })
  expect(result.success).toBe(true)
  expect(mockUpdateOrganization).toHaveBeenCalledWith('org_1', expect.objectContaining({
    publicMetadata: expect.objectContaining({ exerciseSourcePreference: 'BOTH' }),
  }))
})
