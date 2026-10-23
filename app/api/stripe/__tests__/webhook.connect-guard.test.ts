import { describe, it, expect, vi, beforeEach } from 'vitest'

// MIA's own billing webhook must never act on an event from a trainer's
// connected account (those go to /api/stripe/connect/webhook).

const constructEvent = vi.hoisted(() => vi.fn())
const handlers = vi.hoisted(() => ({
  activateSubscriptionFromCheckout: vi.fn(),
  syncSubscriptionFromStripe: vi.fn(),
  syncCoachingFromStripe: vi.fn(),
  syncMemberSubscriptionFromStripe: vi.fn(),
  markMemberPastDue: vi.fn(),
  markCoachingPastDue: vi.fn(),
}))

vi.mock('@/lib/stripe', () => ({ stripe: { webhooks: { constructEvent }, checkout: { sessions: { list: vi.fn() } } } }))
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({ prisma: { trainerSubscription: { findUnique: vi.fn(), update: vi.fn() } } }))
vi.mock('@/lib/services/stripe-billing.service', () => ({
  activateSubscriptionFromCheckout: handlers.activateSubscriptionFromCheckout,
  syncSubscriptionFromStripe: handlers.syncSubscriptionFromStripe,
}))
vi.mock('@/lib/services/member-billing.service', () => ({
  MEMBER_PURCHASE_TYPE: 'member_subscription',
  activateMemberFromCheckout: vi.fn(),
  syncMemberSubscriptionFromStripe: handlers.syncMemberSubscriptionFromStripe,
  markMemberCanceled: vi.fn(),
  markMemberPastDue: handlers.markMemberPastDue,
}))
vi.mock('@/lib/services/coaching.service', () => ({
  COACHING_PURCHASE_TYPE: 'member_coaching',
  activateCoachingFromCheckout: vi.fn(),
  syncCoachingFromStripe: handlers.syncCoachingFromStripe,
  markCoachingPastDue: handlers.markCoachingPastDue,
}))
vi.mock('@/lib/services/program-purchase.service', () => ({ fulfillProgramPurchase: vi.fn() }))
vi.mock('@/lib/services/notification.service', () => ({ notifyUser: vi.fn(), NOTIFICATION_TYPES: {} }))
vi.mock('@/lib/email/send', () => ({ sendEmail: vi.fn() }))

import { POST } from '../webhook/route'

const post = () =>
  POST(new Request('https://app.test/api/stripe/webhook', { method: 'POST', body: '{}', headers: { 'stripe-signature': 'sig' } }))

beforeEach(() => vi.clearAllMocks())

describe('platform webhook ignores Connect events', () => {
  it.each([
    ['checkout.session.completed', { id: 'cs_1', metadata: {} }],
    ['customer.subscription.updated', { id: 'sub_1', customer: 'cus_1', metadata: {} }],
    ['invoice.payment_failed', { id: 'in_1', customer: 'cus_1', parent: null }],
  ])('%s with event.account is acknowledged without handling', async (type, object) => {
    constructEvent.mockReturnValue({ type, account: 'acct_trainer', data: { object } })
    const res = await post()
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ignored: 'connect_event' })
    for (const handler of Object.values(handlers)) expect(handler).not.toHaveBeenCalled()
  })

  it('still handles platform events (no event.account)', async () => {
    constructEvent.mockReturnValue({ type: 'checkout.session.completed', data: { object: { id: 'cs_1', metadata: {} } } })
    await post()
    expect(handlers.activateSubscriptionFromCheckout).toHaveBeenCalled()
  })
})
