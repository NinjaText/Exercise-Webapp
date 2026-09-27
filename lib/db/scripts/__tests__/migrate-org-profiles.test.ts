import { describe, it, expect, vi } from 'vitest'

// The service module is imported for its pure helpers only; stub its I/O deps.
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@clerk/nextjs/server', () => ({ clerkClient: vi.fn() }))

import { migrateOrgProfiles, type ClerkOrgLike } from '../migrate-org-profiles'

function makeOrgs(n: number): ClerkOrgLike[] {
  return Array.from({ length: n }, (_, i) => ({ id: `org_${i}`, name: `Org ${i}`, publicMetadata: {} }))
}

function fakeFetcher(orgs: ClerkOrgLike[]) {
  return vi.fn(async ({ limit, offset }: { limit: number; offset: number }) => ({
    data: orgs.slice(offset, offset + limit),
    totalCount: orgs.length,
  }))
}

function fakePrisma(existingIds: string[] = []) {
  const existing = new Set(existingIds)
  return {
    organization: {
      findUnique: vi.fn(async ({ where }: { where: { clerkOrgId: string } }) =>
        existing.has(where.clerkOrgId) ? { id: `db_${where.clerkOrgId}` } : null,
      ),
      upsert: vi.fn<(args: { update: Record<string, unknown>; create: Record<string, unknown> }) => Promise<object>>(
        async () => ({}),
      ),
    },
  }
}

describe('migrateOrgProfiles', () => {
  it('pages through more than 100 orgs, 100 at a time', async () => {
    const orgs = makeOrgs(250)
    const fetchOrgs = fakeFetcher(orgs)
    const db = fakePrisma()

    const summary = await migrateOrgProfiles({ fetchOrgs, prisma: db })

    expect(fetchOrgs.mock.calls.map((c) => c[0])).toEqual([
      { limit: 100, offset: 0 },
      { limit: 100, offset: 100 },
      { limit: 100, offset: 200 },
    ])
    expect(db.organization.upsert).toHaveBeenCalledTimes(250)
    expect(summary.created).toBe(250)
  })

  it('maps empty-string metadata to null and invalid preference to BOTH', async () => {
    const db = fakePrisma()
    await migrateOrgProfiles({
      fetchOrgs: fakeFetcher([{
        id: 'org_a',
        name: 'Acme',
        publicMetadata: {
          tagline: '', phone: '  ', email: '', website: '', address: '',
          logoUrl: '', exerciseSourcePreference: 'NONSENSE',
        },
      }]),
      prisma: db,
    })

    const expected = {
      name: 'Acme', tagline: null, phone: null, email: null, website: null, address: null,
      exerciseSourcePreference: 'BOTH',
    }
    expect(db.organization.upsert).toHaveBeenCalledWith({
      where: { clerkOrgId: 'org_a' },
      update: expected,
      create: { clerkOrgId: 'org_a', ...expected },
    })
  })

  it('carries metadata values and a valid preference through (trimmed)', async () => {
    const db = fakePrisma()
    await migrateOrgProfiles({
      fetchOrgs: fakeFetcher([{
        id: 'org_b',
        name: 'Beta',
        publicMetadata: {
          tagline: ' Move well ', phone: '555', email: 'a@b.co', website: 'https://b.co',
          address: '1 Main St', exerciseSourcePreference: 'ORGANIZATION',
        },
      }]),
      prisma: db,
    })
    const call = db.organization.upsert.mock.calls[0][0] as { update: Record<string, unknown> }
    expect(call.update).toEqual({
      name: 'Beta', tagline: 'Move well', phone: '555', email: 'a@b.co', website: 'https://b.co',
      address: '1 Main St', exerciseSourcePreference: 'ORGANIZATION',
    })
  })

  it('handles orgs with no publicMetadata at all', async () => {
    const db = fakePrisma()
    await migrateOrgProfiles({
      fetchOrgs: fakeFetcher([{ id: 'org_n', name: 'Null Meta', publicMetadata: null }]),
      prisma: db,
    })
    const call = db.organization.upsert.mock.calls[0][0] as { update: Record<string, unknown> }
    expect(call.update).toMatchObject({ name: 'Null Meta', tagline: null, exerciseSourcePreference: 'BOTH' })
  })

  it('carries an https logo to brandLogoOnLightUrl but not http or non-URL values', async () => {
    const db = fakePrisma()
    const summary = await migrateOrgProfiles({
      fetchOrgs: fakeFetcher([
        { id: 'org_https', name: 'H', publicMetadata: { logoUrl: 'https://cdn.example.com/logo.png' } },
        { id: 'org_http', name: 'P', publicMetadata: { logoUrl: 'http://cdn.example.com/logo.png' } },
        { id: 'org_junk', name: 'J', publicMetadata: { logoUrl: 'not a url' } },
      ]),
      prisma: db,
    })

    const calls = db.organization.upsert.mock.calls.map((c) => c[0]) as Array<{
      update: Record<string, unknown>; create: Record<string, unknown>
    }>
    expect(calls[0].update.brandLogoOnLightUrl).toBe('https://cdn.example.com/logo.png')
    expect(calls[0].create.brandLogoOnLightUrl).toBe('https://cdn.example.com/logo.png')
    for (const c of calls.slice(1)) {
      expect(c.update).not.toHaveProperty('brandLogoOnLightUrl')
      expect(c.create).not.toHaveProperty('brandLogoOnLightUrl')
    }
    expect(summary.withLogo).toBe(1)
  })

  it('never writes brandingEnabled', async () => {
    const db = fakePrisma()
    await migrateOrgProfiles({
      fetchOrgs: fakeFetcher([
        { id: 'org_x', name: 'X', publicMetadata: { logoUrl: 'https://x.co/l.png', brandingEnabled: true } },
      ]),
      prisma: db,
    })
    const call = db.organization.upsert.mock.calls[0][0] as {
      update: Record<string, unknown>; create: Record<string, unknown>
    }
    expect(call.update).not.toHaveProperty('brandingEnabled')
    expect(call.create).not.toHaveProperty('brandingEnabled')
  })

  it('counts created vs updated vs withLogo', async () => {
    const db = fakePrisma(['org_1', 'org_3'])
    const orgs: ClerkOrgLike[] = [
      { id: 'org_0', name: 'A', publicMetadata: { logoUrl: 'https://a.co/l.png' } },
      { id: 'org_1', name: 'B', publicMetadata: { logoUrl: 'https://b.co/l.png' } },
      { id: 'org_2', name: 'C', publicMetadata: {} },
      { id: 'org_3', name: 'D', publicMetadata: { logoUrl: 'http://d.co/l.png' } },
    ]
    const summary = await migrateOrgProfiles({ fetchOrgs: fakeFetcher(orgs), prisma: db })
    expect(summary).toEqual({ created: 2, updated: 2, withLogo: 2 })
  })

  it('stops on an empty page even if totalCount overstates', async () => {
    const fetchOrgs = vi.fn(async () => ({ data: [], totalCount: 5 }))
    const summary = await migrateOrgProfiles({ fetchOrgs, prisma: fakePrisma() })
    expect(fetchOrgs).toHaveBeenCalledTimes(1)
    expect(summary).toEqual({ created: 0, updated: 0, withLogo: 0 })
  })
})
