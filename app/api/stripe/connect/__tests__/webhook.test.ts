import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

// Route-level tests for the Stripe Connect webhook (spec §3). The real
// payment services run against an in-memory prisma, so these assert the rows
// actually written — including that replays change nothing.

const fake = vi.hoisted(() => ({ db: null as null | import('@/lib/payments/__tests__/fake-db').FakeDb }))
const pending = vi.hoisted(() => [] as Promise<unknown>[])
const stripeMocks = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  subscriptionsRetrieve: vi.fn(),
  sessionsList: vi.fn(),
  sessionsRetrieve: vi.fn(),
  paymentIntentsRetrieve: vi.fn(),
  subscriptionsCancel: vi.fn(),
}))
const programMocks = vi.hoisted(() => ({
  duplicateProgram: vi.fn(),
  assignProgram: vi.fn(),
  assignOnDemandProgram: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', async () => {
  const { createFakeDb } = await import('@/lib/payments/__tests__/fake-db')
  fake.db = createFakeDb()
  return { prisma: fake.db.prisma }
})
vi.mock('@/lib/stripe', () => ({
  stripe: {
    webhooks: { constructEvent: stripeMocks.constructEvent },
    subscriptions: { retrieve: stripeMocks.subscriptionsRetrieve, cancel: stripeMocks.subscriptionsCancel },
    checkout: { sessions: { list: stripeMocks.sessionsList, retrieve: stripeMocks.sessionsRetrieve } },
    paymentIntents: { retrieve: stripeMocks.paymentIntentsRetrieve },
  },
}))
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (fn: () => Promise<void>) => {
    pending.push(fn())
  },
}))
vi.mock('@/lib/services/program.service', () => programMocks)
vi.mock('@/lib/services/notification.service', () => ({
  notifyUser: vi.fn(async (input: Record<string, unknown>) => {
    fake.db!.insert('notification', { ...input })
  }),
}))
vi.mock('@/lib/services/audit-log.service', () => ({ logUserAudit: vi.fn() }))
vi.mock('@/lib/org-capabilities.server', () => ({ getCapabilitiesForUser: vi.fn(async () => ({ billing: 'trainer' })) }))

import { POST } from '../webhook/route'
import { fulfillOfferPurchase, retryStuckOfferPurchases } from '@/lib/services/offer-purchase.service'

const db = () => fake.db!
const TRAINER_ID = 'a'.repeat(24)
const CLIENT_ID = 'c'.repeat(24)
const TEMPLATE_ID = 'f'.repeat(24)
const ACCOUNT = 'acct_trainer'

let programSeq = 0

async function post(headers: Record<string, string> = { 'stripe-signature': 'sig' }) {
  const res = await POST(new Request('https://app.test/api/stripe/connect/webhook', { method: 'POST', body: '{}', headers }))
  await Promise.all(pending.splice(0))
  return res
}

function event(type: string, object: Record<string, unknown>, account: string | null = ACCOUNT) {
  stripeMocks.constructEvent.mockReturnValue({ id: `evt_${type}`, type, account: account ?? undefined, data: { object } })
}

let offerIds: { program: string; coaching: string }

function meta(offerId: string, extra: Record<string, string> = {}) {
  return { purchaseType: 'connect_offer', offerId, clientId: CLIENT_ID, trainerId: TRAINER_ID, ...extra }
}

function programSession(extra: Record<string, unknown> = {}) {
  return {
    id: 'cs_prog', mode: 'payment', payment_status: 'paid', status: 'complete', payment_intent: 'pi_1',
    amount_total: 4900, currency: 'usd', metadata: meta(offerIds.program), ...extra,
  }
}

function liveSub(status: string, extra: Record<string, unknown> = {}) {
  const sub = {
    id: 'sub_1', status, customer: 'cus_1', metadata: meta(offerIds.coaching), cancel_at_period_end: false,
    cancel_at: null, canceled_at: null, ended_at: null, items: { data: [{ current_period_end: 1_900_000_000 }] }, ...extra,
  }
  stripeMocks.subscriptionsRetrieve.mockResolvedValue(sub)
  return sub
}

function notificationsFor(userId: string, type?: string) {
  return db().tables.notification.filter((n) => n.userId === userId && (!type || n.type === type))
}

beforeAll(() => {
  process.env.STRIPE_CONNECT_WEBHOOK_SECRET = 'whsec_connect'
})

beforeEach(() => {
  vi.clearAllMocks()
  db().reset()
  pending.length = 0
  db().insert('connectedAccount', { trainerId: TRAINER_ID, stripeAccountId: ACCOUNT, chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true, country: 'US', defaultCurrency: 'usd', disconnectedAt: null })
  db().insert('user', { id: CLIENT_ID, firstName: 'Cam', lastName: 'Client', email: 'cam@test.com', role: 'CLIENT', clerkOrgId: 'org_1' })
  stripeMocks.paymentIntentsRetrieve.mockResolvedValue({ id: 'pi_1', latest_charge: { id: 'ch_1', amount: 4900, amount_refunded: 0, refunded: false } })
  db().insert('user', { id: TRAINER_ID, firstName: 'Tia', lastName: 'Trainer', email: 'tia@test.com', role: 'TRAINER', clerkOrgId: 'org_1' })
  db().insert('program', { id: TEMPLATE_ID, name: 'Strength 101', trainerId: TRAINER_ID, clientId: null, status: 'ACTIVE', schedulingType: null })
  const program = db().insert('paidOffer', { trainerId: TRAINER_ID, stripeAccountId: ACCOUNT, kind: 'PROGRAM', name: 'Strength 101', priceInCents: 4900, currency: 'usd', programTemplateId: TEMPLATE_ID, cancellationPolicy: 'END_OF_PERIOD', isActive: true })
  const coaching = db().insert('paidOffer', { trainerId: TRAINER_ID, stripeAccountId: ACCOUNT, kind: 'COACHING', name: 'Coaching', priceInCents: 9900, currency: 'usd', programTemplateId: TEMPLATE_ID, cancellationPolicy: 'END_OF_PERIOD', isActive: true })
  offerIds = { program: program.id, coaching: coaching.id }

  programMocks.duplicateProgram.mockImplementation(async () => {
    programSeq += 1
    return db().insert('program', { id: programSeq.toString(16).padStart(24, '9'), name: 'Strength 101 (Copy)', trainerId: TRAINER_ID, clientId: null, status: 'DRAFT', schedulingType: null })
  })
  programMocks.assignProgram.mockImplementation(async (id: string, clientId: string) => {
    const row = db().tables.program.find((p) => p.id === id)!
    Object.assign(row, { clientId, status: 'ACTIVE' })
    return { id }
  })
})

function seedPendingPurchase(extra: Record<string, unknown> = {}) {
  return db().insert('offerPurchase', {
    offerId: offerIds.program, trainerId: TRAINER_ID, clientId: CLIENT_ID, stripeAccountId: ACCOUNT,
    stripeCheckoutSessionId: 'cs_prog', stripePaymentIntentId: null, amountInCents: 4900, currency: 'usd',
    status: 'PENDING', fulfillmentStatus: 'PENDING', assignedProgramId: null, failureReason: null, paidAt: null, refundedAt: null,
    ...extra,
  })
}

describe('request validation', () => {
  it('rejects a missing signature', async () => {
    const res = await post({})
    expect(res.status).toBe(400)
  })

  it('rejects a bad signature', async () => {
    stripeMocks.constructEvent.mockImplementation(() => { throw new Error('bad sig') })
    expect((await post()).status).toBe(400)
  })

  it('verifies with the Connect secret, not the platform one', async () => {
    event('account.updated', { id: ACCOUNT })
    await post()
    expect(stripeMocks.constructEvent).toHaveBeenCalledWith('{}', 'sig', 'whsec_connect')
  })

  it('acknowledges and ignores events with no connected account', async () => {
    event('checkout.session.completed', programSession(), null)
    const res = await post()
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ignored: 'no_account' })
  })

  it('acknowledges and ignores unknown accounts', async () => {
    seedPendingPurchase()
    event('checkout.session.completed', programSession(), 'acct_stranger')
    const res = await post()
    expect(await res.json()).toMatchObject({ ignored: 'unknown_account' })
    expect(db().tables.offerPurchase[0].status).toBe('PENDING')
  })
})

describe('program purchases', () => {
  it('a paid checkout marks the purchase PAID, assigns a copy of the program and tells the trainer once', async () => {
    seedPendingPurchase()
    event('checkout.session.completed', programSession())

    expect((await post()).status).toBe(200)

    const purchase = db().tables.offerPurchase[0]
    expect(purchase).toMatchObject({ status: 'PAID', fulfillmentStatus: 'FULFILLED', stripePaymentIntentId: 'pi_1' })
    const copy = db().tables.program.find((p) => p.id === purchase.assignedProgramId)!
    expect(copy).toMatchObject({ name: 'Strength 101', clientId: CLIENT_ID, status: 'ACTIVE' })
    expect(programMocks.duplicateProgram).toHaveBeenCalledWith(TEMPLATE_ID, TRAINER_ID, false)
    expect(notificationsFor(TRAINER_ID, 'OFFER_PAYMENT_RECEIVED')).toHaveLength(1)

    // Replay: nothing new.
    await post()
    expect(programMocks.duplicateProgram).toHaveBeenCalledTimes(1)
    expect(notificationsFor(TRAINER_ID)).toHaveLength(1)
  })

  it('recreates a lost PENDING row from verified metadata', async () => {
    event('checkout.session.completed', programSession())
    await post()
    expect(db().tables.offerPurchase).toEqual([expect.objectContaining({ status: 'PAID', fulfillmentStatus: 'FULFILLED' })])
  })

  it('ignores sessions with foreign metadata', async () => {
    event('checkout.session.completed', programSession({ metadata: { purchaseType: 'program', packageIds: 'x' } }))
    await post()
    expect(db().tables.offerPurchase).toHaveLength(0)
  })

  it("ignores an offer that isn't on the event's account", async () => {
    db().insert('connectedAccount', { trainerId: 'b'.repeat(24), stripeAccountId: 'acct_other', disconnectedAt: null })
    event('checkout.session.completed', programSession(), 'acct_other')
    await post()
    expect(db().tables.offerPurchase).toHaveLength(0)
  })

  it('waits for async payment methods, then fulfills on async_payment_succeeded', async () => {
    seedPendingPurchase()
    event('checkout.session.completed', programSession({ payment_status: 'unpaid' }))
    await post()
    expect(db().tables.offerPurchase[0].status).toBe('PENDING')

    event('checkout.session.async_payment_succeeded', programSession())
    await post()
    expect(db().tables.offerPurchase[0]).toMatchObject({ status: 'PAID', fulfillmentStatus: 'FULFILLED' })
  })

  it('async_payment_failed marks FAILED and notifies client and trainer once', async () => {
    seedPendingPurchase()
    event('checkout.session.async_payment_failed', programSession({ payment_status: 'unpaid' }))
    await post()
    await post()
    expect(db().tables.offerPurchase[0].status).toBe('FAILED')
    expect(notificationsFor(CLIENT_ID, 'OFFER_PAYMENT_FAILED')).toHaveLength(1)
    expect(notificationsFor(TRAINER_ID, 'OFFER_PAYMENT_FAILED')).toHaveLength(1)
  })

  it('a failed fulfillment is recorded and the retry sweep finishes it', async () => {
    seedPendingPurchase()
    programMocks.duplicateProgram.mockRejectedValueOnce(new Error('db hiccup'))
    event('checkout.session.completed', programSession())
    expect((await post()).status).toBe(200)
    expect(db().tables.offerPurchase[0]).toMatchObject({ status: 'PAID', fulfillmentStatus: 'FAILED', failureReason: 'db hiccup' })

    const result = await retryStuckOfferPurchases(0, new Date(Date.now() + 1000))
    expect(result).toMatchObject({ retried: 1, succeeded: 1, failed: 0 })
    expect(db().tables.offerPurchase[0].fulfillmentStatus).toBe('FULFILLED')
  })

  it('the sweep reconciles a PENDING purchase whose webhook was missed', async () => {
    seedPendingPurchase({ createdAt: new Date(Date.now() - 10 * 60 * 1000) })
    stripeMocks.sessionsRetrieve.mockResolvedValue(programSession())
    const result = await retryStuckOfferPurchases()
    expect(stripeMocks.sessionsRetrieve).toHaveBeenCalledWith('cs_prog', {}, { stripeAccount: ACCOUNT })
    expect(result.reconciled).toBe(1)
    expect(db().tables.offerPurchase[0]).toMatchObject({ status: 'PAID', fulfillmentStatus: 'FULFILLED' })
  })

  it('a full refund marks REFUNDED and pauses the program; a partial refund changes nothing', async () => {
    seedPendingPurchase()
    event('checkout.session.completed', programSession())
    await post()
    const programId = db().tables.offerPurchase[0].assignedProgramId

    event('charge.refunded', { id: 'ch_1', payment_intent: 'pi_1', refunded: false, amount_refunded: 1000, currency: 'usd' })
    await post()
    expect(db().tables.offerPurchase[0].status).toBe('PAID')

    event('charge.refunded', { id: 'ch_1', payment_intent: 'pi_1', refunded: true, amount_refunded: 4900, currency: 'usd' })
    await post()
    await post()
    expect(db().tables.offerPurchase[0].status).toBe('REFUNDED')
    expect(db().tables.program.find((p) => p.id === programId)!.status).toBe('PAUSED')
    expect(notificationsFor(CLIENT_ID, 'REFUND_PROCESSED')).toHaveLength(1)
  })

  it('looks up a refund by session on the connected account when the payment intent was not recorded', async () => {
    seedPendingPurchase({ status: 'PAID', fulfillmentStatus: 'FULFILLED' })
    stripeMocks.sessionsList.mockResolvedValue({ data: [{ id: 'cs_prog' }] })
    event('charge.refunded', { id: 'ch_1', payment_intent: 'pi_unknown', refunded: true, amount_refunded: 4900, currency: 'usd' })
    await post()
    expect(stripeMocks.sessionsList).toHaveBeenCalledWith({ payment_intent: 'pi_unknown', limit: 1 }, { stripeAccount: ACCOUNT })
    expect(db().tables.offerPurchase[0].status).toBe('REFUNDED')
  })
})

describe('coaching memberships', () => {
  const subscriptionSession = () => ({ id: 'cs_sub', mode: 'subscription', payment_status: 'paid', subscription: 'sub_1', metadata: meta(offerIds.coaching) })

  it('checkout creates an ACTIVE membership from the live subscription and assigns its program', async () => {
    liveSub('active')
    event('checkout.session.completed', subscriptionSession())
    await post()
    await post()

    expect(stripeMocks.subscriptionsRetrieve).toHaveBeenCalledWith('sub_1', {}, { stripeAccount: ACCOUNT })
    expect(db().tables.offerSubscription).toEqual([
      expect.objectContaining({ status: 'ACTIVE', clientId: CLIENT_ID, stripeCustomerId: 'cus_1', currentPeriodEnd: new Date(1_900_000_000 * 1000) }),
    ])
    expect(programMocks.duplicateProgram).toHaveBeenCalledTimes(1)
    expect(db().tables.offerSubscription[0].assignedProgramId).toBeTruthy()
  })

  it('deletion cancels and pauses the program; a stale update cannot revive it', async () => {
    liveSub('active')
    event('customer.subscription.updated', liveSub('active'))
    await post()
    const programId = db().tables.offerSubscription[0].assignedProgramId

    event('customer.subscription.deleted', liveSub('canceled', { ended_at: 1_850_000_000 }))
    await post()
    expect(db().tables.offerSubscription[0]).toMatchObject({ status: 'CANCELED', canceledAt: new Date(1_850_000_000 * 1000) })
    expect(db().tables.program.find((p) => p.id === programId)!.status).toBe('PAUSED')

    event('customer.subscription.updated', liveSub('active'))
    await post()
    expect(db().tables.offerSubscription[0].status).toBe('CANCELED')
  })

  it('ignores subscriptions with foreign metadata', async () => {
    event('customer.subscription.updated', { id: 'sub_x', metadata: { purchaseType: 'member_coaching' } })
    await post()
    expect(stripeMocks.subscriptionsRetrieve).not.toHaveBeenCalled()
    expect(db().tables.offerSubscription).toHaveLength(0)
  })

  it('invoice.paid notifies the trainer once per invoice', async () => {
    liveSub('active')
    const invoice = {
      id: 'in_1', amount_paid: 9900, amount_due: 9900, currency: 'usd', billing_reason: 'subscription_cycle', attempt_count: 1,
      parent: { subscription_details: { subscription: 'sub_1', metadata: meta(offerIds.coaching) } },
    }
    event('invoice.paid', invoice)
    await post()
    await post()
    expect(notificationsFor(TRAINER_ID, 'OFFER_PAYMENT_RECEIVED')).toHaveLength(1)
    expect(db().tables.offerSubscription[0].status).toBe('ACTIVE')
  })

  it('invoice.payment_failed marks PAST_DUE and notifies both sides once per attempt', async () => {
    liveSub('active')
    event('customer.subscription.updated', liveSub('active'))
    await post()

    const invoice = {
      id: 'in_2', amount_paid: 0, amount_due: 9900, currency: 'usd', billing_reason: 'subscription_cycle', attempt_count: 1,
      parent: { subscription_details: { subscription: 'sub_1', metadata: meta(offerIds.coaching) } },
    }
    event('invoice.payment_failed', invoice)
    await post()
    await post()
    expect(db().tables.offerSubscription[0].status).toBe('PAST_DUE')
    expect(notificationsFor(CLIENT_ID, 'OFFER_PAYMENT_FAILED')).toHaveLength(1)
    expect(notificationsFor(TRAINER_ID, 'OFFER_PAYMENT_FAILED')).toHaveLength(1)
  })

  it('ignores invoices that are not for a subscription', async () => {
    event('invoice.paid', { id: 'in_3', amount_paid: 100, currency: 'usd', parent: null })
    await post()
    expect(stripeMocks.subscriptionsRetrieve).not.toHaveBeenCalled()
  })

  it('returns 500 (so Stripe retries) when the live read fails', async () => {
    stripeMocks.subscriptionsRetrieve.mockRejectedValue(new Error('stripe down'))
    event('customer.subscription.updated', liveSub('active'))
    stripeMocks.subscriptionsRetrieve.mockRejectedValue(new Error('stripe down'))
    expect((await post()).status).toBe(500)
  })
})

describe('account events', () => {
  it('account.updated mirrors the flags', async () => {
    event('account.updated', { id: ACCOUNT, charges_enabled: false, payouts_enabled: false, details_submitted: true, country: 'US', default_currency: 'usd' })
    await post()
    expect(db().tables.connectedAccount[0]).toMatchObject({ chargesEnabled: false, payoutsEnabled: false })
  })

  it('account.application.deauthorized disconnects and hides offers', async () => {
    event('account.application.deauthorized', { id: 'ca_platform', object: 'application' })
    await post()
    expect(db().tables.connectedAccount[0].disconnectedAt).toBeInstanceOf(Date)
    expect(db().tables.paidOffer.every((o) => o.isActive === false)).toBe(true)
  })
})

describe('review hardening', () => {
  const subscriptionSession = () => ({ id: 'cs_sub', mode: 'subscription', payment_status: 'paid', subscription: 'sub_1', metadata: meta(offerIds.coaching) })

  // 1. Refund before paid
  it('a refund that arrives before the paid event flips PENDING to REFUNDED and the paid event never fulfills', async () => {
    seedPendingPurchase()
    stripeMocks.sessionsList.mockResolvedValue({ data: [{ id: 'cs_prog' }] })
    event('charge.refunded', { id: 'ch_1', payment_intent: 'pi_1', refunded: true, amount_refunded: 4900, currency: 'usd' })
    await post()
    expect(db().tables.offerPurchase[0].status).toBe('REFUNDED')

    event('checkout.session.completed', programSession())
    await post()
    expect(db().tables.offerPurchase[0].status).toBe('REFUNDED')
    expect(programMocks.duplicateProgram).not.toHaveBeenCalled()
  })

  it('a paid event for an already-refunded payment (e.g. cron reconcile) marks REFUNDED instead of fulfilling', async () => {
    seedPendingPurchase({ createdAt: new Date(Date.now() - 10 * 60 * 1000) })
    stripeMocks.paymentIntentsRetrieve.mockResolvedValue({ id: 'pi_1', latest_charge: { id: 'ch_1', amount: 4900, amount_refunded: 4900, refunded: true } })
    stripeMocks.sessionsRetrieve.mockResolvedValue(programSession())
    await retryStuckOfferPurchases()
    expect(stripeMocks.paymentIntentsRetrieve).toHaveBeenCalledWith('pi_1', { expand: ['latest_charge'] }, { stripeAccount: ACCOUNT })
    expect(db().tables.offerPurchase[0].status).toBe('REFUNDED')
    expect(programMocks.duplicateProgram).not.toHaveBeenCalled()
  })

  // 2. Trainer-controlled metadata
  it.each([
    ['a user in another org', { role: 'CLIENT', clerkOrgId: 'org_other' }],
    ['a trainer', { role: 'TRAINER', clerkOrgId: 'org_1' }],
  ])('ignores a session whose clientId is %s', async (_label, fields) => {
    const victim = db().insert('user', { firstName: 'V', lastName: 'Ictim', email: 'v@test.com', ...fields })
    event('checkout.session.completed', programSession({ metadata: meta(offerIds.program, { clientId: victim.id }) }))
    expect((await post()).status).toBe(200)
    expect(db().tables.offerPurchase).toHaveLength(0)
    expect(programMocks.duplicateProgram).not.toHaveBeenCalled()
    expect(db().tables.notification).toHaveLength(0)
  })

  it('ignores a forged subscription for a user outside the trainer org', async () => {
    const victim = db().insert('user', { firstName: 'V', lastName: 'Ictim', email: 'v@test.com', role: 'CLIENT', clerkOrgId: 'org_other' })
    liveSub('active', { metadata: meta(offerIds.coaching, { clientId: victim.id }) })
    event('customer.subscription.updated', { id: 'sub_1', metadata: meta(offerIds.coaching, { clientId: victim.id }) })
    await post()
    expect(db().tables.offerSubscription).toHaveLength(0)
    expect(programMocks.duplicateProgram).not.toHaveBeenCalled()
  })

  // 3. Previous accounts
  it('still handles events for a previous account after the trainer reconnected a new one', async () => {
    liveSub('active')
    event('customer.subscription.updated', liveSub('active'))
    await post()
    const programId = db().tables.offerSubscription[0].assignedProgramId
    db().tables.connectedAccount[0].stripeAccountId = 'acct_new'

    event('customer.subscription.deleted', liveSub('canceled', { ended_at: 1_850_000_000 }))
    const res = await post()
    expect(await res.json()).toEqual({ received: true })
    expect(db().tables.offerSubscription[0].status).toBe('CANCELED')
    expect(db().tables.program.find((p) => p.id === programId)!.status).toBe('PAUSED')
  })

  it('deauthorization ends live memberships on that account and pauses their programs', async () => {
    liveSub('active')
    event('customer.subscription.updated', liveSub('active'))
    await post()
    const programId = db().tables.offerSubscription[0].assignedProgramId

    event('account.application.deauthorized', { id: 'ca_platform', object: 'application' })
    await post()
    await post()
    expect(db().tables.offerSubscription[0].status).toBe('CANCELED')
    expect(db().tables.program.find((p) => p.id === programId)!.status).toBe('PAUSED')
  })

  // 4. Duplicates
  it('cancels a second live membership to the same offer on the connected account', async () => {
    db().insert('offerSubscription', {
      offerId: offerIds.coaching, trainerId: TRAINER_ID, clientId: CLIENT_ID, stripeAccountId: ACCOUNT,
      stripeSubscriptionId: 'sub_first', stripeCustomerId: 'cus_1', status: 'ACTIVE', assignedProgramId: null,
      cancelAtPeriodEnd: false, canceledAt: null, activatedAt: new Date(),
    })
    liveSub('active', { id: 'sub_2' })
    event('checkout.session.completed', { ...subscriptionSession(), subscription: 'sub_2' })
    await post()
    expect(stripeMocks.subscriptionsCancel).toHaveBeenCalledWith('sub_2', {}, { stripeAccount: ACCOUNT })
    const dup = db().tables.offerSubscription.find((s) => s.stripeSubscriptionId === 'sub_2')!
    expect(dup.status).toBe('CANCELED')
    expect(programMocks.duplicateProgram).not.toHaveBeenCalled()
  })

  it('a second paid purchase of the same program does not clone another copy', async () => {
    seedPendingPurchase()
    event('checkout.session.completed', programSession())
    await post()
    seedPendingPurchase({ stripeCheckoutSessionId: 'cs_prog2' })
    stripeMocks.paymentIntentsRetrieve.mockResolvedValue({ id: 'pi_2', latest_charge: { id: 'ch_2', amount: 4900, amount_refunded: 0, refunded: false } })
    event('checkout.session.completed', programSession({ id: 'cs_prog2', payment_intent: 'pi_2' }))
    await post()
    expect(programMocks.duplicateProgram).toHaveBeenCalledTimes(1)
    const second = db().tables.offerPurchase.find((p) => p.stripeCheckoutSessionId === 'cs_prog2')!
    expect(second).toMatchObject({ status: 'PAID', fulfillmentStatus: 'FULFILLED', assignedProgramId: null })
    expect(second.failureReason).toMatch(/Duplicate/)
  })

  // 5. unpaid / paused
  it('unpaid pauses access and returning to active resumes it', async () => {
    liveSub('active')
    event('customer.subscription.updated', liveSub('active'))
    await post()
    const programId = db().tables.offerSubscription[0].assignedProgramId
    const program = () => db().tables.program.find((p) => p.id === programId)!

    event('customer.subscription.updated', liveSub('unpaid'))
    await post()
    expect(db().tables.offerSubscription[0].status).toBe('PAUSED')
    expect(program().status).toBe('PAUSED')

    event('customer.subscription.updated', liveSub('active'))
    await post()
    expect(db().tables.offerSubscription[0].status).toBe('ACTIVE')
    expect(program().status).toBe('ACTIVE')
    expect(programMocks.duplicateProgram).toHaveBeenCalledTimes(1)
  })

  // 6. In-flight refund + disputes
  it('a refund that lands while the program is being assigned still pauses it', async () => {
    const purchase = seedPendingPurchase({ status: 'PAID', stripePaymentIntentId: 'pi_1' })
    programMocks.assignProgram.mockImplementationOnce(async (id: string, clientId: string) => {
      Object.assign(db().tables.program.find((p) => p.id === id)!, { clientId, status: 'ACTIVE' })
      // The refund webhook runs now: no program recorded yet to pause.
      Object.assign(db().tables.offerPurchase[0], { status: 'REFUNDED' })
      return { id }
    })
    await fulfillOfferPurchase(purchase.id)
    const programId = db().tables.offerPurchase[0].assignedProgramId
    expect(db().tables.program.find((p) => p.id === programId)!.status).toBe('PAUSED')
  })

  it('a lost dispute revokes access like a full refund; a won one changes nothing', async () => {
    seedPendingPurchase()
    event('checkout.session.completed', programSession())
    await post()
    const programId = db().tables.offerPurchase[0].assignedProgramId

    event('charge.dispute.closed', { id: 'dp_1', status: 'won', payment_intent: 'pi_1', charge: 'ch_1' })
    await post()
    expect(db().tables.offerPurchase[0].status).toBe('PAID')

    event('charge.dispute.closed', { id: 'dp_1', status: 'lost', payment_intent: 'pi_1', charge: 'ch_1' })
    await post()
    expect(db().tables.offerPurchase[0]).toMatchObject({ status: 'REFUNDED', failureReason: 'Dispute lost' })
    expect(db().tables.program.find((p) => p.id === programId)!.status).toBe('PAUSED')
  })

  // 7. activatedAt
  it('records activatedAt only once a membership is paid', async () => {
    liveSub('incomplete')
    event('customer.subscription.updated', liveSub('incomplete'))
    await post()
    expect(db().tables.offerSubscription[0].activatedAt).toBeNull()

    event('customer.subscription.updated', liveSub('active'))
    await post()
    const activatedAt = db().tables.offerSubscription[0].activatedAt
    expect(activatedAt).toBeInstanceOf(Date)

    event('customer.subscription.updated', liveSub('active'))
    await post()
    expect(db().tables.offerSubscription[0].activatedAt).toBe(activatedAt)
  })
})
