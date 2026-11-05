import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    // updateMany, not update: the service tolerates a trainer whose
    // subscription row is gone (deleted account) instead of throwing P2025
    // and making Stripe retry the event for days.
    trainerSubscription: {
      updateMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}))

vi.mock('@/lib/stripe', () => ({
  stripe: {
    subscriptions: { retrieve: vi.fn(), list: vi.fn() },
    checkout: { sessions: { create: vi.fn() } },
  },
}))

// Trainer prices are found in Stripe by lookup key (no env vars).
vi.mock('@/lib/billing/tier-price', () => ({
  resolveTierPriceId: vi.fn(async (tier: string) =>
    ({ STARTER: 'price_starter', PRO: 'price_pro', UNLIMITED: 'price_unlimited' })[tier]),
}))

import { prisma } from '@/lib/prisma'
import { stripe } from '@/lib/stripe'
import {
  syncSubscriptionFromStripe,
  activateSubscriptionFromCheckout,
  createTrainerCheckoutSession,
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
      items: { data: [{ price: { id: 'price_pro', lookup_key: 'mia_trainer_growth_monthly_v2' }, current_period_end: 1800000000 }] },
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
      items: { data: [{ price: { id: 'price_starter', lookup_key: 'mia_trainer_starter_monthly_v2' }, current_period_end: 1800000000 }] },
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

  it('keeps the stored plan when the price has none of our lookup keys (never downgrades to STARTER)', async () => {
    const sub = {
      id: 'sub_000',
      status: 'active',
      cancel_at_period_end: false,
      items: { data: [{ price: { id: 'price_unknown' }, current_period_end: 1800000000 }] },
    } as unknown as Stripe.Subscription

    await syncSubscriptionFromStripe('cus_000', sub)

    const data = (mockUpdate.mock.calls[0][0] as any).data
    expect(data).not.toHaveProperty('plan')
    expect(data.stripePriceId).toBe('price_unknown')
  })

  it('syncs a Stripe trial: TRIALING, trialEndsAt = trial_end, trial recorded as used', async () => {
    const sub = {
      id: 'sub_t',
      status: 'trialing',
      trial_start: 1800000000,
      trial_end: 1800604800,
      cancel_at_period_end: false,
      items: { data: [{ price: { id: 'price_starter', lookup_key: 'mia_trainer_starter_monthly_v2' }, current_period_end: 1800604800 }] },
    } as unknown as Stripe.Subscription

    await syncSubscriptionFromStripe('cus_t', sub)

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { stripeCustomerId: 'cus_t' },
      data: expect.objectContaining({
        status: 'TRIALING',
        plan: 'STARTER',
        trialEndsAt: new Date(1800604800 * 1000),
        trialUsedAt: new Date(1800000000 * 1000),
      }),
    })
  })

  it('a trial-less subscription never clears trialUsedAt', async () => {
    const sub = {
      id: 'sub_p',
      status: 'active',
      trial_start: null,
      trial_end: null,
      cancel_at_period_end: false,
      items: { data: [{ price: { id: 'price_pro', lookup_key: 'mia_trainer_growth_monthly_v2' }, current_period_end: 1900000000 }] },
    } as unknown as Stripe.Subscription
    await syncSubscriptionFromStripe('cus_p', sub)
    const data = (mockUpdate.mock.calls[0][0] as any).data
    expect(data).not.toHaveProperty('trialUsedAt')
    expect(data).not.toHaveProperty('trialEndsAt')
  })
})

describe('activateSubscriptionFromCheckout', () => {
  it('retrieves full subscription and sets ACTIVE status', async () => {
    const mockSub = {
      id: 'sub_new',
      status: 'active',
      cancel_at_period_end: false,
      items: { data: [{ price: { id: 'price_pro', lookup_key: 'mia_trainer_growth_monthly_v2' }, current_period_end: 1900000000 }] },
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

describe('activateSubscriptionFromCheckout with a trial', () => {
  it('respects trialing instead of hard-setting ACTIVE', async () => {
    mockRetrieve.mockResolvedValue({
      id: 'sub_tr',
      status: 'trialing',
      trial_start: 1800000000,
      trial_end: 1800604800,
      cancel_at_period_end: false,
      items: { data: [{ price: { id: 'price_unlimited', lookup_key: 'mia_trainer_pro_monthly_v2' }, current_period_end: 1800604800 }] },
    } as any)
    await activateSubscriptionFromCheckout({ customer: 'cus_tr', subscription: 'sub_tr' } as any)
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { stripeCustomerId: 'cus_tr' },
      data: expect.objectContaining({ status: 'TRIALING', plan: 'UNLIMITED', trialEndsAt: new Date(1800604800 * 1000) }),
    })
  })
})

describe('createTrainerCheckoutSession', () => {
  const findSub = vi.mocked(prisma.trainerSubscription.findUnique)
  const createSession = vi.mocked(stripe.checkout.sessions.create)
  const listSubs = vi.mocked(stripe.subscriptions.list)
  const fresh = {
    trainerId: 't1', stripeCustomerId: 'cus_1', stripeSubscriptionId: null, status: 'TRIALING',
    trialEndsAt: new Date(0), trialUsedAt: null,
  }

  beforeEach(() => {
    createSession.mockResolvedValue({ url: 'https://stripe.test/c' } as any)
    listSubs.mockResolvedValue({ data: [] } as any)
  })

  it('first checkout: 7-day trial, card always collected', async () => {
    findSub.mockResolvedValue(fresh as any)
    expect(await createTrainerCheckoutSession('t1', 'PRO')).toEqual({ ok: true, url: 'https://stripe.test/c' })
    const params = createSession.mock.calls[0][0] as any
    expect(params.mode).toBe('subscription')
    expect(params.payment_method_collection).toBe('always')
    expect(params.customer).toBe('cus_1')
    expect(params.line_items).toEqual([{ price: 'price_pro', quantity: 1 }])
    expect(params.subscription_data.trial_period_days).toBe(7)
    expect(params.success_url).toContain('session_id={CHECKOUT_SESSION_ID}')
  })

  it('one trial per account: trialUsedAt set → no trial', async () => {
    findSub.mockResolvedValue({ ...fresh, trialUsedAt: new Date('2026-01-01') } as any)
    await createTrainerCheckoutSession('t1', 'STARTER')
    const params = createSession.mock.calls[0][0] as any
    expect(params.subscription_data.trial_period_days).toBeUndefined()
    expect(params.subscription_data.trial_end).toBeUndefined()
    expect(params.payment_method_collection).toBe('always')
  })

  it('re-subscribe after cancel (subscription id kept) → no trial', async () => {
    findSub.mockResolvedValue({ ...fresh, status: 'CANCELED', stripeSubscriptionId: 'sub_old' } as any)
    await createTrainerCheckoutSession('t1', 'STARTER')
    expect((createSession.mock.calls[0][0] as any).subscription_data.trial_period_days).toBeUndefined()
  })

  it('returning Stripe customer with an earlier subscription → no trial', async () => {
    findSub.mockResolvedValue(fresh as any)
    listSubs.mockResolvedValue({ data: [{ id: 'sub_elsewhere' }] } as any)
    await createTrainerCheckoutSession('t1', 'STARTER')
    expect((createSession.mock.calls[0][0] as any).subscription_data.trial_period_days).toBeUndefined()
  })

  it('an expired legacy card-less trial counts as the trial', async () => {
    findSub.mockResolvedValue({ ...fresh, trialEndsAt: new Date('2026-01-01') } as any)
    await createTrainerCheckoutSession('t1', 'STARTER')
    expect((createSession.mock.calls[0][0] as any).subscription_data.trial_period_days).toBeUndefined()
  })

  it('a running legacy trial keeps its remaining days (trial_end)', async () => {
    const end = new Date(Date.now() + 5 * 24 * 3600_000)
    findSub.mockResolvedValue({ ...fresh, trialEndsAt: end } as any)
    await createTrainerCheckoutSession('t1', 'STARTER')
    const sd = (createSession.mock.calls[0][0] as any).subscription_data
    expect(sd.trial_end).toBe(Math.floor(end.getTime() / 1000))
    expect(sd.trial_period_days).toBeUndefined()
  })

  it('refuses a second live subscription', async () => {
    findSub.mockResolvedValue({ ...fresh, status: 'TRIALING', stripeSubscriptionId: 'sub_live' } as any)
    expect(await createTrainerCheckoutSession('t1', 'STARTER')).toMatchObject({ ok: false, status: 409 })
    expect(createSession).not.toHaveBeenCalled()
  })
})

describe('portal cancellation during a trial (Stripe sets cancel_at, not cancel_at_period_end)', () => {
  it('records the subscription as ending, so billing never promises a first charge', async () => {
    const sub = {
      id: 'sub_trial',
      status: 'trialing',
      cancel_at_period_end: false,
      cancel_at: 1794525668,
      trial_end: 1794525668,
      items: { data: [{ price: { id: 'price_starter', lookup_key: 'mia_trainer_starter_monthly_v2' }, current_period_end: 1794525668 }] },
    } as unknown as Stripe.Subscription

    await syncSubscriptionFromStripe('cus_trial', sub)

    expect(mockUpdate.mock.calls[0][0].data).toMatchObject({ status: 'TRIALING', cancelAtPeriodEnd: true })
  })
})
