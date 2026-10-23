import { describe, it, expect, vi, beforeEach } from 'vitest'

const fake = vi.hoisted(() => ({ db: null as null | import('@/lib/payments/__tests__/fake-db').FakeDb }))
const stripeMocks = vi.hoisted(() => ({ retrieve: vi.fn(), update: vi.fn(), cancel: vi.fn() }))
const caps = vi.hoisted(() => ({ billing: 'trainer' as 'trainer' | 'member' }))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', async () => {
  const { createFakeDb } = await import('@/lib/payments/__tests__/fake-db')
  fake.db = createFakeDb()
  return { prisma: fake.db.prisma }
})
vi.mock('@/lib/stripe', () => ({
  stripe: { subscriptions: { retrieve: stripeMocks.retrieve, update: stripeMocks.update, cancel: stripeMocks.cancel } },
}))
vi.mock('@/lib/org-capabilities.server', () => ({
  getCapabilitiesForUser: vi.fn(async () => ({ billing: caps.billing })),
}))
vi.mock('@/lib/services/audit-log.service', () => ({ logUserAudit: vi.fn() }))
vi.mock('@/lib/services/notification.service', () => ({ notifyUser: vi.fn() }))
vi.mock('@/lib/services/program.service', () => ({
  duplicateProgram: vi.fn(),
  assignProgram: vi.fn(),
  assignOnDemandProgram: vi.fn(),
}))

import {
  cancelOfferSubscription,
  mapSubscriptionStatus,
  resumeOfferSubscription,
} from '../offer-subscription.service'
import { logUserAudit } from '@/lib/services/audit-log.service'

const db = () => fake.db!
const CLIENT = { id: 'c'.repeat(24), role: 'CLIENT' as const, clerkOrgId: 'org_1', email: 'c@test.com', firstName: 'Cam', lastName: 'Client' }
const PROGRAM_ID = 'e'.repeat(24)

function seed(policy: 'END_OF_PERIOD' | 'IMMEDIATE', status = 'ACTIVE', extra: Record<string, unknown> = {}) {
  const offer = db().insert('paidOffer', { kind: 'COACHING', name: 'Coaching', cancellationPolicy: policy, priceInCents: 9900, currency: 'usd' })
  db().insert('program', { id: PROGRAM_ID, status: 'ACTIVE', clientId: CLIENT.id })
  return db().insert('offerSubscription', {
    offerId: offer.id, clientId: CLIENT.id, trainerId: 'a'.repeat(24), stripeAccountId: 'acct_1',
    stripeSubscriptionId: 'sub_1', stripeCustomerId: 'cus_1', status, cancelAtPeriodEnd: false,
    canceledAt: null, assignedProgramId: PROGRAM_ID, ...extra,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  db().reset()
  caps.billing = 'trainer'
})

describe('mapSubscriptionStatus', () => {
  it.each([
    ['active', 'ACTIVE'], ['trialing', 'ACTIVE'], ['past_due', 'PAST_DUE'], ['unpaid', 'PAUSED'],
    ['paused', 'PAUSED'], ['canceled', 'CANCELED'], ['incomplete_expired', 'CANCELED'], ['incomplete', 'INCOMPLETE'],
  ] as const)('%s -> %s', (stripeStatus, expected) => {
    expect(mapSubscriptionStatus(stripeStatus)).toBe(expected)
  })
})

describe('cancelOfferSubscription', () => {
  it('END_OF_PERIOD schedules the cancel on the connected account and keeps access', async () => {
    const row = seed('END_OF_PERIOD')

    const updated = await cancelOfferSubscription(CLIENT, row.id)

    expect(stripeMocks.update).toHaveBeenCalledWith('sub_1', { cancel_at_period_end: true }, { stripeAccount: 'acct_1' })
    expect(stripeMocks.cancel).not.toHaveBeenCalled()
    expect(updated).toMatchObject({ status: 'ACTIVE', cancelAtPeriodEnd: true })
    expect(db().tables.program[0].status).toBe('ACTIVE')
    expect(logUserAudit).toHaveBeenCalledTimes(1)
  })

  it('IMMEDIATE cancels now and pauses the program', async () => {
    const row = seed('IMMEDIATE')

    const updated = await cancelOfferSubscription(CLIENT, row.id)

    expect(stripeMocks.cancel).toHaveBeenCalledWith('sub_1', {}, { stripeAccount: 'acct_1' })
    expect(updated).toMatchObject({ status: 'CANCELED' })
    expect(db().tables.program[0].status).toBe('PAUSED')
  })

  it('a PAST_DUE membership is canceled immediately even with an end-of-period policy', async () => {
    const row = seed('END_OF_PERIOD', 'PAST_DUE')
    await cancelOfferSubscription(CLIENT, row.id)
    expect(stripeMocks.cancel).toHaveBeenCalled()
    expect(db().tables.offerSubscription[0].status).toBe('CANCELED')
  })

  it('a PAUSED membership (Stripe stopped collecting) is canceled immediately', async () => {
    const row = seed('END_OF_PERIOD', 'PAUSED')
    await cancelOfferSubscription(CLIENT, row.id)
    expect(stripeMocks.cancel).toHaveBeenCalled()
    expect(db().tables.offerSubscription[0].status).toBe('CANCELED')
  })

  it('treats an already-canceled Stripe subscription as success', async () => {
    const row = seed('IMMEDIATE')
    stripeMocks.cancel.mockRejectedValue({ code: 'resource_missing' })
    await expect(cancelOfferSubscription(CLIENT, row.id)).resolves.toMatchObject({ status: 'CANCELED' })
  })

  it("refuses another client's membership", async () => {
    const row = seed('END_OF_PERIOD')
    await expect(cancelOfferSubscription({ ...CLIENT, id: 'd'.repeat(24) }, row.id)).rejects.toMatchObject({ code: 'not_found' })
    expect(stripeMocks.update).not.toHaveBeenCalled()
  })

  it('is a no-op on a canceled membership', async () => {
    const row = seed('IMMEDIATE', 'CANCELED')
    await cancelOfferSubscription(CLIENT, row.id)
    expect(stripeMocks.cancel).not.toHaveBeenCalled()
  })
})

describe('resumeOfferSubscription', () => {
  it('clears a period-end cancel', async () => {
    const row = seed('END_OF_PERIOD', 'ACTIVE', { cancelAtPeriodEnd: true })
    stripeMocks.retrieve.mockResolvedValue({ status: 'active', cancel_at_period_end: true, cancel_at: null })

    const updated = await resumeOfferSubscription(CLIENT, row.id)

    expect(stripeMocks.update).toHaveBeenCalledWith('sub_1', { cancel_at_period_end: false }, { stripeAccount: 'acct_1' })
    expect(updated.cancelAtPeriodEnd).toBe(false)
  })

  it('clears a dated cancel set from the Stripe Dashboard', async () => {
    const row = seed('END_OF_PERIOD', 'ACTIVE', { cancelAtPeriodEnd: true })
    stripeMocks.retrieve.mockResolvedValue({ status: 'active', cancel_at_period_end: false, cancel_at: 1_900_000_000 })
    await resumeOfferSubscription(CLIENT, row.id)
    expect(stripeMocks.update).toHaveBeenCalledWith('sub_1', { cancel_at: '' }, { stripeAccount: 'acct_1' })
  })

  it('refuses a membership that is not scheduled to end', async () => {
    const row = seed('END_OF_PERIOD')
    await expect(resumeOfferSubscription(CLIENT, row.id)).rejects.toMatchObject({ code: 'invalid_state' })
  })
})
