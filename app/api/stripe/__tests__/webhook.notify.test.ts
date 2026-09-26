import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.mock factories hoist above all top-level code, so a plain `const` declared
// here would ReferenceError. vi.hoisted() is this repo's convention for it
// (see ai.service.test.ts, program-purchase.service.test.ts and 6 others).
const stripeMocks = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  sessionsList: vi.fn(async () => ({ data: [{ id: 'cs_1' }] })),
}))
const constructEvent = stripeMocks.constructEvent
vi.mock('@/lib/stripe', () => ({
  stripe: {
    webhooks: { constructEvent: stripeMocks.constructEvent },
    checkout: { sessions: { list: stripeMocks.sessionsList } },
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

import { prisma } from '@/lib/prisma'
import { notifyUser } from '@/lib/services/notification.service'
import { sendEmail } from '@/lib/email/send'
import { POST } from '../webhook/route'

const post = () => POST(new Request('https://app.test/api/stripe/webhook', {
  method: 'POST', body: '{}', headers: { 'stripe-signature': 'sig' },
}))

const TRAINER = { trainerId: 't1', trainer: { email: 't@example.com', firstName: 'Mike', lastName: 'Chen' } }

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.mocked(prisma.trainerSubscription.findUnique).mockResolvedValue({ id: 'ts_1' } as never)
  vi.mocked(prisma.trainerSubscription.update).mockResolvedValue(TRAINER as never)
})

describe('invoice.payment_failed', () => {
  it('notifies the trainer with the amount due', async () => {
    constructEvent.mockReturnValue({
      type: 'invoice.payment_failed',
      data: { object: { customer: 'cus_1', amount_due: 4900, currency: 'usd' } },
    })

    await post()

    const arg = vi.mocked(notifyUser).mock.calls[0][0]
    expect(arg.type).toBe('PAYMENT_FAILED')
    expect(arg.userId).toBe('t1')
    expect(arg.email).toMatchObject({ amountDue: '$49.00' })
  })

  it('still returns 200 when the notify step fails', async () => {
    constructEvent.mockReturnValue({
      type: 'invoice.payment_failed',
      data: { object: { customer: 'cus_1', amount_due: 4900, currency: 'usd' } },
    })
    vi.mocked(notifyUser).mockRejectedValue(new Error('boom'))

    expect((await post()).status).toBe(200)
  })
})

describe('customer.subscription.deleted', () => {
  it('notifies the trainer', async () => {
    constructEvent.mockReturnValue({
      type: 'customer.subscription.deleted',
      data: { object: { customer: 'cus_1' } },
    })

    await post()

    const arg = vi.mocked(notifyUser).mock.calls[0][0]
    expect(arg.type).toBe('SUBSCRIPTION_CANCELED')
    expect(arg.userId).toBe('t1')
    expect(arg.recipientEmail).toBe('t@example.com')
    expect(arg.email).toMatchObject({ billingLink: expect.stringContaining('/settings/billing') })
  })
})

// A trainer who deleted their account has no TrainerSubscription row left.
// Stripe still sends events for that customer; they must be acknowledged and
// ignored rather than throwing P2025 and triggering days of retries.
describe('events for a customer we no longer track', () => {
  for (const [type, object] of [
    ['customer.subscription.deleted', { customer: 'cus_gone' }],
    ['invoice.payment_failed', { customer: 'cus_gone', amount_due: 4900, currency: 'usd' }],
  ] as const) {
    it(`${type}: returns 200 without updating or notifying`, async () => {
      vi.mocked(prisma.trainerSubscription.findUnique).mockResolvedValue(null)
      constructEvent.mockReturnValue({ type, data: { object } })

      expect((await post()).status).toBe(200)
      expect(prisma.trainerSubscription.update).not.toHaveBeenCalled()
      expect(notifyUser).not.toHaveBeenCalled()
    })
  }
})

describe('charge.refunded', () => {
  it('notifies the buyer in-app when the account exists', async () => {
    constructEvent.mockReturnValue({
      type: 'charge.refunded',
      data: { object: { payment_intent: 'pi_1', amount_refunded: 7999, currency: 'usd' } },
    })
    vi.mocked(prisma.programPurchase.findUnique).mockResolvedValue({
      id: 'pp1', buyerUserId: 'u9', buyerEmail: 'buyer@example.com',
      assignedProgramIds: ['prog1'],
    } as never)

    await post()

    const arg = vi.mocked(notifyUser).mock.calls[0][0]
    expect(arg.userId).toBe('u9')
    expect(arg.email).toMatchObject({ amount: '$79.99', programCount: 1 })
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('emails buyerEmail directly when the account was never claimed', async () => {
    constructEvent.mockReturnValue({
      type: 'charge.refunded',
      data: { object: { payment_intent: 'pi_1', amount_refunded: 7999, currency: 'usd' } },
    })
    vi.mocked(prisma.programPurchase.findUnique).mockResolvedValue({
      id: 'pp1', buyerUserId: null, buyerEmail: 'buyer@example.com',
      assignedProgramIds: ['prog1'],
    } as never)

    await post()

    expect(notifyUser).not.toHaveBeenCalled()
    const arg = vi.mocked(sendEmail).mock.calls[0][0]
    expect(arg.to).toBe('buyer@example.com')
    // This path bypasses notifyUser, so nothing is merged in for it — it is
    // the one place a missing prop would ship straight to a real email.
    expect(arg.react.props).toMatchObject({
      recipientName: 'there',
      amount: '$79.99',
      programCount: 1,
    })
  })
})
