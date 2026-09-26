import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    // updateMany, not update: the service tolerates a trainer whose
    // subscription row is gone (deleted account) instead of throwing P2025
    // and making Stripe retry the event for days.
    trainerSubscription: {
      updateMany: vi.fn(),
    },
  },
}))

vi.mock('@/lib/stripe', () => ({
  stripe: {
    subscriptions: { retrieve: vi.fn() },
  },
}))

vi.mock('@/lib/stripe-config', () => ({
  tierFromPriceId: vi.fn((id: string) => {
    if (id === 'price_starter') return 'STARTER'
    if (id === 'price_pro') return 'PRO'
    if (id === 'price_unlimited') return 'UNLIMITED'
    return null
  }),
}))

import { prisma } from '@/lib/prisma'
import { stripe } from '@/lib/stripe'
import {
  syncSubscriptionFromStripe,
  activateSubscriptionFromCheckout,
} from '@/lib/services/stripe-billing.service'
import type Stripe from 'stripe'

const mockUpdate = vi.mocked(prisma.trainerSubscription.updateMany)
const mockRetrieve = vi.mocked(stripe.subscriptions.retrieve)

beforeEach(() => vi.clearAllMocks())

describe('syncSubscriptionFromStripe', () => {
  it('maps active status and syncs period end and plan', async () => {
    const sub = {
      id: 'sub_123',
      status: 'active',
      cancel_at_period_end: false,
      items: { data: [{ price: { id: 'price_pro' }, current_period_end: 1800000000 }] },
    } as unknown as Stripe.Subscription

    await syncSubscriptionFromStripe('cus_123', sub)

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { stripeCustomerId: 'cus_123' },
      data: {
        stripeSubscriptionId: 'sub_123',
        stripePriceId: 'price_pro',
        plan: 'PRO',
        status: 'ACTIVE',
        currentPeriodEnd: new Date(1800000000 * 1000),
        cancelAtPeriodEnd: false,
      },
    })
  })

  it('maps past_due to PAST_DUE', async () => {
    const sub = {
      id: 'sub_456',
      status: 'past_due',
      cancel_at_period_end: false,
      items: { data: [{ price: { id: 'price_starter' }, current_period_end: 1800000000 }] },
    } as unknown as Stripe.Subscription

    await syncSubscriptionFromStripe('cus_456', sub)

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PAST_DUE' }),
      })
    )
  })

  it('maps canceled to CANCELED', async () => {
    const sub = {
      id: 'sub_789',
      status: 'canceled',
      cancel_at_period_end: false,
      items: { data: [] },
    } as unknown as Stripe.Subscription

    await syncSubscriptionFromStripe('cus_789', sub)

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'CANCELED' }),
      })
    )
  })

  it('falls back to STARTER plan when priceId is unknown', async () => {
    const sub = {
      id: 'sub_000',
      status: 'active',
      cancel_at_period_end: false,
      items: { data: [{ price: { id: 'price_unknown' }, current_period_end: 1800000000 }] },
    } as unknown as Stripe.Subscription

    await syncSubscriptionFromStripe('cus_000', sub)

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ plan: 'STARTER' }),
      })
    )
  })
})

describe('activateSubscriptionFromCheckout', () => {
  it('retrieves full subscription and sets ACTIVE status', async () => {
    const mockSub = {
      id: 'sub_new',
      status: 'active',
      cancel_at_period_end: false,
      items: { data: [{ price: { id: 'price_pro' }, current_period_end: 1900000000 }] },
    } as unknown as Stripe.Subscription

    mockRetrieve.mockResolvedValue(mockSub as Awaited<ReturnType<typeof stripe.subscriptions.retrieve>>)

    const session = {
      customer: 'cus_new',
      subscription: 'sub_new',
    } as unknown as Stripe.Checkout.Session

    await activateSubscriptionFromCheckout(session)

    expect(mockRetrieve).toHaveBeenCalledWith('sub_new')
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { stripeCustomerId: 'cus_new' },
      data: expect.objectContaining({
        stripeSubscriptionId: 'sub_new',
        plan: 'PRO',
        status: 'ACTIVE',
      }),
    })
  })
})
