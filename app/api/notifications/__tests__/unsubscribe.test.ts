import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/services/notification-preference.service', () => ({
  resolveUnsubToken: vi.fn(),
  updatePreference: vi.fn(),
}))

import { resolveUnsubToken, updatePreference } from '@/lib/services/notification-preference.service'
import { GET, POST } from '../unsubscribe/route'

const url = (qs: string) => `https://app.test/api/notifications/unsubscribe${qs}`

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(resolveUnsubToken).mockResolvedValue({ userId: 'u1' })
})

describe('GET — confirmation only, never mutates', () => {
  it('renders a confirm form for a valid token and category', async () => {
    const res = await GET(new Request(url('?token=tok_abc&category=messages')))
    const body = await res.text()

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/html')
    expect(body).toContain('message emails')
    expect(body).toContain('<form')
    expect(body).toContain('tok_abc')
    expect(updatePreference).not.toHaveBeenCalled()
  })

  it('never mutates, so a link prefetch is harmless', async () => {
    await GET(new Request(url('?token=tok_abc')))
    await GET(new Request(url('?token=tok_abc&category=nutrition')))

    expect(updatePreference).not.toHaveBeenCalled()
  })

  it('shows the neutral invalid page for an unknown token', async () => {
    vi.mocked(resolveUnsubToken).mockResolvedValue(null)

    const res = await GET(new Request(url('?token=nope&category=messages')))
    const body = await res.text()

    expect(body).toContain('invalid or expired')
    expect(body).not.toContain('<form')
  })

  it('reveals nothing about whether an address exists', async () => {
    vi.mocked(resolveUnsubToken).mockResolvedValue(null)

    const body = await (await GET(new Request(url('?token=nope')))).text()

    expect(body).not.toMatch(/not found|no such user|does not exist/i)
  })

  it('rejects billing on GET too', async () => {
    const body = await (await GET(new Request(url('?token=tok_abc&category=billing')))).text()

    expect(body).toContain('invalid or expired')
    expect(body).not.toContain('<form')
  })

  it('escapes a token containing HTML metacharacters so it cannot break out of the form action attribute', async () => {
    const body = await (await GET(new Request(url('?token=' + encodeURIComponent('tok"><script>'))))).text()

    expect(body).not.toContain('"><script>')
  })
})

describe('POST — applies the change', () => {
  const post = (qs: string) => POST(new Request(url(qs), { method: 'POST' }))

  it('mutes one category', async () => {
    const body = await (await post('?token=tok_abc&category=messages')).text()

    expect(updatePreference).toHaveBeenCalledWith('u1', { messages: false })
    expect(body).toContain('unsubscribed from message emails')
    expect(body).toContain('still see these in the app')
  })

  it('mutes all email when no category is given', async () => {
    await post('?token=tok_abc')

    expect(updatePreference).toHaveBeenCalledWith('u1', { emailEnabled: false })
  })

  it('accepts sessions and nutrition', async () => {
    await post('?token=tok_abc&category=sessions')
    await post('?token=tok_abc&category=nutrition')

    expect(updatePreference).toHaveBeenNthCalledWith(1, 'u1', { sessions: false })
    expect(updatePreference).toHaveBeenNthCalledWith(2, 'u1', { nutrition: false })
  })

  it('rejects billing, which carries no unsubscribe link', async () => {
    const body = await (await post('?token=tok_abc&category=billing')).text()

    expect(updatePreference).not.toHaveBeenCalled()
    expect(body).toContain('invalid or expired')
  })

  it('rejects an unknown category', async () => {
    await post('?token=tok_abc&category=haircuts')

    expect(updatePreference).not.toHaveBeenCalled()
  })

  it('writes nothing for an unknown token', async () => {
    vi.mocked(resolveUnsubToken).mockResolvedValue(null)

    await post('?token=nope&category=messages')

    expect(updatePreference).not.toHaveBeenCalled()
  })

  it('links back to the settings page', async () => {
    const body = await (await post('?token=tok_abc&category=messages')).text()

    expect(body).toContain('/settings/notifications')
  })
})
