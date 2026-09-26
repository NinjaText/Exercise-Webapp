import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/services/branding.service', () => ({ getOrgBranding: vi.fn() }))
vi.mock('@/lib/services/organization.service', () => ({ getOrganizationOrNull: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: vi.fn() } } }))

import { getOrgBranding } from '@/lib/services/branding.service'
import { getOrganizationOrNull } from '@/lib/services/organization.service'
import { prisma } from '@/lib/prisma'
import { DEFAULT_BRANDING } from '@/lib/branding/resolve'
import { contrast, hexToOklch, WHITE } from '@/lib/branding/color'
import {
  DEFAULT_EMAIL_BRANDING,
  emailSafeAccent,
  getClientEmailBranding,
  getEmailBranding,
  isValidReplyTo,
  templateBrand,
} from '../branding'

const OWN_LIGHT_LOGO = 'https://assets.test/branding/org_1/logo-on-light-abcd1234.png'
// Emails put the logo on the (always dark) accent bar, so the dark-surface variant.
const OWN_LOGO = 'https://assets.test/branding/org_1/logo-on-dark-abcd1234.png'

function enabledBranding(overrides: Record<string, unknown> = {}) {
  return {
    ...DEFAULT_BRANDING,
    enabled: true,
    orgId: 'org_1',
    displayName: 'Summit PT',
    primaryHex: '#0f766e',
    // Truthy sentinel: a color was set and produced tokens. Only presence is
    // read by `getEmailBranding`, never shape, so this doesn't need to be a
    // real `BrandTokens` object.
    tokens: {},
    logoOnLightUrl: OWN_LIGHT_LOGO,
    logoOnDarkUrl: OWN_LOGO,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.mocked(getOrgBranding).mockResolvedValue(DEFAULT_BRANDING as never)
  vi.mocked(getOrganizationOrNull).mockResolvedValue(null)
})

describe('getEmailBranding — defaults', () => {
  it('is exactly the current EmailLayout look when the org is null (no lookup)', async () => {
    const b = await getEmailBranding(null)

    expect(b).toEqual({
      enabled: false,
      organizationName: 'INMOTUS RX',
      accent: '#2563eb',
      fromName: 'INMOTUS RX',
    })
    expect(b.logoUrl).toBeUndefined()
    expect(b.replyTo).toBeUndefined()
    expect(getOrganizationOrNull).not.toHaveBeenCalled()
  })

  it('is the product default when the org has branding switched off', async () => {
    vi.mocked(getOrgBranding).mockResolvedValue({ ...DEFAULT_BRANDING, orgId: 'org_1' } as never)
    vi.mocked(getOrganizationOrNull).mockResolvedValue({ email: 'desk@summit.test' } as never)

    await expect(getEmailBranding('org_1')).resolves.toEqual(DEFAULT_EMAIL_BRANDING)
  })

  it('falls back to defaults (and logs) when the branding lookup throws', async () => {
    vi.mocked(getOrgBranding).mockRejectedValue(new Error('db down'))

    await expect(getEmailBranding('org_1')).resolves.toEqual(DEFAULT_EMAIL_BRANDING)
    expect(console.error).toHaveBeenCalled()
  })
})

describe('getEmailBranding — enabled', () => {
  it('uses the org display name, primary hex, logo, From name and contact email', async () => {
    vi.mocked(getOrgBranding).mockResolvedValue(enabledBranding() as never)
    vi.mocked(getOrganizationOrNull).mockResolvedValue({ email: 'desk@summit.test' } as never)

    await expect(getEmailBranding('org_1')).resolves.toEqual({
      enabled: true,
      organizationName: 'Summit PT',
      accent: '#0f766e',
      logoUrl: OWN_LOGO,
      fromName: 'Summit PT',
      replyTo: 'desk@summit.test',
    })
    expect(getOrgBranding).toHaveBeenCalledWith('org_1')
    expect(getOrganizationOrNull).toHaveBeenCalledWith('org_1')
  })

  it('omits logoUrl (name renders as text) when the org has no dark logo, even with a light one', async () => {
    vi.mocked(getOrgBranding).mockResolvedValue(enabledBranding({ logoOnDarkUrl: null }) as never)

    const b = await getEmailBranding('org_1')
    expect(b.logoUrl).toBeUndefined()
    expect('logoUrl' in b).toBe(false)
  })

  it('omits replyTo when the contact email is missing or invalid', async () => {
    vi.mocked(getOrgBranding).mockResolvedValue(enabledBranding() as never)

    for (const email of [null, '', 'not-an-email', 'a@b.test\r\nBcc: x@y.test', 'Evil <a@b.test>']) {
      vi.mocked(getOrganizationOrNull).mockResolvedValue({ email } as never)
      const b = await getEmailBranding('org_1')
      expect(b.replyTo, String(email)).toBeUndefined()
    }
  })

  it('still brands (without replyTo) when only the contact-email lookup fails', async () => {
    vi.mocked(getOrgBranding).mockResolvedValue(enabledBranding() as never)
    vi.mocked(getOrganizationOrNull).mockRejectedValue(new Error('db down'))

    const b = await getEmailBranding('org_1')
    expect(b.organizationName).toBe('Summit PT')
    expect(b.replyTo).toBeUndefined()
  })

  it('darkens a light primary so white button text stays readable', async () => {
    vi.mocked(getOrgBranding).mockResolvedValue(enabledBranding({ primaryHex: '#f59e0b' }) as never)

    const b = await getEmailBranding('org_1')
    expect(b.accent).not.toBe('#f59e0b')
    expect(contrast(hexToOklch(b.accent!), WHITE)).toBeGreaterThanOrEqual(4.5)
  })

  it('omits accent (so each template keeps its own default look) when branding is on but no color was set', async () => {
    vi.mocked(getOrgBranding).mockResolvedValue(enabledBranding({ tokens: null }) as never)

    const b = await getEmailBranding('org_1')
    expect(b.accent).toBeUndefined()
    expect('accent' in b).toBe(false)
    // Everything else about the brand (name, logo, from name) still applies.
    expect(b.organizationName).toBe('Summit PT')
    expect(b.logoUrl).toBe(OWN_LOGO)
  })
})

describe('emailSafeAccent', () => {
  it('keeps a colour that already reaches 4.5:1 against white', () => {
    expect(emailSafeAccent('#2563eb')).toBe('#2563eb')
    expect(emailSafeAccent('#0F766E')).toBe('#0f766e')
  })

  it('darkens light colours until white text reaches 4.5:1', () => {
    for (const hex of ['#f59e0b', '#fde047', '#22c55e', '#ffffff']) {
      const out = emailSafeAccent(hex)
      expect(contrast(hexToOklch(out), WHITE), `${hex} → ${out}`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('falls back to the default accent for an unparseable value', () => {
    expect(emailSafeAccent('red; background:url(x)')).toBe('#2563eb')
  })
})

describe('isValidReplyTo', () => {
  it('accepts a plain address and rejects header-bearing or malformed ones', () => {
    expect(isValidReplyTo('desk@summit.test')).toBe(true)
    expect(isValidReplyTo('a@b')).toBe(false)
    expect(isValidReplyTo('a@b.test\nBcc: x@y.test')).toBe(false)
    expect(isValidReplyTo('a@b.test, c@d.test')).toBe(false)
    expect(isValidReplyTo(`${'a'.repeat(250)}@b.test`)).toBe(false)
    expect(isValidReplyTo(null)).toBe(false)
  })
})

describe('templateBrand', () => {
  it('is undefined for unbranded orgs, so templates keep their own look', () => {
    expect(templateBrand(DEFAULT_EMAIL_BRANDING)).toBeUndefined()
  })

  it('carries only the three layout props when branded', () => {
    expect(
      templateBrand({
        enabled: true,
        organizationName: 'Summit PT',
        accent: '#0f766e',
        logoUrl: OWN_LOGO,
        fromName: 'Summit PT',
        replyTo: 'desk@summit.test',
      })
    ).toEqual({ organizationName: 'Summit PT', accent: '#0f766e', logoUrl: OWN_LOGO })
  })

  it('omits accent when the branding has none, so the template falls back to its own default', () => {
    const brand = templateBrand({
      enabled: true,
      organizationName: 'Summit PT',
      logoUrl: OWN_LOGO,
      fromName: 'Summit PT',
    })
    expect(brand?.accent).toBeUndefined()
    expect(brand && 'accent' in brand).toBe(false)
  })
})

describe('getClientEmailBranding', () => {
  it("resolves a CLIENT recipient's brand from their own clerkOrgId", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ role: 'CLIENT', clerkOrgId: 'org_1' } as never)
    vi.mocked(getOrgBranding).mockResolvedValue(enabledBranding() as never)

    const b = await getClientEmailBranding('u_client')
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'u_client' },
      select: { role: true, clerkOrgId: true },
    })
    expect(getOrgBranding).toHaveBeenCalledWith('org_1')
    expect(b?.organizationName).toBe('Summit PT')
  })

  it('returns null for a TRAINER recipient (product-branded mail)', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ role: 'TRAINER', clerkOrgId: 'org_1' } as never)

    await expect(getClientEmailBranding('u_trainer')).resolves.toBeNull()
    expect(getOrgBranding).not.toHaveBeenCalled()
  })

  it('returns null when the user is missing', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never)
    await expect(getClientEmailBranding('ghost')).resolves.toBeNull()
  })

  it('returns null (and logs) instead of throwing when the lookup fails', async () => {
    vi.mocked(prisma.user.findUnique).mockRejectedValue(new Error('db down'))

    await expect(getClientEmailBranding('u1')).resolves.toBeNull()
    expect(console.error).toHaveBeenCalled()
  })
})
