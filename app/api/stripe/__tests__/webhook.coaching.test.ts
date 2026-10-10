import { describe, it, expect, vi, beforeEach } from 'vitest'

// Route-level tests for the coaching add-on's Stripe events (spec §6 webhook
// routing). The real coaching and member-billing services run against a tiny
// in-memory prisma, so these check the actual rows written; the member and
// trainer handlers are spies so we can assert coaching events never reach them.

type Row = Record<string, any>

const db = vi.hoisted(() => ({ coaching: null as Row | null, member: null as Row | null }))
/** Stripe's live subscriptions, as `subscriptions.retrieve` returns them. */
const liveSubs = vi.hoisted(() => new Map<string, Row>())

/** Equality on plain fields plus `OR`, which is all the services use here. */
const matches = vi.hoisted(() => {
  const fn = (row: Row, where: Row): boolean =>
    Object.entries(where).every(([key, value]) =>
      key === 'OR' ? (value as Row[]).some((w) => fn(row, w)) : (row[key] ?? null) === value
    )
  return fn
})

const stripeMocks = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  retrieve: vi.fn(),
  cancel: vi.fn(),
}))
vi.mock('@/lib/stripe', () => ({
  stripe: {
    webhooks: { constructEvent: stripeMocks.constructEvent },
    subscriptions: { retrieve: stripeMocks.retrieve, cancel: stripeMocks.cancel, update: vi.fn() },
    checkout: { sessions: { list: vi.fn() } },
  },
}))
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (fn: () => Promise<void>) => fn(),
}))
vi.mock('@/lib/prisma', () => {
  const table = (key: 'coaching' | 'member') => ({
    findUnique: vi.fn(async ({ where }: { where: Row }) =>
      db[key] && matches(db[key]!, where) ? { ...db[key] } : null),
    findFirst: vi.fn(async ({ where }: { where: Row }) =>
      db[key] && matches(db[key]!, where) ? { ...db[key] } : null),
    findMany: vi.fn(async ({ where }: { where: Row }) =>
      db[key] && matches(db[key]!, where) ? [{ ...db[key] }] : []),
    updateMany: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
      if (!db[key] || !matches(db[key]!, where)) return { count: 0 }
      db[key] = { ...db[key], ...data }
      return { count: 1 }
    }),
  })
  return {
    prisma: {
      memberCoaching: table('coaching'),
      memberSubscription: table('member'),
      trainerSubscription: { findUnique: vi.fn(), update: vi.fn() },
      programPurchase: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
      program: { updateMany: vi.fn() },
    },
  }
})
vi.mock('@/lib/services/notification.service', () => ({
  notifyUser: vi.fn().mockResolvedValue(undefined),
  NOTIFICATION_TYPES: { PAYMENT_FAILED: 'PAYMENT_FAILED', SUBSCRIPTION_CANCELED: 'SUBSCRIPTION_CANCELED' },
}))
vi.mock('@/lib/email/send', () => ({ sendEmail: vi.fn().mockResolvedValue(true) }))
vi.mock('@/lib/services/stripe-billing.service', () => ({
  syncSubscriptionFromStripe: vi.fn(),
  activateSubscriptionFromCheckout: vi.fn(),
}))
vi.mock('@/lib/services/program-purchase.service', () => ({ fulfillProgramPurchase: vi.fn() }))
vi.mock('@/lib/org-capabilities.server', () => ({ getOrgForUser: vi.fn() }))
vi.mock('@/lib/services/audit-log.service', () => ({ logUserAudit: vi.fn() }))
// Real member billing, wrapped in spies.
vi.mock('@/lib/services/member-billing.service', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/services/member-billing.service')>()
  return {
    ...real,
    activateMemberFromCheckout: vi.fn(real.activateMemberFromCheckout),
    syncMemberSubscriptionFromStripe: vi.fn(real.syncMemberSubscriptionFromStripe),
    markMemberCanceled: vi.fn(real.markMemberCanceled),
    markMemberPastDue: vi.fn(real.markMemberPastDue),
  }
})

import { prisma } from '@/lib/prisma'
import {
  syncSubscriptionFromStripe, activateSubscriptionFromCheckout,
} from '@/lib/services/stripe-billing.service'
import {
  activateMemberFromCheckout, syncMemberSubscriptionFromStripe, markMemberCanceled, markMemberPastDue,
} from '@/lib/services/member-billing.service'
import { POST } from '../webhook/route'

const post = () => POST(new Request('https://app.test/api/stripe/webhook', {
  method: 'POST', body: '{}', headers: { 'stripe-signature': 'sig' },
}))

const PERIOD_END = 1_800_000_000
const ACCEPTED_AT = 1_700_000_000 // seconds; the trainer accepted the offer
const COACHING_META = { purchaseType: 'member_coaching', userId: 'u1' }

/** Also becomes the subscription's live Stripe state. Created after the offer was accepted by default. */
function stripeSub(id: string, status: string, metadata: Row = COACHING_META, extra: Row = {}) {
  const sub = {
    id, status, customer: 'cus_1', metadata, cancel_at_period_end: false, created: ACCEPTED_AT + 60,
    items: { data: [{ current_period_end: PERIOD_END }] },
    ...extra,
  }
  liveSubs.set(id, sub)
  return sub
}

function constructEvent(type: string, object: Row) {
  stripeMocks.constructEvent.mockReturnValue({ type, data: { object } })
}

function coachingRow(status: string, stripeSubscriptionId: string | null = null) {
  db.coaching = {
    id: 'mc1', userId: 'u1', clerkOrgId: 'org_club', status, stripeSubscriptionId,
    currentPeriodEnd: null, cancelAtPeriodEnd: false, respondedAt: new Date(ACCEPTED_AT * 1000),
  }
}

/** A trialing member whose membership has no Stripe subscription yet, on the same customer. */
function trialingMember(extra: Row = {}) {
  db.member = {
    id: 'ms1', userId: 'u1', clerkOrgId: 'org_club', status: 'TRIALING',
    stripeCustomerId: 'cus_1', stripeSubscriptionId: null, cancelAtPeriodEnd: false, ...extra,
  }
}

function expectMemberAndTrainerUntouched() {
  expect(syncMemberSubscriptionFromStripe).not.toHaveBeenCalled()
  expect(markMemberCanceled).not.toHaveBeenCalled()
  expect(markMemberPastDue).not.toHaveBeenCalled()
  expect(activateMemberFromCheckout).not.toHaveBeenCalled()
  expect(prisma.memberSubscription.updateMany).not.toHaveBeenCalled()
  expect(syncSubscriptionFromStripe).not.toHaveBeenCalled()
  expect(activateSubscriptionFromCheckout).not.toHaveBeenCalled()
  expect(prisma.trainerSubscription.findUnique).not.toHaveBeenCalled()
  expect(prisma.trainerSubscription.update).not.toHaveBeenCalled()
}

let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  stripeMocks.cancel.mockReset().mockResolvedValue({})
  liveSubs.clear()
  stripeMocks.retrieve.mockReset().mockImplementation(async (id: string) => liveSubs.get(id))
  db.coaching = null
  db.member = null
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.mocked(prisma.trainerSubscription.findUnique).mockResolvedValue(null)
})

describe('coaching subscription events never reach member or trainer billing', () => {
  it('subscription.created before checkout, membership sub id still null: only coaching is updated', async () => {
    trialingMember()
    coachingRow('ACCEPTED')
    constructEvent('customer.subscription.created', stripeSub('sub_coach', 'active'))

    expect((await post()).status).toBe(200)
    expect(db.coaching).toMatchObject({
      status: 'ACTIVE', stripeSubscriptionId: 'sub_coach', currentPeriodEnd: new Date(PERIOD_END * 1000),
    })
    expect(db.member).toMatchObject({ status: 'TRIALING', stripeSubscriptionId: null })
    expectMemberAndTrainerUntouched()
  })

  it('an incomplete subscription.created is still handled as coaching and writes nothing', async () => {
    trialingMember()
    coachingRow('ACCEPTED')
    constructEvent('customer.subscription.created', stripeSub('sub_coach', 'incomplete'))

    expect((await post()).status).toBe(200)
    expect(db.coaching).toMatchObject({ status: 'ACCEPTED', stripeSubscriptionId: null })
    expectMemberAndTrainerUntouched()
  })

  it('checkout.session.completed for coaching → ACTIVE, member and trainer activation not called', async () => {
    trialingMember()
    coachingRow('ACCEPTED')
    stripeSub('sub_coach', 'active')
    constructEvent('checkout.session.completed', {
      customer: 'cus_1', subscription: 'sub_coach', metadata: COACHING_META,
    })

    expect((await post()).status).toBe(200)
    expect(stripeMocks.retrieve).toHaveBeenCalledWith('sub_coach')
    expect(db.coaching).toMatchObject({ status: 'ACTIVE', stripeSubscriptionId: 'sub_coach' })
    expectMemberAndTrainerUntouched()
  })

  it('checkout after subscription.created already activated it is idempotent', async () => {
    coachingRow('ACTIVE', 'sub_coach')
    stripeSub('sub_coach', 'active')
    constructEvent('checkout.session.completed', { customer: 'cus_1', subscription: 'sub_coach', metadata: COACHING_META })

    expect((await post()).status).toBe(200)
    expect(db.coaching).toMatchObject({ status: 'ACTIVE', stripeSubscriptionId: 'sub_coach' })
    expect(stripeMocks.cancel).not.toHaveBeenCalled()
  })

  it('subscription.updated past_due → PAST_DUE', async () => {
    trialingMember()
    coachingRow('ACTIVE', 'sub_coach')
    constructEvent('customer.subscription.updated', stripeSub('sub_coach', 'past_due'))

    expect((await post()).status).toBe(200)
    expect(db.coaching!.status).toBe('PAST_DUE')
    expectMemberAndTrainerUntouched()
  })

  it('routes by stored subscription id even without coaching metadata', async () => {
    trialingMember()
    coachingRow('ACTIVE', 'sub_coach')
    constructEvent('customer.subscription.updated', stripeSub('sub_coach', 'past_due', {}))

    expect((await post()).status).toBe(200)
    expect(db.coaching!.status).toBe('PAST_DUE')
    expectMemberAndTrainerUntouched()
  })

  it('subscription.deleted → CANCELED, membership untouched', async () => {
    trialingMember()
    coachingRow('ACTIVE', 'sub_coach')
    constructEvent('customer.subscription.deleted', stripeSub('sub_coach', 'canceled'))

    expect((await post()).status).toBe(200)
    expect(db.coaching!.status).toBe('CANCELED')
    expect(db.member!.status).toBe('TRIALING')
    expectMemberAndTrainerUntouched()
  })

  it('a replayed active event after CANCELED stays CANCELED', async () => {
    coachingRow('CANCELED', 'sub_coach')
    // The subscription really ended, so the idempotent cancel finds it gone.
    stripeMocks.cancel.mockRejectedValue(new Error('This subscription is already canceled.'))
    constructEvent('customer.subscription.updated', stripeSub('sub_coach', 'active'))

    expect((await post()).status).toBe(200)
    expect(db.coaching!.status).toBe('CANCELED')
    expectMemberAndTrainerUntouched()
  })

  it('invoice.payment_failed on a coaching sub → coaching PAST_DUE, member untouched', async () => {
    trialingMember()
    coachingRow('ACTIVE', 'sub_coach')
    constructEvent('invoice.payment_failed', {
      customer: 'cus_1', amount_due: 2900, currency: 'usd',
      parent: { subscription_details: { subscription: 'sub_coach', metadata: COACHING_META } },
    })

    expect((await post()).status).toBe(200)
    expect(db.coaching!.status).toBe('PAST_DUE')
    expect(db.member!.status).toBe('TRIALING')
    expectMemberAndTrainerUntouched()
  })

  it('invoice.payment_failed on a coaching sub not yet linked to the row still never touches the member', async () => {
    trialingMember()
    coachingRow('ACCEPTED')
    constructEvent('invoice.payment_failed', {
      customer: 'cus_1',
      parent: { subscription_details: { subscription: 'sub_coach', metadata: COACHING_META } },
    })

    expect((await post()).status).toBe(200)
    expect(db.coaching!.status).toBe('ACCEPTED')
    expect(db.member!.status).toBe('TRIALING')
    expectMemberAndTrainerUntouched()
  })
})

describe('stale events from an earlier cycle', () => {
  it('a delayed old-cycle event is not adopted; the real checkout then activates on the new sub', async () => {
    coachingRow('ACCEPTED') // cycle 2, accepted at ACCEPTED_AT
    constructEvent('customer.subscription.updated',
      stripeSub('sub_old', 'active', COACHING_META, { created: ACCEPTED_AT - 86_400 }))

    expect((await post()).status).toBe(200)
    expect(db.coaching).toMatchObject({ status: 'ACCEPTED', stripeSubscriptionId: null })
    expect(stripeMocks.cancel).toHaveBeenCalledWith('sub_old') // still live → cancelled as an orphan

    stripeSub('sub_new', 'active')
    constructEvent('checkout.session.completed', { customer: 'cus_1', subscription: 'sub_new', metadata: COACHING_META })
    expect((await post()).status).toBe(200)
    expect(db.coaching).toMatchObject({ status: 'ACTIVE', stripeSubscriptionId: 'sub_new' })
    expect(stripeMocks.cancel).not.toHaveBeenCalledWith('sub_new')
    expectMemberAndTrainerUntouched()
  })

  it('an ended old-cycle event before acceptance is ignored, not cancelled', async () => {
    coachingRow('ACCEPTED')
    constructEvent('customer.subscription.deleted',
      stripeSub('sub_old', 'canceled', COACHING_META, { created: ACCEPTED_AT - 86_400 }))

    expect((await post()).status).toBe(200)
    expect(stripeMocks.cancel).not.toHaveBeenCalled()
    expect(db.coaching).toMatchObject({ status: 'ACCEPTED', stripeSubscriptionId: null })
  })

  it('adoption uses the live Stripe status, not a stale active snapshot', async () => {
    coachingRow('ACCEPTED')
    const snapshot = { ...stripeSub('sub_coach', 'active') }
    stripeSub('sub_coach', 'canceled') // it has since ended
    constructEvent('customer.subscription.updated', snapshot)

    expect((await post()).status).toBe(200)
    expect(stripeMocks.retrieve).toHaveBeenCalledWith('sub_coach')
    expect(db.coaching).toMatchObject({ status: 'ACCEPTED', stripeSubscriptionId: null })
  })
})

describe('contract errors are logged, never cancel, never fall through', () => {
  it('a tagged subscription without metadata.userId and no stored row is skipped', async () => {
    trialingMember()
    constructEvent('customer.subscription.created', stripeSub('sub_coach', 'active', { purchaseType: 'member_coaching' }))

    expect((await post()).status).toBe(200)
    expect(stripeMocks.cancel).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('no userId'))
    expect(db.member).toMatchObject({ status: 'TRIALING', stripeSubscriptionId: null })
    expectMemberAndTrainerUntouched()
  })

  it('a coaching checkout session without userId is skipped', async () => {
    trialingMember()
    coachingRow('ACCEPTED')
    constructEvent('checkout.session.completed', {
      id: 'cs_1', customer: 'cus_1', subscription: 'sub_coach', metadata: { purchaseType: 'member_coaching' },
    })

    expect((await post()).status).toBe(200)
    expect(stripeMocks.retrieve).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('cs_1'))
    expect(db.coaching!.status).toBe('ACCEPTED')
    expectMemberAndTrainerUntouched()
  })
})

describe('orphaned coaching subscriptions (paid but no open offer)', () => {
  it('checkout completes after the trainer withdrew the offer: cancels in Stripe, row stays CANCELED', async () => {
    coachingRow('CANCELED')
    stripeSub('sub_coach', 'active')
    constructEvent('checkout.session.completed', { customer: 'cus_1', subscription: 'sub_coach', metadata: COACHING_META })

    expect((await post()).status).toBe(200)
    expect(stripeMocks.cancel).toHaveBeenCalledWith('sub_coach')
    expect(db.coaching).toMatchObject({ status: 'CANCELED', stripeSubscriptionId: null })
    expectMemberAndTrainerUntouched()
  })

  it('a non-"already canceled" Stripe error fails the webhook so Stripe retries', async () => {
    coachingRow('DECLINED')
    stripeMocks.cancel.mockRejectedValue(new Error('network'))
    constructEvent('customer.subscription.updated', stripeSub('sub_coach', 'active'))

    expect((await post()).status).toBe(500)
    expect(db.coaching!.status).toBe('DECLINED')
    expectMemberAndTrainerUntouched()
  })

  it('a live event from an old subscription after a re-request is cancelled, not applied to the new cycle', async () => {
    coachingRow('REQUESTED') // re-request cleared stripeSubscriptionId
    constructEvent('customer.subscription.updated', stripeSub('sub_old', 'active'))

    expect((await post()).status).toBe(200)
    expect(stripeMocks.cancel).toHaveBeenCalledWith('sub_old')
    expect(db.coaching).toMatchObject({ status: 'REQUESTED', stripeSubscriptionId: null })
    expectMemberAndTrainerUntouched()
  })

  it('an ended old subscription after a re-request is ignored', async () => {
    coachingRow('REQUESTED')
    constructEvent('customer.subscription.deleted', stripeSub('sub_old', 'canceled'))

    expect((await post()).status).toBe(200)
    expect(stripeMocks.cancel).not.toHaveBeenCalled()
    expect(db.coaching).toMatchObject({ status: 'REQUESTED', stripeSubscriptionId: null })
    expectMemberAndTrainerUntouched()
  })

  it('an old subscription event never overwrites the current cycle\'s subscription', async () => {
    coachingRow('ACTIVE', 'sub_new')
    constructEvent('customer.subscription.deleted', stripeSub('sub_old', 'canceled'))

    expect((await post()).status).toBe(200)
    expect(db.coaching).toMatchObject({ status: 'ACTIVE', stripeSubscriptionId: 'sub_new' })
    expect(stripeMocks.cancel).not.toHaveBeenCalled()
    expectMemberAndTrainerUntouched()
  })
})

describe('membership ended cascades to coaching', () => {
  function memberSub(status: string) {
    return stripeSub('sub_member', status, { purchaseType: 'member_subscription', userId: 'u1' })
  }

  it('membership deleted with ACTIVE coaching → coaching cancelled in Stripe and CANCELED', async () => {
    trialingMember({ status: 'ACTIVE', stripeSubscriptionId: 'sub_member' })
    coachingRow('ACTIVE', 'sub_coach')
    constructEvent('customer.subscription.deleted', memberSub('canceled'))

    expect((await post()).status).toBe(200)
    expect(db.member!.status).toBe('CANCELED')
    expect(stripeMocks.cancel).toHaveBeenCalledWith('sub_coach')
    expect(db.coaching!.status).toBe('CANCELED')
    expect(prisma.trainerSubscription.findUnique).not.toHaveBeenCalled()
  })

  it('membership updated to canceled also cascades', async () => {
    trialingMember({ status: 'ACTIVE', stripeSubscriptionId: 'sub_member' })
    coachingRow('ACCEPTED')
    constructEvent('customer.subscription.updated', memberSub('canceled'))

    expect((await post()).status).toBe(200)
    expect(db.member!.status).toBe('CANCELED')
    expect(db.coaching!.status).toBe('CANCELED')
    expect(syncSubscriptionFromStripe).not.toHaveBeenCalled()
  })

  it('a membership update that is not a cancel leaves coaching alone', async () => {
    trialingMember({ status: 'ACTIVE', stripeSubscriptionId: 'sub_member' })
    coachingRow('ACTIVE', 'sub_coach')
    constructEvent('customer.subscription.updated', memberSub('past_due'))

    expect((await post()).status).toBe(200)
    expect(db.member!.status).toBe('PAST_DUE')
    expect(db.coaching!.status).toBe('ACTIVE')
    expect(stripeMocks.cancel).not.toHaveBeenCalled()
  })

  it('membership checkout that lands CANCELED also cascades', async () => {
    trialingMember()
    coachingRow('REQUESTED')
    memberSub('canceled')
    constructEvent('checkout.session.completed', {
      customer: 'cus_1', subscription: 'sub_member', metadata: { purchaseType: 'member_subscription', userId: 'u1' },
    })

    expect((await post()).status).toBe(200)
    expect(db.member!.status).toBe('CANCELED')
    expect(db.coaching!.status).toBe('CANCELED')
  })

  it('a cascade failure is logged and never fails the membership webhook', async () => {
    trialingMember({ status: 'ACTIVE', stripeSubscriptionId: 'sub_member' })
    coachingRow('ACTIVE', 'sub_coach')
    stripeMocks.cancel.mockRejectedValue(new Error('stripe down'))
    constructEvent('customer.subscription.deleted', memberSub('canceled'))

    expect((await post()).status).toBe(200)
    expect(db.member!.status).toBe('CANCELED')
    expect(db.coaching!.status).toBe('ACTIVE')
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[member-billing] coaching cascade failed for u1'), expect.any(Error)
    )
  })
})

describe('non-coaching events keep their existing routing', () => {
  it('a trainer subscription.updated falls through member to trainer sync', async () => {
    constructEvent('customer.subscription.updated', { ...stripeSub('sub_t', 'active', {}), customer: 'cus_t' })

    expect((await post()).status).toBe(200)
    expect(syncMemberSubscriptionFromStripe).toHaveBeenCalledTimes(1)
    expect(syncSubscriptionFromStripe).toHaveBeenCalledTimes(1)
  })

  it('a member payment_failed with a coaching row on another sub still marks the membership PAST_DUE', async () => {
    trialingMember({ status: 'ACTIVE', stripeSubscriptionId: 'sub_member' })
    coachingRow('ACTIVE', 'sub_coach')
    constructEvent('invoice.payment_failed', {
      customer: 'cus_1', parent: { subscription_details: { subscription: 'sub_member', metadata: {} } },
    })

    expect((await post()).status).toBe(200)
    expect(db.member!.status).toBe('PAST_DUE')
    expect(db.coaching!.status).toBe('ACTIVE')
  })
})
