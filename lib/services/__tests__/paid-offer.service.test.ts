import { describe, it, expect, vi, beforeEach } from 'vitest'

const fake = vi.hoisted(() => ({ db: null as null | import('@/lib/payments/__tests__/fake-db').FakeDb }))
const stripeMocks = vi.hoisted(() => ({
  productsCreate: vi.fn(),
  productsUpdate: vi.fn(),
  pricesCreate: vi.fn(),
  pricesUpdate: vi.fn(),
}))
const caps = vi.hoisted(() => ({ billing: 'trainer' as 'trainer' | 'member' }))
const trainersForClient = vi.hoisted(() => ({ list: [] as Array<Record<string, string>> }))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', async () => {
  const { createFakeDb } = await import('@/lib/payments/__tests__/fake-db')
  fake.db = createFakeDb()
  return { prisma: fake.db.prisma }
})
vi.mock('@/lib/stripe', () => ({
  stripe: {
    products: { create: stripeMocks.productsCreate, update: stripeMocks.productsUpdate },
    prices: { create: stripeMocks.pricesCreate, update: stripeMocks.pricesUpdate },
  },
}))
vi.mock('@/lib/org-capabilities.server', () => ({
  getCapabilitiesForUser: vi.fn(async () => ({ billing: caps.billing })),
}))
vi.mock('@/lib/services/audit-log.service', () => ({ logUserAudit: vi.fn() }))
vi.mock('@/lib/services/client.service', () => ({
  getTrainersForClient: vi.fn(async () => trainersForClient.list),
}))

import { archiveOffer, createOffer, listStoreOffers, updateOffer } from '../paid-offer.service'

const db = () => fake.db!
const TRAINER = {
  id: 'a'.repeat(24), role: 'TRAINER' as const, clerkOrgId: 'org_1', email: 't@test.com', firstName: 'Tia', lastName: 'Trainer',
}
const TEMPLATE_ID = 'f'.repeat(24)

function connect(chargesEnabled = true, trainerId = TRAINER.id, stripeAccountId = 'acct_1') {
  return db().insert('connectedAccount', { trainerId, stripeAccountId, chargesEnabled, disconnectedAt: null })
}

beforeEach(() => {
  vi.clearAllMocks()
  db().reset()
  caps.billing = 'trainer'
  trainersForClient.list = []
  db().insert('program', { id: TEMPLATE_ID, trainerId: TRAINER.id, clientId: null, status: 'ACTIVE', name: 'Strength 101', schedulingType: null })
  stripeMocks.productsCreate.mockResolvedValue({ id: 'prod_1', default_price: 'price_1' })
})

const PROGRAM_INPUT = {
  kind: 'PROGRAM' as const,
  name: 'Strength 101',
  description: null,
  priceInCents: 4900,
  programTemplateId: TEMPLATE_ID,
  cancellationPolicy: 'END_OF_PERIOD' as const,
}

describe('createOffer', () => {
  it('creates the product and price on the connected account', async () => {
    connect()
    const offer = await createOffer(TRAINER, PROGRAM_INPUT)

    expect(stripeMocks.productsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Strength 101',
        default_price_data: { currency: 'usd', unit_amount: 4900, recurring: undefined },
        metadata: expect.objectContaining({ purchaseType: 'connect_offer', trainerId: TRAINER.id }),
      }),
      { stripeAccount: 'acct_1' }
    )
    expect(offer).toMatchObject({ stripeProductId: 'prod_1', stripePriceId: 'price_1', stripeAccountId: 'acct_1', isActive: true })
  })

  it('bills coaching monthly', async () => {
    connect()
    await createOffer(TRAINER, { ...PROGRAM_INPUT, kind: 'COACHING', programTemplateId: null, cancellationPolicy: 'IMMEDIATE' })
    expect(stripeMocks.productsCreate.mock.calls[0][0].default_price_data.recurring).toEqual({ interval: 'month' })
    expect(db().tables.paidOffer[0].cancellationPolicy).toBe('IMMEDIATE')
  })

  it('refuses until charges are enabled', async () => {
    connect(false)
    await expect(createOffer(TRAINER, PROGRAM_INPUT)).rejects.toMatchObject({ code: 'charges_disabled' })
    expect(stripeMocks.productsCreate).not.toHaveBeenCalled()
  })

  it("refuses a template the trainer doesn't own", async () => {
    connect()
    db().tables.program[0].trainerId = 'b'.repeat(24)
    await expect(createOffer(TRAINER, PROGRAM_INPUT)).rejects.toMatchObject({ code: 'invalid_input' })
  })

  it('refuses club orgs', async () => {
    caps.billing = 'member'
    connect()
    await expect(createOffer(TRAINER, PROGRAM_INPUT)).rejects.toMatchObject({ code: 'unavailable' })
  })
})

describe('updateOffer', () => {
  it('a price change creates a new price, makes it default, then deactivates the old one', async () => {
    connect()
    const offer = await createOffer(TRAINER, PROGRAM_INPUT)
    stripeMocks.pricesCreate.mockResolvedValue({ id: 'price_2' })
    const order: string[] = []
    stripeMocks.pricesCreate.mockImplementation(async () => (order.push('create'), { id: 'price_2' }))
    stripeMocks.productsUpdate.mockImplementation(async () => (order.push('default'), {}))
    stripeMocks.pricesUpdate.mockImplementation(async () => (order.push('deactivate'), {}))

    const updated = await updateOffer(TRAINER, { ...PROGRAM_INPUT, offerId: offer.id, priceInCents: 5900 })

    expect(order).toEqual(['create', 'default', 'deactivate'])
    expect(stripeMocks.pricesUpdate).toHaveBeenCalledWith('price_1', { active: false }, { stripeAccount: 'acct_1' })
    expect(updated).toMatchObject({ priceInCents: 5900, stripePriceId: 'price_2' })
  })

  it("can't edit another trainer's offer", async () => {
    connect()
    const offer = await createOffer(TRAINER, PROGRAM_INPUT)
    const other = { ...TRAINER, id: 'b'.repeat(24) }
    await expect(updateOffer(other, { ...PROGRAM_INPUT, offerId: offer.id })).rejects.toMatchObject({ code: 'not_found' })
  })
})

describe('archiveOffer', () => {
  it('archives the Stripe product and hides the offer', async () => {
    connect()
    const offer = await createOffer(TRAINER, PROGRAM_INPUT)
    await archiveOffer(TRAINER, offer.id)
    expect(stripeMocks.productsUpdate).toHaveBeenCalledWith('prod_1', { active: false }, { stripeAccount: 'acct_1' })
    expect(db().tables.paidOffer[0].isActive).toBe(false)
  })
})

describe('listStoreOffers', () => {
  const CLIENT = { id: 'c'.repeat(24), role: 'CLIENT' as const, clerkOrgId: 'org_1' }

  it("lists only the client's own trainers' active offers on chargeable accounts", async () => {
    const otherTrainer = 'd'.repeat(24)
    trainersForClient.list = [{ id: TRAINER.id, firstName: 'Tia', lastName: 'Trainer', email: 't@test.com' }]
    connect()
    connect(true, otherTrainer, 'acct_other')
    db().insert('paidOffer', { trainerId: TRAINER.id, stripeAccountId: 'acct_1', isActive: true, kind: 'PROGRAM', name: 'Mine', programTemplateId: TEMPLATE_ID, priceInCents: 100, currency: 'usd' })
    db().insert('paidOffer', { trainerId: TRAINER.id, stripeAccountId: 'acct_1', isActive: false, kind: 'PROGRAM', name: 'Archived', priceInCents: 100, currency: 'usd' })
    db().insert('paidOffer', { trainerId: TRAINER.id, stripeAccountId: 'acct_old', isActive: true, kind: 'PROGRAM', name: 'Old account', priceInCents: 100, currency: 'usd' })
    db().insert('paidOffer', { trainerId: otherTrainer, stripeAccountId: 'acct_other', isActive: true, kind: 'PROGRAM', name: 'Not my coach', priceInCents: 100, currency: 'usd' })

    const offers = await listStoreOffers(CLIENT)

    expect(offers.map((o) => o.name)).toEqual(['Mine'])
    expect(offers[0]).toMatchObject({ trainerName: 'Tia Trainer', programName: 'Strength 101' })
  })

  it('hides everything when the trainer cannot take payments', async () => {
    trainersForClient.list = [{ id: TRAINER.id, firstName: 'Tia', lastName: 'Trainer', email: 't@test.com' }]
    connect(false)
    db().insert('paidOffer', { trainerId: TRAINER.id, stripeAccountId: 'acct_1', isActive: true, kind: 'PROGRAM', name: 'Mine', priceInCents: 100, currency: 'usd' })
    expect(await listStoreOffers(CLIENT)).toEqual([])
  })
})
