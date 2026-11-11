import { describe, it, expect, vi, beforeEach } from 'vitest'

const stripeMocks = vi.hoisted(() => ({ constructEvent: vi.fn() }))
vi.mock('@/lib/stripe', () => ({
  stripe: { webhooks: { constructEvent: stripeMocks.constructEvent }, checkout: { sessions: { list: vi.fn() } } },
}))
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (fn: () => Promise<void>) => fn(),
}))
vi.mock('@/lib/prisma', () => ({ prisma: { trainerSubscription: { findUnique: vi.fn(), update: vi.fn() } } }))
vi.mock('@/lib/services/notification.service', () => ({ notifyUser: vi.fn(), NOTIFICATION_TYPES: {} }))
vi.mock('@/lib/email/send', () => ({ sendEmail: vi.fn() }))
vi.mock('@/lib/services/stripe-billing.service', () => ({
  syncSubscriptionFromStripe: vi.fn(),
  activateSubscriptionFromCheckout: vi.fn(),
}))
vi.mock('@/lib/services/program-purchase.service', () => ({ fulfillProgramPurchase: vi.fn() }))
vi.mock('@/lib/services/coaching.service', () => ({
  COACHING_PURCHASE_TYPE: 'member_coaching',
  activateCoachingFromCheckout: vi.fn(),
  syncCoachingFromStripe: vi.fn().mockResolvedValue(false),
  markCoachingPastDue: vi.fn().mockResolvedValue(false),
}))
vi.mock('@/lib/services/member-billing.service', () => ({
  MEMBER_PURCHASE_TYPE: 'member_subscription',
  activateMemberFromCheckout: vi.fn(),
  syncMemberSubscriptionFromStripe: vi.fn(),
  markMemberCanceled: vi.fn(),
  markMemberPastDue: vi.fn(),
}))
vi.mock('@/lib/referrals/payments', () => ({ recordReferralInvoicePayment: vi.fn() }))

import { recordReferralInvoicePayment } from '@/lib/referrals/payments'
import { POST } from '../webhook/route'

const post = () =>
  POST(new Request('https://app.test/api/stripe/webhook', { method: 'POST', body: '{}', headers: { 'stripe-signature': 'sig' } }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('invoice.paid → referrals', () => {
  const invoice = { id: 'in_1', customer: 'cus_1', amount_paid: 3999 }

  it('hands platform invoices to the referral ledger', async () => {
    stripeMocks.constructEvent.mockReturnValue({ type: 'invoice.paid', data: { object: invoice } })
    vi.mocked(recordReferralInvoicePayment).mockResolvedValue(true)
    const res = await post()
    expect(res.status).toBe(200)
    expect(recordReferralInvoicePayment).toHaveBeenCalledWith(invoice)
  })

  it('returns 500 on failure so Stripe retries (the handler is idempotent)', async () => {
    stripeMocks.constructEvent.mockReturnValue({ type: 'invoice.paid', data: { object: invoice } })
    vi.mocked(recordReferralInvoicePayment).mockRejectedValue(new Error('db down'))
    expect((await post()).status).toBe(500)
  })

  it('never touches connected-account invoices', async () => {
    stripeMocks.constructEvent.mockReturnValue({ type: 'invoice.paid', account: 'acct_1', data: { object: invoice } })
    await post()
    expect(recordReferralInvoicePayment).not.toHaveBeenCalled()
  })
})
