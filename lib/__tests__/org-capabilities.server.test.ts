import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/lib/current-user', () => ({ getCurrentUser: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    organization: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    memberCoaching: { findUnique: vi.fn(), findMany: vi.fn() },
  },
}))

import { prisma } from '@/lib/prisma'
import {
  getCapabilitiesForUser,
  getCoachingActive,
  canCoachInteract,
  filterCoachableClientIds,
} from '@/lib/org-capabilities.server'

const club = { clerkOrgId: 'org_c', type: 'CLUB' }
const trainerOrg = { clerkOrgId: 'org_t' }

beforeEach(() => vi.clearAllMocks())

describe('getCapabilitiesForUser', () => {
  it('reads the org by the user’s DB clerkOrgId', async () => {
    vi.mocked(prisma.organization.findUnique).mockResolvedValue(club as never)
    vi.mocked(prisma.memberCoaching.findUnique).mockResolvedValue(null)
    const caps = await getCapabilitiesForUser({ id: 'u1', role: 'CLIENT', clerkOrgId: 'org_c' })
    expect(prisma.organization.findUnique).toHaveBeenCalledWith({ where: { clerkOrgId: 'org_c' } })
    expect(caps).toMatchObject({ messaging: false, coachNotifications: false })
  })

  it('gives trainer-org users the full set without a coaching query', async () => {
    vi.mocked(prisma.organization.findUnique).mockResolvedValue(trainerOrg as never)
    expect(await getCapabilitiesForUser({ id: 't1', role: 'TRAINER', clerkOrgId: 'org_t' })).toMatchObject({
      billing: 'trainer', messaging: true, coachNotifications: true, trainerBilling: true,
    })
    expect(await getCapabilitiesForUser({ id: 'c1', role: 'CLIENT', clerkOrgId: 'org_t' })).toMatchObject({
      messaging: true, checkIns: true,
    })
    expect(await getCapabilitiesForUser({ id: 'c2', role: 'CLIENT', clerkOrgId: null })).toMatchObject({
      messaging: true, coachNotifications: true,
    })
    expect(prisma.memberCoaching.findUnique).not.toHaveBeenCalled()
  })

  it('gives a club trainer coaching features but no trainer billing, without a coaching query', async () => {
    vi.mocked(prisma.organization.findUnique).mockResolvedValue(club as never)
    expect(await getCapabilitiesForUser({ id: 't1', role: 'TRAINER', clerkOrgId: 'org_c' })).toEqual({
      billing: 'member', messaging: true, checkIns: true, coachNotifications: true, trainerBilling: false,
    })
    expect(prisma.memberCoaching.findUnique).not.toHaveBeenCalled()
  })

  it('turns coaching features on for a club member whose coaching is ACTIVE', async () => {
    vi.mocked(prisma.organization.findUnique).mockResolvedValue(club as never)
    vi.mocked(prisma.memberCoaching.findUnique).mockResolvedValue({ status: 'ACTIVE' } as never)
    const caps = await getCapabilitiesForUser({ id: 'm1', role: 'CLIENT', clerkOrgId: 'org_c' })
    expect(prisma.memberCoaching.findUnique).toHaveBeenCalledWith({ where: { userId: 'm1' }, select: { status: true } })
    expect(caps).toMatchObject({ billing: 'member', messaging: true, checkIns: true, coachNotifications: true })
  })

  it.each(['REQUESTED', 'ACCEPTED', 'PAST_DUE', 'DECLINED', 'CANCELED'])(
    'keeps a club member uncoached while coaching is %s',
    async (status) => {
      vi.mocked(prisma.organization.findUnique).mockResolvedValue(club as never)
      vi.mocked(prisma.memberCoaching.findUnique).mockResolvedValue({ status } as never)
      expect(await getCapabilitiesForUser({ id: 'm1', role: 'CLIENT', clerkOrgId: 'org_c' })).toMatchObject({
        messaging: false, checkIns: false, coachNotifications: false,
      })
    }
  )
})

describe('getCoachingActive', () => {
  it('is true only for status ACTIVE', async () => {
    vi.mocked(prisma.memberCoaching.findUnique).mockResolvedValueOnce({ status: 'ACTIVE' } as never)
    expect(await getCoachingActive('m1')).toBe(true)
    vi.mocked(prisma.memberCoaching.findUnique).mockResolvedValueOnce(null)
    expect(await getCoachingActive('m1')).toBe(false)
  })
})

// Orgs by clerkOrgId: two clubs and a trainer org.
const ORGS: Record<string, object> = {
  org_c: club,
  org_c2: { clerkOrgId: 'org_c2', type: 'CLUB' },
  org_t: trainerOrg,
}
function useOrgs() {
  vi.mocked(prisma.organization.findUnique).mockImplementation((async (args: { where: { clerkOrgId: string } }) =>
    ORGS[args.where.clerkOrgId] ?? null) as never)
}

describe('canCoachInteract', () => {
  const clubTrainer = { id: 't1', role: 'TRAINER' as const, clerkOrgId: 'org_c' }
  const orgTrainer = { id: 't2', role: 'TRAINER' as const, clerkOrgId: 'org_t' }
  const member = (clerkOrgId: string) => ({ id: 'm1', role: 'CLIENT' as const, clerkOrgId })

  beforeEach(() => useOrgs())

  it('refuses a club trainer → uncoached member', async () => {
    vi.mocked(prisma.memberCoaching.findUnique).mockResolvedValue(null)
    expect(await canCoachInteract(clubTrainer, member('org_c'))).toBe(false)
  })

  it('allows a club trainer → coached member of their own club', async () => {
    vi.mocked(prisma.memberCoaching.findUnique).mockResolvedValue({ status: 'ACTIVE' } as never)
    expect(await canCoachInteract(clubTrainer, member('org_c'))).toBe(true)
  })

  it('refuses a club trainer → coached member of another club', async () => {
    vi.mocked(prisma.memberCoaching.findUnique).mockResolvedValue({ status: 'ACTIVE' } as never)
    expect(await canCoachInteract(clubTrainer, member('org_c2'))).toBe(false)
  })

  it('refuses a club trainer → trainer-org client', async () => {
    expect(await canCoachInteract(clubTrainer, member('org_t'))).toBe(false)
    expect(await canCoachInteract(clubTrainer, { id: 'c2', role: 'CLIENT', clerkOrgId: null })).toBe(false)
  })

  it('allows a trainer-org trainer → own client, including legacy org-less clients (regression)', async () => {
    expect(await canCoachInteract(orgTrainer, { id: 'c1', role: 'CLIENT', clerkOrgId: 'org_t' })).toBe(true)
    expect(await canCoachInteract(orgTrainer, { id: 'c2', role: 'CLIENT', clerkOrgId: null })).toBe(true)
    expect(prisma.memberCoaching.findUnique).not.toHaveBeenCalled()
  })

  it('loads the recipient by id', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(member('org_c') as never)
    vi.mocked(prisma.memberCoaching.findUnique).mockResolvedValue(null)
    expect(await canCoachInteract(clubTrainer, 'm1')).toBe(false)
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'm1' },
      select: { id: true, role: true, clerkOrgId: true },
    })
  })

  it('fails closed on an unknown id', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null)
    expect(await canCoachInteract(orgTrainer, 'nobody')).toBe(false)
  })

  it('fails closed (never throws) when the lookup errors, e.g. a malformed ObjectId (P2023)', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(prisma.user.findUnique).mockRejectedValue(Object.assign(new Error('Malformed ObjectID'), { code: 'P2023' }))
    await expect(canCoachInteract(orgTrainer, 'not-an-id')).resolves.toBe(false)
    expect(err).toHaveBeenCalled()
    err.mockRestore()
  })

  it('checks the requested capability', async () => {
    vi.mocked(prisma.memberCoaching.findUnique).mockResolvedValue({ status: 'ACTIVE' } as never)
    expect(await canCoachInteract(clubTrainer, member('org_c'), 'checkIns')).toBe(true)
    vi.mocked(prisma.memberCoaching.findUnique).mockResolvedValue({ status: 'PAST_DUE' } as never)
    expect(await canCoachInteract(clubTrainer, member('org_c'), 'checkIns')).toBe(false)
  })

  it('lets a club trainer reach another trainer in their own club only', async () => {
    expect(await canCoachInteract(clubTrainer, { id: 't3', role: 'TRAINER', clerkOrgId: 'org_c' })).toBe(true)
    expect(await canCoachInteract(clubTrainer, { id: 't4', role: 'TRAINER', clerkOrgId: 'org_t' })).toBe(false)
  })
})

describe('filterCoachableClientIds', () => {
  beforeEach(() => useOrgs())

  it('keeps every id for a trainer org without a coaching query', async () => {
    expect(await filterCoachableClientIds({ id: 't2', role: 'TRAINER', clerkOrgId: 'org_t' }, ['a', 'b'])).toEqual(['a', 'b'])
    expect(prisma.memberCoaching.findMany).not.toHaveBeenCalled()
  })

  it('keeps only ACTIVE-coached members in a club', async () => {
    vi.mocked(prisma.memberCoaching.findMany).mockResolvedValue([{ userId: 'b' }] as never)
    expect(await filterCoachableClientIds({ id: 't1', role: 'TRAINER', clerkOrgId: 'org_c' }, ['a', 'b', 'c'])).toEqual(['b'])
    expect(prisma.memberCoaching.findMany).toHaveBeenCalledWith({
      where: { userId: { in: ['a', 'b', 'c'] }, clerkOrgId: 'org_c', status: 'ACTIVE' },
      select: { userId: true },
    })
  })

  it('agrees with canCoachInteract for the same club roster', async () => {
    const trainer = { id: 't1', role: 'TRAINER' as const, clerkOrgId: 'org_c' }
    vi.mocked(prisma.memberCoaching.findMany).mockResolvedValue([{ userId: 'b' }] as never)
    vi.mocked(prisma.memberCoaching.findUnique).mockImplementation((async (args: { where: { userId: string } }) =>
      args.where.userId === 'b' ? { status: 'ACTIVE' } : null) as never)
    const ids = ['a', 'b']
    const filtered = await filterCoachableClientIds(trainer, ids)
    const single = await Promise.all(
      ids.map((id) => canCoachInteract(trainer, { id, role: 'CLIENT', clerkOrgId: 'org_c' }))
    )
    expect(filtered).toEqual(ids.filter((_, i) => single[i]))
  })
})
