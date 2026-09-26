import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as React from 'react'

const sendMock = vi.fn()
vi.mock('@/lib/email/resend', () => ({
  getResend: () => ({ emails: { send: sendMock } }),
}))

import { sendEmail, emailFrom, formatFromHeader } from '../send'

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

describe('formatFromHeader (RFC 5322 quoted display name)', () => {
  const addr = 'noreply@send.goinmotus.com'

  it('quotes a plain name', () => {
    expect(formatFromHeader('Summit PT', addr)).toBe('"Summit PT" <noreply@send.goinmotus.com>')
  })

  it('escapes embedded quotes and backslashes', () => {
    expect(formatFromHeader('Joe "The Coach" \\ PT', addr)).toBe(
      '"Joe \\"The Coach\\" \\\\ PT" <noreply@send.goinmotus.com>'
    )
  })

  it('strips CR/LF so a name can never inject a header', () => {
    const out = formatFromHeader('Evil\r\nBcc: x@y.test', addr)
    expect(out).not.toMatch(/[\r\n]/)
    expect(out).toBe('"Evil Bcc: xy.test" <noreply@send.goinmotus.com>')
  })

  it('strips other control characters and angle brackets', () => {
    const out = formatFromHeader('A\u0000B\u0007C\u007f\u0085D E <x@y.test>', addr)
    expect(out).toBe('"ABCD E xy.test" <noreply@send.goinmotus.com>')
  })

  it('keeps emoji and other non-ASCII text', () => {
    expect(formatFromHeader('Café 💪 Fit', addr)).toBe('"Café 💪 Fit" <noreply@send.goinmotus.com>')
  })

  it('caps the display name at 64 characters without splitting an emoji', () => {
    const out = formatFromHeader(`${'a'.repeat(63)}💪💪`, addr)
    expect(out).toBe(`"${'a'.repeat(63)}💪" <noreply@send.goinmotus.com>`)
  })

  it('strips bidi, zero-width and other format characters', () => {
    const hidden = [
      '\u200b', '\u200c', '\u200d', '\u200e', '\u200f',
      '\u202a', '\u202b', '\u202c', '\u202d', '\u202e',
      '\u2060', '\u2061', '\u2062', '\u2063', '\u2064',
      '\u2066', '\u2067', '\u2068', '\u2069', '\ufeff',
    ]
    const out = formatFromHeader(`Sum${hidden.join('')}mit\u202eTP PT`, addr)
    expect(out).toBe('"SummitTP PT" <noreply@send.goinmotus.com>')
  })

  it('strips @ so the display name cannot pose as an address', () => {
    expect(formatFromHeader('support@bank.test', addr)).toBe(
      '"supportbank.test" <noreply@send.goinmotus.com>'
    )
  })

  it('falls back to the bare address when only format characters and @ are left', () => {
    expect(formatFromHeader('\u200b@\ufeff\u202e', addr)).toBe(addr)
  })

  it('uses only the address part when given a "Name <addr>" sender', () => {
    expect(formatFromHeader('Summit PT', 'INMOTUS RX <noreply@send.goinmotus.com>')).toBe(
      '"Summit PT" <noreply@send.goinmotus.com>'
    )
  })

  it('falls back to the bare address when nothing printable is left', () => {
    expect(formatFromHeader(' \r\n\t ', addr)).toBe(addr)
  })
})

describe('sendEmail — branded From and Reply-To', () => {
  beforeEach(() => {
    sendMock.mockResolvedValue({ data: { id: 'msg_b' }, error: null })
    vi.unstubAllEnvs()
    vi.stubEnv('EMAIL_REDIRECT_TO', undefined)
  })

  it('puts fromName in front of the verified address', async () => {
    await sendEmail({ to: 'a@example.com', subject: 'S', react: el, fromName: 'Summit PT' })

    expect(sendMock.mock.calls[0][0].from).toBe('"Summit PT" <noreply@send.goinmotus.com>')
  })

  it('keeps RESEND_FROM_EMAIL as the address behind the display name', async () => {
    vi.stubEnv('RESEND_FROM_EMAIL', 'hello@example.com')

    await sendEmail({ to: 'a@example.com', subject: 'S', react: el, fromName: 'Summit PT' })

    expect(sendMock.mock.calls[0][0].from).toBe('"Summit PT" <hello@example.com>')
  })

  it('extracts the bare address when RESEND_FROM_EMAIL is already "Name <addr>"', async () => {
    vi.stubEnv('RESEND_FROM_EMAIL', 'INMOTUS RX <hello@example.com>')

    await sendEmail({ to: 'a@example.com', subject: 'S', react: el, fromName: 'Summit PT' })

    expect(sendMock.mock.calls[0][0].from).toBe('"Summit PT" <hello@example.com>')
  })

  it('also handles a quoted display name in RESEND_FROM_EMAIL', async () => {
    vi.stubEnv('RESEND_FROM_EMAIL', '"INMOTUS <RX>" <hello@example.com>')

    await sendEmail({ to: 'a@example.com', subject: 'S', react: el, fromName: 'Summit PT' })

    expect(sendMock.mock.calls[0][0].from).toBe('"Summit PT" <hello@example.com>')
  })

  it('sends a named RESEND_FROM_EMAIL unchanged when there is no fromName', async () => {
    vi.stubEnv('RESEND_FROM_EMAIL', 'INMOTUS RX <hello@example.com>')

    await sendEmail({ to: 'a@example.com', subject: 'S', react: el })

    expect(sendMock.mock.calls[0][0].from).toBe('INMOTUS RX <hello@example.com>')
  })

  it('sends a bare RESEND_FROM_EMAIL unchanged when there is no fromName', async () => {
    vi.stubEnv('RESEND_FROM_EMAIL', 'hello@example.com')

    await sendEmail({ to: 'a@example.com', subject: 'S', react: el })

    expect(sendMock.mock.calls[0][0].from).toBe('hello@example.com')
  })

  it('neutralises a header-injection attempt in fromName', async () => {
    await sendEmail({ to: 'a@example.com', subject: 'S', react: el, fromName: 'Evil\r\nBcc: x@y.test' })

    const { from } = sendMock.mock.calls[0][0]
    expect(from).not.toMatch(/[\r\n]/)
    expect(from.endsWith('<noreply@send.goinmotus.com>')).toBe(true)
  })

  it('passes replyTo through', async () => {
    await sendEmail({ to: 'a@example.com', subject: 'S', react: el, replyTo: 'desk@summit.test' })

    expect(sendMock.mock.calls[0][0].replyTo).toBe('desk@summit.test')
  })

  it('drops a replyTo that is not a single plain address', async () => {
    await sendEmail({ to: 'a@example.com', subject: 'S', react: el, replyTo: 'a@b.test\r\nBcc: x@y.test' })

    expect('replyTo' in sendMock.mock.calls[0][0]).toBe(false)
  })

  it('sends neither a display name nor replyTo when not asked', async () => {
    await sendEmail({ to: 'a@example.com', subject: 'S', react: el })

    const call = sendMock.mock.calls[0][0]
    expect(call.from).toBe('noreply@send.goinmotus.com')
    expect('replyTo' in call).toBe(false)
  })

  it('keeps the unsubscribe headers alongside branding', async () => {
    await sendEmail({
      to: 'a@example.com',
      subject: 'S',
      react: el,
      fromName: 'Summit PT',
      replyTo: 'desk@summit.test',
      unsubscribeUrl: 'https://x.test/u',
    })

    expect(sendMock.mock.calls[0][0].headers['List-Unsubscribe']).toBe('<https://x.test/u>')
  })
})
