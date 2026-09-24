import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as React from 'react'

const sendMock = vi.fn()
vi.mock('@/lib/email/resend', () => ({
  getResend: () => ({ emails: { send: sendMock } }),
}))

import { sendEmail, emailFrom } from '../send'

const el = React.createElement('div', null, 'hi')

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.RESEND_FROM_EMAIL
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('emailFrom', () => {
  it('falls back to the default sender', () => {
    expect(emailFrom()).toBe('noreply@send.goinmotus.com')
  })

  it('prefers RESEND_FROM_EMAIL', () => {
    process.env.RESEND_FROM_EMAIL = 'hello@example.com'
    expect(emailFrom()).toBe('hello@example.com')
  })
})

describe('sendEmail', () => {
  it('sends with the resolved from address and returns true', async () => {
    sendMock.mockResolvedValue({ data: { id: 'msg_1' } })

    const ok = await sendEmail({ to: 'a@example.com', subject: 'Subj', react: el })

    expect(ok).toBe(true)
    expect(sendMock).toHaveBeenCalledWith({
      from: 'noreply@send.goinmotus.com',
      to: 'a@example.com',
      subject: 'Subj',
      react: el,
    })
  })

  it('passes an array of recipients through unchanged', async () => {
    sendMock.mockResolvedValue({ data: { id: 'msg_2' } })

    await sendEmail({ to: ['a@example.com', 'b@example.com'], subject: 'S', react: el })

    expect(sendMock.mock.calls[0][0].to).toEqual(['a@example.com', 'b@example.com'])
  })

  it('returns false and does not throw when the send rejects', async () => {
    sendMock.mockRejectedValue(new Error('resend down'))

    await expect(sendEmail({ to: 'a@example.com', subject: 'S', react: el })).resolves.toBe(false)
    expect(console.error).toHaveBeenCalled()
  })

  it('returns false and does not throw when the client cannot be built', async () => {
    sendMock.mockImplementation(() => {
      throw new Error('RESEND_API_KEY environment variable is not set')
    })

    await expect(sendEmail({ to: 'a@example.com', subject: 'S', react: el })).resolves.toBe(false)
  })

  it('returns false when Resend reports an error in the response body', async () => {
    sendMock.mockResolvedValue({ data: null, error: { message: 'Domain is not verified' } })

    await expect(sendEmail({ to: 'a@example.com', subject: 'S', react: el })).resolves.toBe(false)
    expect(console.error).toHaveBeenCalled()
  })

  it('returns true when the response carries data and no error', async () => {
    sendMock.mockResolvedValue({ data: { id: 'msg_3' }, error: null })

    await expect(sendEmail({ to: 'a@example.com', subject: 'S', react: el })).resolves.toBe(true)
  })
})

describe('EMAIL_REDIRECT_TO (development safety valve)', () => {
  beforeEach(() => {
    sendMock.mockResolvedValue({ data: { id: 'msg_r' }, error: null })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.unstubAllEnvs()
    vi.stubEnv('EMAIL_REDIRECT_TO', undefined)
  })

  it('sends to the real recipient when the variable is unset', async () => {
    await sendEmail({ to: 'client@example.com', subject: 'S', react: el })

    expect(sendMock.mock.calls[0][0].to).toBe('client@example.com')
    expect(console.warn).not.toHaveBeenCalled()
  })

  it('redirects to the configured address and warns', async () => {
    vi.stubEnv('EMAIL_REDIRECT_TO', 'dev@example.com')

    await sendEmail({ to: 'a-real-client@example.com', subject: 'S', react: el })

    expect(sendMock.mock.calls[0][0].to).toBe('dev@example.com')
    expect(console.warn).toHaveBeenCalled()
  })

  it('collapses a multi-recipient send to the single redirect address', async () => {
    vi.stubEnv('EMAIL_REDIRECT_TO', 'dev@example.com')

    await sendEmail({ to: ['one@example.com', 'two@example.com'], subject: 'S', react: el })

    expect(sendMock.mock.calls[0][0].to).toBe('dev@example.com')
  })

  it('is ignored in production, so it cannot swallow customer mail', async () => {
    vi.stubEnv('EMAIL_REDIRECT_TO', 'dev@example.com')
    vi.stubEnv('NODE_ENV', 'production')

    await sendEmail({ to: 'client@example.com', subject: 'S', react: el })

    expect(sendMock.mock.calls[0][0].to).toBe('client@example.com')
  })
})

describe('List-Unsubscribe headers (RFC 8058 one-click)', () => {
  beforeEach(() => {
    sendMock.mockResolvedValue({ data: { id: 'msg_u' }, error: null })
    vi.unstubAllEnvs()
    vi.stubEnv('EMAIL_REDIRECT_TO', undefined)
  })

  it('emits both headers when an unsubscribe URL is given', async () => {
    const url = 'https://app.goinmotus.com/api/notifications/unsubscribe?token=abc&category=messages'

    await sendEmail({ to: 'a@example.com', subject: 'S', react: el, unsubscribeUrl: url })

    expect(sendMock.mock.calls[0][0].headers).toEqual({
      'List-Unsubscribe': `<${url}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    })
  })

  it('wraps the URL in angle brackets, as the RFC requires', async () => {
    await sendEmail({ to: 'a@example.com', subject: 'S', react: el, unsubscribeUrl: 'https://x.test/u' })

    expect(sendMock.mock.calls[0][0].headers['List-Unsubscribe']).toBe('<https://x.test/u>')
  })

  it('sends no headers at all for transactional mail (no URL)', async () => {
    await sendEmail({ to: 'a@example.com', subject: 'S', react: el })

    expect(sendMock.mock.calls[0][0].headers).toBeUndefined()
  })
})
