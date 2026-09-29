import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/lib/current-user', () => ({ getCurrentUser: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { organization: { findUnique: vi.fn() } } }))

import { prisma } from '@/lib/prisma'
import { getCapabilitiesForUser } from '@/lib/org-capabilities.server'

beforeEach(() => vi.clearAllMocks())

describe('getCapabilitiesForUser', () => {
  it('reads the org by the user’s DB clerkOrgId', async () => {
    vi.mocked(prisma.organization.findUnique).mockResolvedValue({ clerkOrgId: 'org_c', type: 'CLUB' } as never)
    const caps = await getCapabilitiesForUser({ clerkOrgId: 'org_c' })
    expect(prisma.organization.findUnique).toHaveBeenCalledWith({ where: { clerkOrgId: 'org_c' } })
    expect(caps).toMatchObject({ messaging: false, coachNotifications: false })
  })

  it('gives trainer capabilities to a trainer org or an org-less user', async () => {
    vi.mocked(prisma.organization.findUnique).mockResolvedValue({ clerkOrgId: 'org_t' } as never)
    expect(await getCapabilitiesForUser({ clerkOrgId: 'org_t' })).toMatchObject({ messaging: true, coachNotifications: true })
    expect(await getCapabilitiesForUser({ clerkOrgId: null })).toMatchObject({ messaging: true, coachNotifications: true })
  })
})
