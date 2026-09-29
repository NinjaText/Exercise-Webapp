import { describe, it, expect, vi, beforeEach } from 'vitest'

const stripeMocks = vi.hoisted(() => ({ constructEvent: vi.fn() }))
const constructEvent = stripeMocks.constructEvent
vi.mock('@/lib/stripe', () => ({
  stripe: {
    webhooks: { constructEvent: stripeMocks.constructEvent },
    checkout: { sessions: { list: vi.fn() } },
  },
}))
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (fn: () => Promise<void>) => fn(),
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    trainerSubscription: { findUnique: vi.fn(), update: vi.fn() },
    programPurchase: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    program: { updateMany: vi.fn() },
  },
}))
vi.mock('@/lib/services/notification.service', () => ({
  notifyUser: vi.fn().mockResolvedValue(undefined),
  NOTIFICATION_TYPES: {
    PAYMENT_FAILED: 'PAYMENT_FAILED',
    SUBSCRIPTION_CANCELED: 'SUBSCRIPTION_CANCELED',
    REFUND_PROCESSED: 'REFUND_PROCESSED',
  },
}))
vi.mock('@/lib/email/send', () => ({ sendEmail: vi.fn().mockResolvedValue(true) }))
vi.mock('@/lib/services/stripe-billing.service', () => ({
  syncSubscriptionFromStripe: vi.fn(),
  activateSubscriptionFromCheckout: vi.fn(),
}))
vi.mock('@/lib/services/program-purchase.service', () => ({ fulfillProgramPurchase: vi.fn() }))
vi.mock('@/lib/services/member-billing.service', () => ({
  MEMBER_PURCHASE_TYPE: 'member_subscription',
  activateMemberFromCheckout: vi.fn(),
  syncMemberSubscriptionFromStripe: vi.fn(),
  markMemberCanceled: vi.fn(),
  markMemberPastDue: vi.fn(),
}))

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

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.mocked(prisma.trainerSubscription.findUnique).mockResolvedValue(null)
})

describe('member webhook routing', () => {
  const memberCheckout = {
    type: 'checkout.session.completed',
    data: { object: { customer: 'cus_1', subscription: 'sub_1', metadata: { purchaseType: 'member_subscription', userId: 'u1' } } },
  }

  it('routes member checkout to member activation, not trainer activation', async () => {
    constructEvent.mockReturnValue(memberCheckout)
    expect((await post()).status).toBe(200)
    expect(activateMemberFromCheckout).toHaveBeenCalledTimes(1)
    expect(activateSubscriptionFromCheckout).not.toHaveBeenCalled()
  })

  it('subscription.updated: skips trainer sync when a member row matched', async () => {
    constructEvent.mockReturnValue({ type: 'customer.subscription.updated', data: { object: { customer: 'cus_1' } } })
    vi.mocked(syncMemberSubscriptionFromStripe).mockResolvedValue(1)
    await post()
    expect(syncSubscriptionFromStripe).not.toHaveBeenCalled()
  })

  it('subscription.updated: falls through to trainer sync when no member matched', async () => {
    constructEvent.mockReturnValue({ type: 'customer.subscription.updated', data: { object: { customer: 'cus_t' } } })
    vi.mocked(syncMemberSubscriptionFromStripe).mockResolvedValue(0)
    await post()
    expect(syncSubscriptionFromStripe).toHaveBeenCalledTimes(1)
  })

  it('subscription.deleted: member match short-circuits the trainer path', async () => {
    constructEvent.mockReturnValue({ type: 'customer.subscription.deleted', data: { object: { customer: 'cus_1', id: 'sub_9' } } })
    vi.mocked(markMemberCanceled).mockResolvedValue(1)
    expect((await post()).status).toBe(200)
    expect(markMemberCanceled).toHaveBeenCalledWith('cus_1', 'sub_9')
    expect(prisma.trainerSubscription.findUnique).not.toHaveBeenCalled()
  })

  it('invoice.payment_failed: non-member falls through to the trainer path', async () => {
    constructEvent.mockReturnValue({
      type: 'invoice.payment_failed',
      data: { object: { customer: 'cus_t', amount_due: 4900, currency: 'usd' } },
    })
    vi.mocked(markMemberPastDue).mockResolvedValue(0)
    await post()
    expect(prisma.trainerSubscription.findUnique).toHaveBeenCalled()
  })

  it('invoice.payment_failed: passes the invoice subscription id to the member path', async () => {
    constructEvent.mockReturnValue({
      type: 'invoice.payment_failed',
      data: { object: { customer: 'cus_1', parent: { subscription_details: { subscription: 'sub_7' } } } },
    })
    vi.mocked(markMemberPastDue).mockResolvedValue(1)
    expect((await post()).status).toBe(200)
    expect(markMemberPastDue).toHaveBeenCalledWith('cus_1', 'sub_7')
  })

  it('is idempotent when the same member checkout is delivered twice', async () => {
    constructEvent.mockReturnValue(memberCheckout)
    expect((await post()).status).toBe(200)
    expect((await post()).status).toBe(200)
    expect(activateMemberFromCheckout).toHaveBeenCalledTimes(2)
  })
})
