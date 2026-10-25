import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

const fake = vi.hoisted(() => ({ db: null as null | import('@/lib/payments/__tests__/fake-db').FakeDb }))
const stripeMocks = vi.hoisted(() => ({
  sessionsCreate: vi.fn(),
  sessionsRetrieve: vi.fn(),
  sessionsList: vi.fn(),
  sessionsExpire: vi.fn(),
  customersList: vi.fn(),
  customersCreate: vi.fn(),
  subscriptionsList: vi.fn(),
}))
const caps = vi.hoisted(() => ({ billing: 'trainer' as 'trainer' | 'member' }))
const trainersForClient = vi.hoisted(() => ({ list: [] as Array<{ id: string }> }))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', async () => {
  const { createFakeDb } = await import('@/lib/payments/__tests__/fake-db')
  fake.db = createFakeDb()
  return { prisma: fake.db.prisma }
})
vi.mock('@/lib/stripe', () => ({
  stripe: {
    checkout: {
      sessions: {
        create: stripeMocks.sessionsCreate,
        retrieve: stripeMocks.sessionsRetrieve,
        list: stripeMocks.sessionsList,
        expire: stripeMocks.sessionsExpire,
      },
    },
    customers: { list: stripeMocks.customersList, create: stripeMocks.customersCreate },
    subscriptions: { list: stripeMocks.subscriptionsList },
  },
}))
vi.mock('@/lib/org-capabilities.server', () => ({
  getCapabilitiesForUser: vi.fn(async () => ({ billing: caps.billing })),
}))
vi.mock('@/lib/services/audit-log.service', () => ({ logUserAudit: vi.fn() }))
vi.mock('@/lib/services/client.service', () => ({
  getTrainersForClient: vi.fn(async () => trainersForClient.list),
}))

import { createOfferCheckout } from '../offer-checkout.service'
import { PLATFORM_FEE_BPS } from '@/lib/payments/connect-config'

const db = () => fake.db!
const TRAINER_ID = 'a'.repeat(24)
const CLIENT = { id: 'c'.repeat(24), role: 'CLIENT' as const, clerkOrgId: 'org_1', email: 'client@test.com', firstName: 'Cam', lastName: 'Client' }

function seedOffer(kind: 'PROGRAM' | 'COACHING', extra: Record<string, unknown> = {}) {
  return db().insert('paidOffer', {
    trainerId: TRAINER_ID, stripeAccountId: 'acct_1', kind, name: kind === 'PROGRAM' ? 'Strength' : 'Coaching',
    priceInCents: 4900, currency: 'usd', stripePriceId: 'price_1', isActive: true, ...extra,
  })
}

beforeAll(() => {
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.test'
})

beforeEach(() => {
  vi.clearAllMocks()
  db().reset()
  caps.billing = 'trainer'
  trainersForClient.list = [{ id: TRAINER_ID }]
  db().insert('connectedAccount', { trainerId: TRAINER_ID, stripeAccountId: 'acct_1', chargesEnabled: true, disconnectedAt: null })
  stripeMocks.sessionsCreate.mockResolvedValue({ id: 'cs_1', url: 'https://checkout.stripe.com/c/cs_1', amount_total: 4900, currency: 'usd' })
  stripeMocks.customersList.mockResolvedValue({ data: [] })
  stripeMocks.customersCreate.mockResolvedValue({ id: 'cus_new' })
  stripeMocks.subscriptionsList.mockResolvedValue({ data: [] })
  stripeMocks.sessionsList.mockResolvedValue({ data: [] })
})

describe('createOfferCheckout', () => {
  it('documents no platform commission', () => {
    expect(PLATFORM_FEE_BPS).toBe(0)
  })

  it('creates a direct-charge session on the connected account with no application fee and a PENDING purchase', async () => {
    const offer = seedOffer('PROGRAM')

    const url = await createOfferCheckout(CLIENT, offer.id)

    expect(url).toBe('https://checkout.stripe.com/c/cs_1')
    const [params, options] = stripeMocks.sessionsCreate.mock.calls[0]
    expect(options).toEqual({ stripeAccount: 'acct_1' })
    const metadata = { purchaseType: 'connect_offer', offerId: offer.id, clientId: CLIENT.id, trainerId: TRAINER_ID }
    expect(params).toMatchObject({
      mode: 'payment',
      line_items: [{ price: 'price_1', quantity: 1 }],
      customer_email: 'client@test.com',
      metadata,
      payment_intent_data: { metadata },
      success_url: 'https://app.test/store/success?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://app.test/store/canceled',
    })
    expect(JSON.stringify(params)).not.toContain('application_fee')
    expect(db().tables.offerPurchase).toEqual([
      expect.objectContaining({ stripeCheckoutSessionId: 'cs_1', status: 'PENDING', fulfillmentStatus: 'PENDING', clientId: CLIENT.id }),
    ])
  })

  it('subscribes coaching with metadata on the subscription and no purchase row', async () => {
    const offer = seedOffer('COACHING')
    await createOfferCheckout(CLIENT, offer.id)
    const [params] = stripeMocks.sessionsCreate.mock.calls[0]
    expect(params.mode).toBe('subscription')
    expect(params.customer).toBe('cus_new')
    expect(stripeMocks.customersCreate).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'client@test.com', metadata: expect.objectContaining({ clientId: CLIENT.id }) }),
      { stripeAccount: 'acct_1' }
    )
    expect(params.subscription_data.metadata).toMatchObject({ purchaseType: 'connect_offer', offerId: offer.id })
    expect(db().tables.offerPurchase).toHaveLength(0)
  })

  it("refuses an offer from a trainer who isn't the client's", async () => {
    trainersForClient.list = [{ id: 'b'.repeat(24) }]
    const offer = seedOffer('PROGRAM')
    await expect(createOfferCheckout(CLIENT, offer.id)).rejects.toMatchObject({ code: 'forbidden' })
    expect(stripeMocks.sessionsCreate).not.toHaveBeenCalled()
  })

  it("refuses when the trainer's charges aren't enabled", async () => {
    db().tables.connectedAccount[0].chargesEnabled = false
    const offer = seedOffer('PROGRAM')
    await expect(createOfferCheckout(CLIENT, offer.id)).rejects.toMatchObject({ code: 'charges_disabled' })
  })

  it('refuses an offer tied to a replaced Stripe account', async () => {
    const offer = seedOffer('PROGRAM', { stripeAccountId: 'acct_old' })
    await expect(createOfferCheckout(CLIENT, offer.id)).rejects.toMatchObject({ code: 'charges_disabled' })
  })

  it('refuses archived offers', async () => {
    const offer = seedOffer('PROGRAM', { isActive: false })
    await expect(createOfferCheckout(CLIENT, offer.id)).rejects.toMatchObject({ code: 'not_found' })
  })

  it('blocks a second live membership to the same offer', async () => {
    const offer = seedOffer('COACHING')
    db().insert('offerSubscription', { offerId: offer.id, clientId: CLIENT.id, status: 'ACTIVE', stripeAccountId: 'acct_1', stripeCustomerId: 'cus_1' })
    await expect(createOfferCheckout(CLIENT, offer.id)).rejects.toMatchObject({ code: 'already_subscribed' })
  })

  it('allows re-subscribing after a canceled membership, reusing the Stripe customer', async () => {
    const offer = seedOffer('COACHING')
    db().insert('offerSubscription', { offerId: offer.id, clientId: CLIENT.id, status: 'CANCELED', stripeAccountId: 'acct_1', stripeCustomerId: 'cus_1' })
    await createOfferCheckout(CLIENT, offer.id)
    const [params] = stripeMocks.sessionsCreate.mock.calls[0]
    expect(params.customer).toBe('cus_1')
    expect(params.customer_email).toBeUndefined()
  })

  it('blocks buying a program the client already owns', async () => {
    const offer = seedOffer('PROGRAM')
    db().insert('offerPurchase', { offerId: offer.id, clientId: CLIENT.id, status: 'PAID', stripeCheckoutSessionId: 'cs_old' })
    await expect(createOfferCheckout(CLIENT, offer.id)).rejects.toMatchObject({ code: 'already_purchased' })
  })

  it('refuses trainers and club members', async () => {
    const offer = seedOffer('PROGRAM')
    await expect(createOfferCheckout({ ...CLIENT, role: 'TRAINER' as never }, offer.id)).rejects.toMatchObject({ code: 'forbidden' })
    caps.billing = 'member'
    await expect(createOfferCheckout(CLIENT, offer.id)).rejects.toMatchObject({ code: 'unavailable' })
  })

  it('expires an earlier open checkout for the same program before starting a new one', async () => {
    const offer = seedOffer('PROGRAM')
    db().insert('offerPurchase', { offerId: offer.id, clientId: CLIENT.id, status: 'PENDING', stripeCheckoutSessionId: 'cs_old', stripeAccountId: 'acct_1' })
    stripeMocks.sessionsRetrieve.mockResolvedValue({ id: 'cs_old', status: 'open' })

    await createOfferCheckout(CLIENT, offer.id)

    expect(stripeMocks.sessionsExpire).toHaveBeenCalledWith('cs_old', {}, { stripeAccount: 'acct_1' })
    expect(db().tables.offerPurchase.find((p) => p.stripeCheckoutSessionId === 'cs_old')!.status).toBe('FAILED')
    expect(stripeMocks.sessionsCreate).toHaveBeenCalled()
  })

  it('refuses while an earlier program checkout has completed but not been confirmed yet', async () => {
    const offer = seedOffer('PROGRAM')
    db().insert('offerPurchase', { offerId: offer.id, clientId: CLIENT.id, status: 'PENDING', stripeCheckoutSessionId: 'cs_old', stripeAccountId: 'acct_1' })
    stripeMocks.sessionsRetrieve.mockResolvedValue({ id: 'cs_old', status: 'complete' })
    await expect(createOfferCheckout(CLIENT, offer.id)).rejects.toMatchObject({ code: 'invalid_state' })
    expect(stripeMocks.sessionsCreate).not.toHaveBeenCalled()
  })

  it('refuses a membership Stripe already has even before its webhook arrives, and expires other open membership checkouts', async () => {
    const offer = seedOffer('COACHING')
    stripeMocks.customersList.mockResolvedValue({ data: [{ id: 'cus_tagged', metadata: { clientId: CLIENT.id } }] })
    stripeMocks.subscriptionsList.mockResolvedValue({
      data: [{ id: 'sub_1', status: 'active', metadata: { purchaseType: 'connect_offer', offerId: offer.id } }],
    })
    await expect(createOfferCheckout(CLIENT, offer.id)).rejects.toMatchObject({ code: 'already_subscribed' })
    expect(stripeMocks.subscriptionsList).toHaveBeenCalledWith({ customer: 'cus_tagged', limit: 20 }, { stripeAccount: 'acct_1' })

    stripeMocks.subscriptionsList.mockResolvedValue({ data: [] })
    stripeMocks.sessionsList.mockResolvedValue({
      data: [
        { id: 'cs_open', metadata: { purchaseType: 'connect_offer', offerId: offer.id } },
        { id: 'cs_other', metadata: { purchaseType: 'connect_offer', offerId: 'x'.repeat(24) } },
      ],
    })
    await createOfferCheckout(CLIENT, offer.id)
    expect(stripeMocks.sessionsExpire).toHaveBeenCalledTimes(1)
    expect(stripeMocks.sessionsExpire).toHaveBeenCalledWith('cs_open', {}, { stripeAccount: 'acct_1' })
  })
})
