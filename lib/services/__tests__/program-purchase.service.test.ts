import { describe, it, expect, vi, beforeEach } from 'vitest'

// `getPurchaseBySessionId` is `React.cache()`-wrapped (dedupes the success
// page's generateMetadata + page-body lookups); make it a passthrough here
// so each test call reaches the mocked prisma call, same as branding.service.test.ts.
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  cache: <T,>(fn: T) => fn,
}))

const clerkMocks = vi.hoisted(() => ({
  getUserList: vi.fn(async () => ({ data: [] })),
  createUser: vi.fn(async () => ({ id: 'clerk_new', firstName: 'Pat', lastName: 'Buyer', imageUrl: '' })),
  createOrganizationMembership: vi.fn(async () => ({})),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    programPurchase: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findMany: vi.fn() },
    coachPackage: { findMany: vi.fn() },
    user: { findUnique: vi.fn(), upsert: vi.fn() },
    clientProfile: { upsert: vi.fn() },
    program: { findFirst: vi.fn() },
  },
}))
vi.mock('@/lib/services/program.service', () => ({
  duplicateProgram: vi.fn(),
  assignProgram: vi.fn(),
}))
vi.mock('@/lib/email/send-program-welcome', () => ({ sendProgramWelcomeEmail: vi.fn() }))
vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: vi.fn(async () => ({
    users: {
      getUserList: clerkMocks.getUserList,
      createUser: clerkMocks.createUser,
    },
    organizations: { createOrganizationMembership: clerkMocks.createOrganizationMembership },
  })),
}))

import { prisma } from '@/lib/prisma'
import { duplicateProgram, assignProgram } from '@/lib/services/program.service'
import { sendProgramWelcomeEmail } from '@/lib/email/send-program-welcome'
import { fulfillProgramPurchase, retryStuckProgramPurchases, getPurchaseBySessionId } from '../program-purchase.service'

const session = {
  id: 'cs_test_1', email: 'buyer@example.com',
  amountTotal: 7999, currency: 'usd', packageIds: ['pkg1'],
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.programPurchase.findUnique).mockResolvedValue(null)
  vi.mocked(prisma.programPurchase.create).mockResolvedValue({ id: 'pp1' } as any)
  vi.mocked(prisma.programPurchase.update).mockResolvedValue({ id: 'pp1' } as any)
  vi.mocked(prisma.programPurchase.updateMany).mockResolvedValue({ count: 1 } as any)
  vi.mocked(prisma.coachPackage.findMany).mockResolvedValue([
    { id: 'pkg1', name: 'Golf Back Pain', programTemplateId: 'tmpl1',
      trainerId: 'trainer1', priceInCents: 7999 } as any,
  ])
  vi.mocked(prisma.user.findUnique)
    .mockResolvedValueOnce({ id: 'trainer1', clerkOrgId: 'org_jane' } as any) // trainer lookup
    .mockResolvedValue(null) // buyer does not exist yet
  vi.mocked(prisma.user.upsert).mockResolvedValue({ id: 'user_buyer', firstName: 'Pat' } as any)
  vi.mocked(prisma.clientProfile.upsert).mockResolvedValue({} as any)
  vi.mocked(prisma.program.findFirst).mockResolvedValue(null)
  vi.mocked(duplicateProgram).mockResolvedValue({ id: 'prog_copy1' } as any)
  vi.mocked(assignProgram).mockResolvedValue({ id: 'prog_copy1' } as any)
})

describe('fulfillProgramPurchase', () => {
  it('is idempotent: skips when a COMPLETED purchase already exists', async () => {
    vi.mocked(prisma.programPurchase.findUnique).mockResolvedValue({ id: 'pp1', status: 'COMPLETED' } as any)
    const result = await fulfillProgramPurchase(session)
    expect(result).toBeNull()
    expect(assignProgram).not.toHaveBeenCalled()
    expect(sendProgramWelcomeEmail).not.toHaveBeenCalled()
  })

  it('clones the template then assigns the copy (never the template)', async () => {
    await fulfillProgramPurchase(session)
    expect(duplicateProgram).toHaveBeenCalledWith('tmpl1', 'trainer1', false)
    expect(assignProgram).toHaveBeenCalledWith('prog_copy1', 'user_buyer', expect.any(Date))
  })

  it('creates the DB user as an onboarded CLIENT in the trainer org', async () => {
    await fulfillProgramPurchase(session)
    expect(prisma.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ role: 'CLIENT', clerkOrgId: 'org_jane', onboarded: true }),
        update: expect.objectContaining({ onboarded: true }),
      })
    )
  })

  it('records the purchase as COMPLETED and sends a welcome email', async () => {
    await fulfillProgramPurchase(session)
    expect(prisma.programPurchase.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED' }) })
    )
    expect(sendProgramWelcomeEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'buyer@example.com', isNewAccount: true, clerkOrgId: 'org_jane' })
    )
  })

  it('is idempotent on retry: does not re-clone or re-email when the program was already assigned', async () => {
    // A PENDING purchase left by a prior partial run
    vi.mocked(prisma.programPurchase.findUnique).mockResolvedValue({ id: 'pp1', status: 'PENDING', assignedProgramIds: [] } as any)
    // trainer lookup succeeds; buyer already exists in the DB
    vi.mocked(prisma.user.findUnique).mockReset()
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce({ id: 'trainer1', clerkOrgId: 'org_jane' } as any)
      .mockResolvedValue({ id: 'user_buyer', clerkId: 'clerk_x', firstName: 'Pat' } as any)
    // the program was already cloned+assigned to this buyer on the prior run
    vi.mocked(prisma.program.findFirst).mockResolvedValue({ id: 'prog_copy1' } as any)

    await fulfillProgramPurchase(session)

    expect(duplicateProgram).not.toHaveBeenCalled()
    expect(assignProgram).not.toHaveBeenCalled()
    expect(sendProgramWelcomeEmail).not.toHaveBeenCalled()
  })

  it('skips adding org membership when the buyer already belongs to the seller org', async () => {
    vi.mocked(prisma.user.findUnique).mockReset()
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce({ id: 'trainer1', clerkOrgId: 'org_jane' } as any) // trainer lookup
      .mockResolvedValue({ id: 'user_buyer', clerkId: 'clerk_x', clerkOrgId: 'org_jane', firstName: 'Pat' } as any) // buyer already in org_jane

    await fulfillProgramPurchase(session)

    expect(clerkMocks.createOrganizationMembership).not.toHaveBeenCalled()
  })

  it('still adds org membership when the buyer belongs to a different (or no) org', async () => {
    vi.mocked(prisma.user.findUnique).mockReset()
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce({ id: 'trainer1', clerkOrgId: 'org_jane' } as any)
      .mockResolvedValue({ id: 'user_buyer', clerkId: 'clerk_x', clerkOrgId: 'org_other', firstName: 'Pat' } as any)

    await fulfillProgramPurchase(session)

    expect(clerkMocks.createOrganizationMembership).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org_jane', userId: 'clerk_x' })
    )
  })
})

describe('retryStuckProgramPurchases', () => {
  it('queries for PENDING/FAILED purchases past the grace period', async () => {
    vi.mocked(prisma.programPurchase.findMany).mockResolvedValue([])

    await retryStuckProgramPurchases()

    expect(prisma.programPurchase.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ['PENDING', 'FAILED'] },
          createdAt: expect.objectContaining({ lt: expect.any(Date) }),
        }),
      })
    )
  })

  it('successfully retries a stuck purchase and reports it as succeeded', async () => {
    vi.mocked(prisma.programPurchase.findMany).mockResolvedValue([
      {
        id: 'pp1', stripeCheckoutSessionId: 'cs_test_1', buyerEmail: 'buyer@example.com',
        amountInCents: 7999, currency: 'usd', packageIds: ['pkg1'],
      } as any,
    ])

    const result = await retryStuckProgramPurchases()

    expect(result).toEqual({ retried: 1, succeeded: 1, failed: 0 })
    expect(duplicateProgram).toHaveBeenCalledWith('tmpl1', 'trainer1', false)
    expect(prisma.programPurchase.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED' }) })
    )
  })

  it('marks a purchase FAILED and continues to the next row when one retry throws', async () => {
    vi.mocked(prisma.programPurchase.findMany).mockResolvedValue([
      { id: 'ppBad', stripeCheckoutSessionId: 'cs_bad', buyerEmail: 'bad@example.com', amountInCents: 100, currency: 'usd', packageIds: ['pkgBad'] } as any,
      { id: 'ppGood', stripeCheckoutSessionId: 'cs_good', buyerEmail: 'good@example.com', amountInCents: 7999, currency: 'usd', packageIds: ['pkg1'] } as any,
    ])
    vi.mocked(prisma.coachPackage.findMany).mockImplementation(((args: any) => {
      if (args?.where?.id?.in?.includes('pkgBad')) return Promise.resolve([]) // triggers "packages not found"
      return Promise.resolve([{ id: 'pkg1', name: 'Golf Back Pain', programTemplateId: 'tmpl1', trainerId: 'trainer1', priceInCents: 7999 }])
    }) as any)

    const result = await retryStuckProgramPurchases()

    expect(result).toEqual({ retried: 2, succeeded: 1, failed: 1 })
    expect(prisma.programPurchase.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'ppBad' }),
        data: { status: 'FAILED' },
      })
    )
    // the second row still gets fulfilled despite the first one failing
    expect(prisma.programPurchase.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED' }) })
    )
  })
})

describe('getPurchaseBySessionId', () => {
  it('looks up the purchase by its Stripe checkout session id', async () => {
    vi.mocked(prisma.programPurchase.findUnique).mockResolvedValue({
      id: 'pp1', stripeCheckoutSessionId: 'cs_test_1', orgId: 'org_jane',
    } as unknown as Awaited<ReturnType<typeof prisma.programPurchase.findUnique>>)

    const result = await getPurchaseBySessionId('cs_test_1')

    expect(prisma.programPurchase.findUnique).toHaveBeenCalledWith({
      where: { stripeCheckoutSessionId: 'cs_test_1' },
    })
    expect(result?.orgId).toBe('org_jane')
  })

  it('returns null when no purchase matches the session id', async () => {
    vi.mocked(prisma.programPurchase.findUnique).mockResolvedValue(null)

    expect(await getPurchaseBySessionId('cs_missing')).toBeNull()
  })
})
