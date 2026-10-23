import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

const fake = vi.hoisted(() => ({ db: null as null | import('@/lib/payments/__tests__/fake-db').FakeDb }))
const stripeMocks = vi.hoisted(() => ({
  accountsCreate: vi.fn(),
  accountsRetrieve: vi.fn(),
  accountLinksCreate: vi.fn(),
  oauthToken: vi.fn(),
  oauthAuthorizeUrl: vi.fn(),
  oauthDeauthorize: vi.fn(),
}))
const caps = vi.hoisted(() => ({ billing: 'trainer' as 'trainer' | 'member' }))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', async () => {
  const { createFakeDb } = await import('@/lib/payments/__tests__/fake-db')
  fake.db = createFakeDb()
  return { prisma: fake.db.prisma }
})
vi.mock('@/lib/stripe', () => ({
  stripe: {
    accounts: { create: stripeMocks.accountsCreate, retrieve: stripeMocks.accountsRetrieve },
    accountLinks: { create: stripeMocks.accountLinksCreate },
    oauth: {
      token: stripeMocks.oauthToken,
      authorizeUrl: stripeMocks.oauthAuthorizeUrl,
      deauthorize: stripeMocks.oauthDeauthorize,
    },
  },
}))
vi.mock('@/lib/org-capabilities.server', () => ({
  getCapabilitiesForUser: vi.fn(async () => ({ billing: caps.billing })),
}))
vi.mock('@/lib/services/audit-log.service', () => ({ logUserAudit: vi.fn() }))
vi.mock('@/lib/services/notification.service', () => ({ notifyUser: vi.fn() }))
vi.mock('@/lib/services/program.service', () => ({ duplicateProgram: vi.fn(), assignProgram: vi.fn(), assignOnDemandProgram: vi.fn() }))

import {
  completeConnectOAuth,
  deriveConnectStatus,
  disconnectConnectedAccount,
  getConnectOAuthUrl,
  handleAccountDeauthorized,
  isKnownConnectAccount,
  startConnectOnboarding,
  syncConnectedAccountFromStripe,
} from '../connected-account.service'
import { signConnectOAuthState } from '@/lib/payments/connect-oauth-state'
import { logUserAudit } from '@/lib/services/audit-log.service'

const db = () => fake.db!
const TRAINER = {
  id: 'a'.repeat(24),
  role: 'TRAINER' as const,
  clerkOrgId: 'org_1',
  email: 'coach@test.com',
  firstName: 'Casey',
  lastName: 'Coach',
}

function stripeAccount(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    charges_enabled: false,
    payouts_enabled: false,
    details_submitted: false,
    country: 'US',
    default_currency: 'usd',
    ...extra,
  }
}

beforeAll(() => {
  process.env.CLERK_SECRET_KEY = 'sk_test_' + 'x'.repeat(40)
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.test'
})

beforeEach(() => {
  vi.clearAllMocks()
  db().reset()
  caps.billing = 'trainer'
  delete process.env.STRIPE_CONNECT_CLIENT_ID
  stripeMocks.accountLinksCreate.mockResolvedValue({ url: 'https://connect.stripe.com/setup/abc' })
})

describe('startConnectOnboarding', () => {
  it('creates a Stripe-owned-liability account with the full dashboard and returns an onboarding link', async () => {
    stripeMocks.accountsCreate.mockResolvedValue(stripeAccount('acct_new'))

    const url = await startConnectOnboarding(TRAINER)

    expect(url).toBe('https://connect.stripe.com/setup/abc')
    expect(stripeMocks.accountsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'coach@test.com',
        controller: {
          stripe_dashboard: { type: 'full' },
          fees: { payer: 'account' },
          losses: { payments: 'stripe' },
          requirement_collection: 'stripe',
        },
      })
    )
    expect(stripeMocks.accountLinksCreate).toHaveBeenCalledWith({
      account: 'acct_new',
      type: 'account_onboarding',
      refresh_url: 'https://app.test/payments/onboarding',
      return_url: 'https://app.test/payments?onboarding=return',
    })
    expect(db().tables.connectedAccount).toEqual([
      expect.objectContaining({
        trainerId: TRAINER.id,
        stripeAccountId: 'acct_new',
        onboardingMethod: 'CREATED',
        disconnectedAt: null,
      }),
    ])
    expect(logUserAudit).toHaveBeenCalledTimes(1)
  })

  it('reuses the existing account instead of creating a second one', async () => {
    db().insert('connectedAccount', { trainerId: TRAINER.id, stripeAccountId: 'acct_1', disconnectedAt: null })

    await startConnectOnboarding(TRAINER)

    expect(stripeMocks.accountsCreate).not.toHaveBeenCalled()
    expect(stripeMocks.accountLinksCreate).toHaveBeenCalledWith(expect.objectContaining({ account: 'acct_1' }))
  })

  it('refuses club orgs server-side', async () => {
    caps.billing = 'member'
    await expect(startConnectOnboarding(TRAINER)).rejects.toMatchObject({ code: 'unavailable' })
    expect(stripeMocks.accountsCreate).not.toHaveBeenCalled()
  })

  it('refuses non-trainers', async () => {
    await expect(startConnectOnboarding({ ...TRAINER, role: 'CLIENT' as never })).rejects.toMatchObject({ code: 'forbidden' })
  })
})

describe('Connect OAuth', () => {
  it('is unavailable without STRIPE_CONNECT_CLIENT_ID', async () => {
    await expect(getConnectOAuthUrl(TRAINER)).rejects.toMatchObject({ code: 'oauth_disabled' })
  })

  it('builds the authorize URL with a signed state bound to the trainer', async () => {
    process.env.STRIPE_CONNECT_CLIENT_ID = 'ca_123'
    stripeMocks.oauthAuthorizeUrl.mockReturnValue('https://connect.stripe.com/oauth/authorize?x')

    await getConnectOAuthUrl(TRAINER)

    const params = stripeMocks.oauthAuthorizeUrl.mock.calls[0][0]
    expect(params).toMatchObject({
      client_id: 'ca_123',
      response_type: 'code',
      scope: 'read_write',
      redirect_uri: 'https://app.test/payments/oauth/callback',
    })
    expect(params.state.startsWith(`${TRAINER.id}.`)).toBe(true)
  })

  it('rejects a callback whose state belongs to another trainer', async () => {
    process.env.STRIPE_CONNECT_CLIENT_ID = 'ca_123'
    const state = signConnectOAuthState('b'.repeat(24))
    await expect(completeConnectOAuth(TRAINER, 'code_1', state)).rejects.toMatchObject({ code: 'forbidden' })
    expect(stripeMocks.oauthToken).not.toHaveBeenCalled()
  })

  it('links the returned account on a valid callback', async () => {
    process.env.STRIPE_CONNECT_CLIENT_ID = 'ca_123'
    stripeMocks.oauthToken.mockResolvedValue({ stripe_user_id: 'acct_existing' })
    stripeMocks.accountsRetrieve.mockResolvedValue(stripeAccount('acct_existing', { charges_enabled: true }))

    const row = await completeConnectOAuth(TRAINER, 'code_1', signConnectOAuthState(TRAINER.id))

    expect(stripeMocks.oauthToken).toHaveBeenCalledWith({ grant_type: 'authorization_code', code: 'code_1' })
    expect(row).toMatchObject({ stripeAccountId: 'acct_existing', onboardingMethod: 'OAUTH', chargesEnabled: true })
  })

  it('refuses an account already linked to another trainer', async () => {
    process.env.STRIPE_CONNECT_CLIENT_ID = 'ca_123'
    db().insert('connectedAccount', { trainerId: 'c'.repeat(24), stripeAccountId: 'acct_taken', disconnectedAt: null })
    stripeMocks.oauthToken.mockResolvedValue({ stripe_user_id: 'acct_taken' })
    stripeMocks.accountsRetrieve.mockResolvedValue(stripeAccount('acct_taken'))

    await expect(completeConnectOAuth(TRAINER, 'code_1', signConnectOAuthState(TRAINER.id))).rejects.toMatchObject({
      code: 'account_in_use',
    })
  })
})

describe('account sync and disconnect', () => {
  it('mirrors account.updated flags onto a known account', async () => {
    db().insert('connectedAccount', {
      trainerId: TRAINER.id, stripeAccountId: 'acct_1', chargesEnabled: false, payoutsEnabled: false,
      detailsSubmitted: false, country: null, defaultCurrency: null, disconnectedAt: null,
    })

    const row = await syncConnectedAccountFromStripe(
      stripeAccount('acct_1', { charges_enabled: true, payouts_enabled: true, details_submitted: true }) as never
    )

    expect(row).toMatchObject({ chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true })
    expect(deriveConnectStatus(row)).toBe('ACTIVE')
  })

  it('ignores unknown accounts', async () => {
    expect(await syncConnectedAccountFromStripe(stripeAccount('acct_unknown') as never)).toBeNull()
  })

  it('deauthorization disconnects the account and hides its offers, once', async () => {
    db().insert('connectedAccount', { trainerId: TRAINER.id, stripeAccountId: 'acct_1', chargesEnabled: true, disconnectedAt: null })
    db().insert('paidOffer', { trainerId: TRAINER.id, stripeAccountId: 'acct_1', isActive: true })
    db().insert('user', { ...TRAINER })

    expect(await handleAccountDeauthorized('acct_1')).toBe(true)
    expect(await handleAccountDeauthorized('acct_1')).toBe(true)

    expect(db().tables.connectedAccount[0]).toMatchObject({ chargesEnabled: false })
    expect(db().tables.connectedAccount[0].disconnectedAt).toBeInstanceOf(Date)
    expect(db().tables.paidOffer[0].isActive).toBe(false)
    expect(logUserAudit).toHaveBeenCalledTimes(1)
  })

  it('trainer disconnect revokes platform access when OAuth is configured', async () => {
    process.env.STRIPE_CONNECT_CLIENT_ID = 'ca_123'
    db().insert('connectedAccount', { trainerId: TRAINER.id, stripeAccountId: 'acct_1', chargesEnabled: true, disconnectedAt: null })
    stripeMocks.oauthDeauthorize.mockResolvedValue({ stripe_user_id: 'acct_1' })

    await disconnectConnectedAccount(TRAINER)

    expect(stripeMocks.oauthDeauthorize).toHaveBeenCalledWith({ client_id: 'ca_123', stripe_user_id: 'acct_1' })
    expect(deriveConnectStatus(db().tables.connectedAccount[0] as never)).toBe('DISCONNECTED')
  })

  it('refuses an OAuth callback that would orphan a live account', async () => {
    process.env.STRIPE_CONNECT_CLIENT_ID = 'ca_123'
    db().insert('connectedAccount', { trainerId: TRAINER.id, stripeAccountId: 'acct_live', disconnectedAt: null })
    stripeMocks.oauthToken.mockResolvedValue({ stripe_user_id: 'acct_other' })
    await expect(completeConnectOAuth(TRAINER, 'code_1', signConnectOAuthState(TRAINER.id))).rejects.toMatchObject({ code: 'invalid_state' })
    expect(db().tables.connectedAccount[0].stripeAccountId).toBe('acct_live')
  })

  it('a disconnect that revokes access ends live memberships and pauses their programs', async () => {
    process.env.STRIPE_CONNECT_CLIENT_ID = 'ca_123'
    db().insert('connectedAccount', { trainerId: TRAINER.id, stripeAccountId: 'acct_1', chargesEnabled: true, disconnectedAt: null })
    const program = db().insert('program', { status: 'ACTIVE' })
    db().insert('offerSubscription', { stripeAccountId: 'acct_1', status: 'ACTIVE', assignedProgramId: program.id })
    stripeMocks.oauthDeauthorize.mockResolvedValue({ stripe_user_id: 'acct_1' })

    await disconnectConnectedAccount(TRAINER)

    expect(db().tables.offerSubscription[0].status).toBe('CANCELED')
    expect(db().tables.program[0].status).toBe('PAUSED')
  })

  it('a disconnect that could not revoke access leaves memberships syncing', async () => {
    db().insert('connectedAccount', { trainerId: TRAINER.id, stripeAccountId: 'acct_1', chargesEnabled: true, disconnectedAt: null })
    db().insert('offerSubscription', { stripeAccountId: 'acct_1', status: 'ACTIVE', assignedProgramId: null })
    await disconnectConnectedAccount(TRAINER)
    expect(db().tables.offerSubscription[0].status).toBe('ACTIVE')
  })

  it('treats a previous account referenced by offers as known', async () => {
    db().insert('paidOffer', { trainerId: TRAINER.id, stripeAccountId: 'acct_previous', isActive: false })
    expect(await isKnownConnectAccount('acct_previous')).toBe(true)
    expect(await isKnownConnectAccount('acct_stranger')).toBe(false)
  })
})
