import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({
  unstable_cache: vi.fn((fn: (...args: any[]) => any) => fn),
  updateTag: vi.fn(),
}))
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  cache: <T,>(fn: T) => fn,
}))
vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    organization: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}))

import { unstable_cache, updateTag } from 'next/cache'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { BRANDING_SELECT, DEFAULT_BRANDING } from '@/lib/branding/resolve'
import {
  brandingTag,
  expireBranding,
  getCurrentBranding,
  getOrgBranding,
} from '../branding.service'

const mockOrgFindUnique = vi.mocked(prisma.organization.findUnique)
const mockUserFindUnique = vi.mocked(prisma.user.findUnique)
const mockAuth = vi.mocked(auth)
const mockUnstableCache = vi.mocked(unstable_cache)
const mockUpdateTag = vi.mocked(updateTag)

const record = {
  clerkOrgId: 'org_1',
  name: 'Acme Physio',
  tagline: 'Move better',
  brandingEnabled: true,
  brandDisplayName: 'Acme',
  brandPrimaryColor: '#1d4ed8',
  brandLogoOnLightUrl: null,
  brandLogoOnDarkUrl: null,
  brandMarkUrl: null,
  brandFaviconUrl: null,
  brandAppleIconUrl: null,
}

describe('branding.service', () => {
  beforeEach(() => {
    mockOrgFindUnique.mockReset()
    mockUserFindUnique.mockReset()
    mockAuth.mockReset()
    mockUpdateTag.mockReset()
  })

  it('brandingTag builds a per-org tag', () => {
    expect(brandingTag('org_1')).toBe('org-branding:org_1')
  })

  describe('getOrgBranding', () => {
    it('returns defaults for null without touching the DB', async () => {
      const result = await getOrgBranding(null)
      expect(result).toEqual(DEFAULT_BRANDING)
      expect(mockOrgFindUnique).not.toHaveBeenCalled()
    })

    it('queries with BRANDING_SELECT and returns the resolved shape', async () => {
      mockOrgFindUnique.mockResolvedValue(record as never)
      const result = await getOrgBranding('org_1')

      expect(mockOrgFindUnique).toHaveBeenCalledWith({
        where: { clerkOrgId: 'org_1' },
        select: BRANDING_SELECT,
      })
      expect(result.enabled).toBe(true)
      expect(result.orgId).toBe('org_1')
      expect(result.displayName).toBe('Acme')
      expect(result.tagline).toBe('Move better')
      expect(result.css).toMatch(/^:root:not\(\.dark\)\{/)
      expect(result.tokens).not.toBeNull()
      expect(result.themeColor).toBe(result.primaryHex)
    })

    it('returns defaults when the org has no row', async () => {
      mockOrgFindUnique.mockResolvedValue(null)
      expect(await getOrgBranding('org_missing')).toEqual(DEFAULT_BRANDING)
    })

    it('builds the cached loader per org with a per-org key and tag', async () => {
      mockOrgFindUnique.mockResolvedValue(record as never)
      await getOrgBranding('org_tagged')

      const call = mockUnstableCache.mock.calls.find(
        ([, keyParts]) => keyParts?.[1] === 'org_tagged',
      )
      expect(call).toBeDefined()
      expect(call![1]).toEqual(['org-branding', 'org_tagged'])
      expect(call![2]).toEqual({
        tags: ['org-branding:org_tagged'],
        revalidate: 3600,
      })
    })

    it('memoises the cached loader per org', async () => {
      mockOrgFindUnique.mockResolvedValue(record as never)
      await getOrgBranding('org_memo')
      await getOrgBranding('org_memo')
      const calls = mockUnstableCache.mock.calls.filter(
        ([, keyParts]) => keyParts?.[1] === 'org_memo',
      )
      expect(calls).toHaveLength(1)
    })
  })

  describe('expireBranding', () => {
    it('calls updateTag with the org tag', () => {
      expireBranding('org_1')
      expect(mockUpdateTag).toHaveBeenCalledWith('org-branding:org_1')
    })
  })

  describe('getCurrentBranding', () => {
    it('returns defaults without querying when unauthenticated', async () => {
      mockAuth.mockResolvedValue({ userId: null } as never)
      expect(await getCurrentBranding()).toEqual(DEFAULT_BRANDING)
      expect(mockUserFindUnique).not.toHaveBeenCalled()
      expect(mockOrgFindUnique).not.toHaveBeenCalled()
    })

    it('returns defaults without an org query when the DB user is missing', async () => {
      mockAuth.mockResolvedValue({ userId: 'clerk_1' } as never)
      mockUserFindUnique.mockResolvedValue(null)
      expect(await getCurrentBranding()).toEqual(DEFAULT_BRANDING)
      expect(mockOrgFindUnique).not.toHaveBeenCalled()
    })

    it('returns defaults without an org query when the user has no org', async () => {
      mockAuth.mockResolvedValue({ userId: 'clerk_1', orgId: 'org_claim' } as never)
      mockUserFindUnique.mockResolvedValue({ clerkOrgId: null } as never)
      expect(await getCurrentBranding()).toEqual(DEFAULT_BRANDING)
      expect(mockOrgFindUnique).not.toHaveBeenCalled()
    })

    it("resolves the DB user's clerkOrgId, not the session orgId claim", async () => {
      mockAuth.mockResolvedValue({ userId: 'clerk_1', orgId: 'org_claim' } as never)
      mockUserFindUnique.mockResolvedValue({ clerkOrgId: 'org_1' } as never)
      mockOrgFindUnique.mockResolvedValue(record as never)

      const result = await getCurrentBranding()

      expect(mockUserFindUnique).toHaveBeenCalledWith({
        where: { clerkId: 'clerk_1' },
        select: { clerkOrgId: true },
      })
      expect(mockOrgFindUnique).toHaveBeenCalledWith({
        where: { clerkOrgId: 'org_1' },
        select: BRANDING_SELECT,
      })
      expect(result.orgId).toBe('org_1')
    })
  })
})
