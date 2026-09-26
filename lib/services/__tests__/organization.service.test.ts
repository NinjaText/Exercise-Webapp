import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockClerkGetOrganization = vi.fn()

vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: vi.fn().mockResolvedValue({
    organizations: {
      getOrganization: (...args: any[]) => mockClerkGetOrganization(...args),
    },
  }),
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    organization: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import { clerkClient } from '@clerk/nextjs/server'
import {
  ORG_PROFILE_KEYS,
  normalizePreference,
  getOrganization,
  getOrganizationOrNull,
  upsertOrganizationProfile,
} from '../organization.service'

const mockFindUnique = vi.mocked(prisma.organization.findUnique)
const mockUpsert = vi.mocked(prisma.organization.upsert)
const mockClerkClient = vi.mocked(clerkClient)

const row = {
  id: 'o1',
  clerkOrgId: 'org_1',
  name: 'Acme Physio',
  exerciseSourcePreference: 'BOTH',
} as any

beforeEach(() => {
  vi.clearAllMocks()
  mockUpsert.mockImplementation((async (args: any) => ({ ...row, ...args.create })) as any)
})

describe('ORG_PROFILE_KEYS', () => {
  it('lists the profile fields', () => {
    expect(ORG_PROFILE_KEYS).toEqual([
      'name', 'tagline', 'phone', 'email', 'website', 'address', 'exerciseSourcePreference',
    ])
  })
})

describe('normalizePreference', () => {
  it('keeps valid values and falls back to BOTH', () => {
    expect(normalizePreference('UNIVERSAL')).toBe('UNIVERSAL')
    expect(normalizePreference('ORGANIZATION')).toBe('ORGANIZATION')
    expect(normalizePreference('BOTH')).toBe('BOTH')
    expect(normalizePreference('nonsense')).toBe('BOTH')
    expect(normalizePreference(undefined)).toBe('BOTH')
  })
})

describe('getOrganizationOrNull', () => {
  it('returns the row without calling Clerk', async () => {
    mockFindUnique.mockResolvedValue(row)
    await expect(getOrganizationOrNull('org_1')).resolves.toBe(row)
    expect(mockFindUnique).toHaveBeenCalledWith({ where: { clerkOrgId: 'org_1' } })
    expect(mockClerkClient).not.toHaveBeenCalled()
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('returns null when missing, without calling Clerk or creating', async () => {
    mockFindUnique.mockResolvedValue(null)
    await expect(getOrganizationOrNull('org_1')).resolves.toBeNull()
    expect(mockClerkClient).not.toHaveBeenCalled()
    expect(mockUpsert).not.toHaveBeenCalled()
  })
})

describe('getOrganization', () => {
  it('returns the existing row without calling Clerk', async () => {
    mockFindUnique.mockResolvedValue(row)
    await expect(getOrganization('org_1')).resolves.toBe(row)
    expect(mockClerkClient).not.toHaveBeenCalled()
    expect(mockClerkGetOrganization).not.toHaveBeenCalled()
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('lazily creates the row from the Clerk org name when missing', async () => {
    mockFindUnique.mockResolvedValue(null)
    mockClerkGetOrganization.mockResolvedValue({ id: 'org_1', name: 'From Clerk' })

    const result = await getOrganization('org_1')

    expect(mockClerkGetOrganization).toHaveBeenCalledWith({ organizationId: 'org_1' })
    expect(mockUpsert).toHaveBeenCalledWith({
      where: { clerkOrgId: 'org_1' },
      update: {},
      create: { clerkOrgId: 'org_1', name: 'From Clerk' },
    })
    expect(result.name).toBe('From Clerk')
  })

  // Two concurrent lazy-creates for the same org race the upsert; the loser
  // hits the unique index on clerkOrgId and gets a Prisma P2002. Rather than
  // propagate that as a failure, re-read the winner's row.
  it('re-reads the row on a P2002 from a concurrent lazy-create', async () => {
    mockFindUnique.mockReset()
    mockFindUnique
      .mockResolvedValueOnce(null) // initial getOrganizationOrNull miss
      .mockResolvedValueOnce(row) // re-read after the losing upsert
    mockClerkGetOrganization.mockResolvedValue({ id: 'org_1', name: 'From Clerk' })
    mockUpsert.mockRejectedValue(
      Object.assign(new Error('Unique constraint failed on clerkOrgId'), { code: 'P2002' })
    )

    await expect(getOrganization('org_1')).resolves.toBe(row)

    expect(mockFindUnique).toHaveBeenCalledTimes(2)
    expect(mockFindUnique).toHaveBeenLastCalledWith({ where: { clerkOrgId: 'org_1' } })
  })

  it('throws if the re-read after a P2002 still finds nothing', async () => {
    mockFindUnique.mockReset()
    mockFindUnique.mockResolvedValue(null)
    mockClerkGetOrganization.mockResolvedValue({ id: 'org_1', name: 'From Clerk' })
    mockUpsert.mockRejectedValue(
      Object.assign(new Error('Unique constraint failed on clerkOrgId'), { code: 'P2002' })
    )

    await expect(getOrganization('org_1')).rejects.toThrow()
  })

  it('rethrows non-P2002 errors from the upsert', async () => {
    mockFindUnique.mockReset()
    mockFindUnique.mockResolvedValue(null)
    mockClerkGetOrganization.mockResolvedValue({ id: 'org_1', name: 'From Clerk' })
    mockUpsert.mockRejectedValue(Object.assign(new Error('connection lost'), { code: 'P1001' }))

    await expect(getOrganization('org_1')).rejects.toThrow('connection lost')
    expect(mockFindUnique).toHaveBeenCalledTimes(1)
  })
})

describe('upsertOrganizationProfile', () => {
  it('trims name, maps empty strings to null, and upserts on clerkOrgId', async () => {
    await upsertOrganizationProfile('org_1', {
      name: '  Acme Physio  ',
      tagline: '',
      phone: '  ',
      email: ' hi@acme.test ',
      website: 'https://acme.test',
      address: null,
      exerciseSourcePreference: 'UNIVERSAL',
    })

    const expected = {
      name: 'Acme Physio',
      tagline: null,
      phone: null,
      email: 'hi@acme.test',
      website: 'https://acme.test',
      address: null,
      exerciseSourcePreference: 'UNIVERSAL',
    }
    expect(mockUpsert).toHaveBeenCalledWith({
      where: { clerkOrgId: 'org_1' },
      update: expected,
      create: { clerkOrgId: 'org_1', ...expected },
    })
  })

  it('falls back to BOTH for an invalid exerciseSourcePreference', async () => {
    await upsertOrganizationProfile('org_1', {
      name: 'Acme',
      exerciseSourcePreference: 'WHATEVER' as any,
    })
    const args = mockUpsert.mock.calls[0][0] as any
    expect(args.update.exerciseSourcePreference).toBe('BOTH')
    expect(args.create.exerciseSourcePreference).toBe('BOTH')
  })

  it('leaves omitted optional fields out of the update', async () => {
    await upsertOrganizationProfile('org_1', { name: 'Acme' })
    const args = mockUpsert.mock.calls[0][0] as any
    expect(args.update).toEqual({ name: 'Acme' })
    expect(args.create).toEqual({ clerkOrgId: 'org_1', name: 'Acme' })
  })

  it('rejects an empty name', async () => {
    await expect(upsertOrganizationProfile('org_1', { name: '   ' })).rejects.toThrow()
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('does not accept or write the logo column (logos live under Branding)', async () => {
    await upsertOrganizationProfile('org_1', {
      name: 'Acme',
      // @ts-expect-error — brandLogoOnLightUrl is no longer part of the profile input
      brandLogoOnLightUrl: 'https://cdn.acme.test/logo.png',
    })
    const args = mockUpsert.mock.calls[0][0] as any
    expect('brandLogoOnLightUrl' in args.update).toBe(false)
    expect('brandLogoOnLightUrl' in args.create).toBe(false)
  })
})
