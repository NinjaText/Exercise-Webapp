import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/email/send', () => ({ sendEmail: vi.fn() }))
vi.mock('@/lib/email/branding', () => ({
  getEmailBranding: vi.fn(),
  templateBrand: (b: { enabled: boolean; organizationName: string; accent: string; logoUrl?: string }) =>
    b.enabled ? { organizationName: b.organizationName, accent: b.accent, logoUrl: b.logoUrl } : undefined,
}))

import { sendEmail } from '@/lib/email/send'
import { getEmailBranding } from '@/lib/email/branding'
import { sendProgramWelcomeEmail } from '../send-program-welcome'

const args = {
  to: 'buyer@example.com',
  firstName: 'Pat',
  programName: 'Golf Back Pain',
  loginUrl: 'https://app.test/p/golf/success',
  isNewAccount: true,
  clerkOrgId: 'org_jane',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(sendEmail).mockResolvedValue(true)
})

describe('sendProgramWelcomeEmail', () => {
  it("carries the selling org's brand, From name and Reply-To", async () => {
    vi.mocked(getEmailBranding).mockResolvedValue({
      enabled: true, organizationName: 'Summit PT', accent: '#0f766e',
      logoUrl: 'https://assets.test/l.png', fromName: 'Summit PT', replyTo: 'desk@summit.test',
    })

    await sendProgramWelcomeEmail(args)

    expect(getEmailBranding).toHaveBeenCalledWith('org_jane')
    const call = vi.mocked(sendEmail).mock.calls[0][0]
    expect(call.fromName).toBe('Summit PT')
    expect(call.replyTo).toBe('desk@summit.test')
    expect((call.react.props as Record<string, unknown>).brand).toEqual({
      organizationName: 'Summit PT', accent: '#0f766e', logoUrl: 'https://assets.test/l.png',
    })
  })

  it('uses the product look for an unbranded org', async () => {
    vi.mocked(getEmailBranding).mockResolvedValue({
      enabled: false, organizationName: 'INMOTUS RX', accent: '#2563eb', fromName: 'INMOTUS RX', replyTo: 'desk@summit.test',
    })

    await sendProgramWelcomeEmail(args)

    const call = vi.mocked(sendEmail).mock.calls[0][0]
    // Unbranded client mail is sent exactly as before branding existed.
    expect('fromName' in call).toBe(false)
    expect('replyTo' in call).toBe(false)
    expect((call.react.props as Record<string, unknown>).brand).toBeUndefined()
  })
})
