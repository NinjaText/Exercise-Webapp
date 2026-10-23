import { describe, it, expect, beforeAll } from 'vitest'
import { OAUTH_STATE_TTL_MS, signConnectOAuthState, verifyConnectOAuthState } from '../connect-oauth-state'

const TRAINER = 'a'.repeat(24)
const OTHER = 'b'.repeat(24)

beforeAll(() => {
  process.env.CLERK_SECRET_KEY = 'sk_test_' + 'x'.repeat(40)
})

describe('Connect OAuth state', () => {
  it('verifies a fresh state for the trainer it was issued to', () => {
    const state = signConnectOAuthState(TRAINER)
    expect(verifyConnectOAuthState(state, TRAINER)).toBe(true)
  })

  it('rejects a state issued to a different trainer (CSRF / account swap)', () => {
    const state = signConnectOAuthState(OTHER)
    expect(verifyConnectOAuthState(state, TRAINER)).toBe(false)
  })

  it('rejects an expired state', () => {
    const issuedAt = Date.now() - OAUTH_STATE_TTL_MS - 1000
    const state = signConnectOAuthState(TRAINER, issuedAt)
    expect(verifyConnectOAuthState(state, TRAINER)).toBe(false)
  })

  it('rejects a tampered state', () => {
    const [id, , nonce, sig] = signConnectOAuthState(TRAINER).split('.')
    const forged = [id, String(Date.now() + 10 * OAUTH_STATE_TTL_MS), nonce, sig].join('.')
    expect(verifyConnectOAuthState(forged, TRAINER)).toBe(false)
  })

  it('rejects missing and malformed values', () => {
    expect(verifyConnectOAuthState(null, TRAINER)).toBe(false)
    expect(verifyConnectOAuthState('', TRAINER)).toBe(false)
    expect(verifyConnectOAuthState('a.b.c', TRAINER)).toBe(false)
  })

  it('issues a different state each time', () => {
    expect(signConnectOAuthState(TRAINER)).not.toBe(signConnectOAuthState(TRAINER))
  })
})
