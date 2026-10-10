import { it, expect, vi, beforeEach } from 'vitest'

// Clerk is only used for auth + the best-effort name sync after a DB save.
const mockUpdateOrganization = vi.fn().mockResolvedValue({})
const mockClerkGetOrganization = vi.fn()

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn().mockResolvedValue({ userId: 'clerk_1' }),
  clerkClient: vi.fn().mockResolvedValue({
    organizations: {
      getOrganization: (...args: any[]) => mockClerkGetOrganization(...args),
      updateOrganization: (...args: any[]) => mockUpdateOrganization(...args),
    },
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
  diffFields: (before: any, after: any, keys: string[]) => {
    const b: any = {}, a: any = {}
    let changed = false
    for (const k of keys) if (after[k] !== before[k]) { b[k] = before[k]; a[k] = after[k]; changed = true }
    return changed ? { before: b, after: a } : undefined
  },
  AUDIT_ACTIONS: { CLINIC_SETTINGS_UPDATED: 'CLINIC_SETTINGS_UPDATED' },
}))

const mockExpireBranding = vi.fn()
vi.mock('@/lib/services/branding.service', () => ({
  expireBranding: (...args: any[]) => mockExpireBranding(...args),
}))

const mockGetOrganization = vi.fn()
const mockGetOrganizationOrNull = vi.fn()
const mockUpsertOrganizationProfile = vi.fn()
vi.mock('@/lib/services/organization.service', async () => {
  const actual = await vi.importActual<typeof import('@/lib/services/organization.service')>(
    '@/lib/services/organization.service'
  )
  return {
    ...actual,
    getOrganization: (...args: any[]) => mockGetOrganization(...args),
    getOrganizationOrNull: (...args: any[]) => mockGetOrganizationOrNull(...args),
    upsertOrganizationProfile: (...args: any[]) => mockUpsertOrganizationProfile(...args),
  }
})

import { logAudit } from '@/lib/services/audit-log.service'
import { revalidatePath } from 'next/cache'
import { getOrganizationProfile, saveOrganizationProfile } from '../organization-actions'

const mockLogAudit = vi.mocked(logAudit)

function orgRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'o1', clerkOrgId: 'org_1', name: 'Old Name', tagline: 'Old tagline',
    phone: null, email: null, website: null, address: null,
    exerciseSourcePreference: 'BOTH', brandLogoOnLightUrl: null,
    ...overrides,
  }
}

/** Simulates the service: trims name, ""→null for text fields. */
function upsertLike(existing: Record<string, unknown>) {
  return async (_orgId: string, data: any) => {
    const row: any = { ...existing, name: data.name.trim() }
    for (const k of ['tagline', 'phone', 'email', 'website', 'address']) {
      if (data[k] !== undefined) row[k] = data[k]?.trim() ? data[k].trim() : null
    }
    if (data.exerciseSourcePreference !== undefined) row.exerciseSourcePreference = data.exerciseSourcePreference
    return row
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetOrganization.mockResolvedValue(orgRow())
  mockGetOrganizationOrNull.mockResolvedValue(orgRow())
  mockUpsertOrganizationProfile.mockImplementation(upsertLike(orgRow()))
  mockUpdateOrganization.mockResolvedValue({})
})

// ─── getOrganizationProfile ──────────────────────────────────────────────────

it('reads the profile from the DB Organization row without calling Clerk (logos live under Branding)', async () => {
  mockGetOrganization.mockResolvedValue(orgRow({
    phone: '555', brandLogoOnLightUrl: 'https://cdn.example.com/logo.png', exerciseSourcePreference: 'UNIVERSAL',
  }))
  const profile = await getOrganizationProfile()
  expect(mockGetOrganization).toHaveBeenCalledWith('org_1')
  expect(mockClerkGetOrganization).not.toHaveBeenCalled()
  expect(mockUpdateOrganization).not.toHaveBeenCalled()
  expect(profile).toEqual({
    organizationName: 'Old Name',
    tagline: 'Old tagline',
    phone: '555',
    email: '',
    website: '',
    address: '',
    exerciseSourcePreference: 'UNIVERSAL',
  })
})

it('maps null optional fields to empty strings', async () => {
  mockGetOrganization.mockResolvedValue(orgRow({ tagline: null }))
  const profile = await getOrganizationProfile()
  expect(profile?.tagline).toBe('')
  expect(profile).not.toHaveProperty('logoUrl')
})

it('returns the stored exerciseSourcePreference (defaults to BOTH)', async () => {
  expect((await getOrganizationProfile())?.exerciseSourcePreference).toBe('BOTH')
  mockGetOrganization.mockResolvedValue(orgRow({ exerciseSourcePreference: 'ORGANIZATION' }))
  expect((await getOrganizationProfile())?.exerciseSourcePreference).toBe('ORGANIZATION')
})

// ─── saveOrganizationProfile ─────────────────────────────────────────────────

it('rejects a blank name before touching the DB', async () => {
  const result = await saveOrganizationProfile({ organizationName: '   ' })
  expect(result).toEqual({ success: false, error: 'Organization name is required' })
  expect(mockUpsertOrganizationProfile).not.toHaveBeenCalled()
})

it('saves to the DB, then syncs the name to Clerk', async () => {
  const result = await saveOrganizationProfile({
    organizationName: '  New Name  ', tagline: 'Old tagline', phone: '555',
  })
  expect(result).toEqual({ success: true })
  expect(mockUpsertOrganizationProfile).toHaveBeenCalledWith('org_1', {
    name: 'New Name',
    tagline: 'Old tagline',
    phone: '555',
    email: '',
    website: '',
    address: '',
    exerciseSourcePreference: 'BOTH',
  })
  expect(mockUpdateOrganization).toHaveBeenCalledWith('org_1', { name: 'New Name' })
  // DB first, then Clerk.
  expect(mockUpsertOrganizationProfile.mock.invocationCallOrder[0])
    .toBeLessThan(mockUpdateOrganization.mock.invocationCallOrder[0])
  expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith('/settings/clinic')
  // The org name feeds the branded display name, so the branding cache is expired.
  expect(mockExpireBranding).toHaveBeenCalledWith('org_1')
})

it('never writes publicMetadata to Clerk', async () => {
  await saveOrganizationProfile({ organizationName: 'New Name' })
  for (const call of mockUpdateOrganization.mock.calls) {
    expect(call[1]).not.toHaveProperty('publicMetadata')
  }
})

it('still succeeds (and logs) when the Clerk name sync fails — the DB is canonical', async () => {
  const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  mockUpdateOrganization.mockRejectedValue(new Error('Clerk down'))
  const result = await saveOrganizationProfile({ organizationName: 'New Name', tagline: 'Old tagline' })
  expect(result).toEqual({ success: true })
  expect(errSpy).toHaveBeenCalled()
  expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'CLINIC_SETTINGS_UPDATED' }))
  errSpy.mockRestore()
})

it('fails when the DB save fails, without syncing to Clerk or logging', async () => {
  const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  mockUpsertOrganizationProfile.mockRejectedValue(new Error('db down'))
  const result = await saveOrganizationProfile({ organizationName: 'New Name' })
  expect(result).toEqual({ success: false, error: 'Failed to save organization profile' })
  expect(mockUpdateOrganization).not.toHaveBeenCalled()
  expect(mockLogAudit).not.toHaveBeenCalled()
  expect(mockExpireBranding).not.toHaveBeenCalled()
  errSpy.mockRestore()
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

it('never touches the logo column or logs it in the audit diff (logos live under Branding)', async () => {
  const existing = orgRow({ brandLogoOnLightUrl: 'https://cdn.example.com/old.png' })
  mockGetOrganizationOrNull.mockResolvedValue(existing)
  mockUpsertOrganizationProfile.mockImplementation(upsertLike(existing))
  await saveOrganizationProfile({ organizationName: 'New Name', tagline: 'Old tagline' })
  expect(mockUpsertOrganizationProfile.mock.calls[0][1]).not.toHaveProperty('brandLogoOnLightUrl')
  expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({
    metadata: { before: { organizationName: 'Old Name' }, after: { organizationName: 'New Name' } },
  }))
})

it('still saves successfully and logs with no diff metadata when the "before" fetch fails', async () => {
  const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  mockGetOrganizationOrNull.mockRejectedValue(new Error('db read failed'))
  const result = await saveOrganizationProfile({ organizationName: 'New Name', tagline: 'Old tagline' })
  expect(result).toEqual({ success: true })
  expect(mockUpsertOrganizationProfile).toHaveBeenCalled()
  expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({
    action: 'CLINIC_SETTINGS_UPDATED',
    orgId: 'org_1',
    metadata: undefined,
  }))
  errSpy.mockRestore()
})

it('saves exerciseSourcePreference and includes it in the audit diff', async () => {
  const result = await saveOrganizationProfile({
    organizationName: 'New Name',
    tagline: 'Old tagline',
    exerciseSourcePreference: 'ORGANIZATION',
  })
  expect(result.success).toBe(true)
  expect(mockUpsertOrganizationProfile).toHaveBeenCalledWith('org_1', expect.objectContaining({
    exerciseSourcePreference: 'ORGANIZATION',
  }))
  expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({
    metadata: expect.objectContaining({
      after: expect.objectContaining({ exerciseSourcePreference: 'ORGANIZATION' }),
    }),
  }))
})

it('rejects an invalid exerciseSourcePreference by falling back to BOTH rather than storing garbage', async () => {
  const result = await saveOrganizationProfile({
    organizationName: 'New Name',
    tagline: 'Old tagline',
    exerciseSourcePreference: 'NOT_REAL' as never,
  })
  expect(result.success).toBe(true)
  expect(mockUpsertOrganizationProfile).toHaveBeenCalledWith('org_1', expect.objectContaining({
    exerciseSourcePreference: 'BOTH',
  }))
})
