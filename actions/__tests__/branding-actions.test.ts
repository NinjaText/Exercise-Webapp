import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHash } from 'node:crypto'
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3'

const TRAINER = {
  id: 'trainer_1', role: 'TRAINER', clerkOrgId: 'org_1',
  firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com',
}

const mockAuth = vi.fn()
vi.mock('@clerk/nextjs/server', () => ({
  auth: (...args: any[]) => mockAuth(...args),
}))

const mockUserFindUnique = vi.fn()
const mockOrgUpdate = vi.fn()
const mockOrgFindUnique = vi.fn()
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: (...args: any[]) => mockUserFindUnique(...args) },
    organization: {
      update: (...args: any[]) => mockOrgUpdate(...args),
      findUnique: (...args: any[]) => mockOrgFindUnique(...args),
    },
  },
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('@/lib/services/audit-log.service', () => ({
  logAudit: vi.fn(),
  deriveActorType: vi.fn(() => 'TRAINER'),
  diffFields: (before: any, after: any, keys: string[]) => {
    const b: any = {}, a: any = {}
    let changed = false
    for (const k of keys) if (after[k] !== before[k]) { b[k] = before[k]; a[k] = after[k]; changed = true }
    return changed ? { before: b, after: a } : undefined
  },
  AUDIT_ACTIONS: { BRANDING_UPDATED: 'BRANDING_UPDATED', BRANDING_RESET: 'BRANDING_RESET' },
}))

const mockExpireBranding = vi.fn()
vi.mock('@/lib/services/branding.service', () => ({
  expireBranding: (...args: any[]) => mockExpireBranding(...args),
}))

const mockGetOrganization = vi.fn()
vi.mock('@/lib/services/organization.service', () => ({
  getOrganization: (...args: any[]) => mockGetOrganization(...args),
}))

const mockDeleteBrandAssets = vi.fn()
vi.mock('@/lib/branding/assets', () => ({
  deleteBrandAssets: (...args: any[]) => mockDeleteBrandAssets(...args),
}))

const mockSend = vi.fn()
vi.mock('@/lib/r2', () => ({
  R2_BUCKET_NAME: 'test-bucket',
  getR2Client: () => ({ send: (...args: any[]) => mockSend(...args) }),
}))

import { logAudit } from '@/lib/services/audit-log.service'
import { revalidatePath } from 'next/cache'
import {
  getBrandingSettings,
  saveBrandingSettings,
  resetBranding,
  confirmBrandAsset,
  removeBrandAsset,
} from '../branding-actions'

const mockLogAudit = vi.mocked(logAudit)
const mockRevalidatePath = vi.mocked(revalidatePath)

function orgRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'o1', clerkOrgId: 'org_1', name: 'Acme Physio',
    brandingEnabled: false, brandDisplayName: null, brandPrimaryColor: null,
    brandLogoOnLightUrl: null, brandLogoOnDarkUrl: null, brandMarkUrl: null,
    brandFaviconUrl: null, brandAppleIconUrl: null,
    brandUpdatedAt: null, brandUpdatedById: null,
    ...overrides,
  }
}

const VALID = { brandingEnabled: true, brandDisplayName: '  Acme  ', brandPrimaryColor: '#1D4ED8' }

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth.mockResolvedValue({ userId: 'clerk_1' })
  mockUserFindUnique.mockResolvedValue(TRAINER)
  mockGetOrganization.mockResolvedValue(orgRow())
  mockOrgUpdate.mockImplementation(async ({ data }: any) => orgRow(data))
  mockDeleteBrandAssets.mockResolvedValue(undefined)
})

describe('getBrandingSettings', () => {
  it('returns null when signed out', async () => {
    mockAuth.mockResolvedValue({ userId: null })
    expect(await getBrandingSettings()).toBeNull()
  })

  it('returns null when the user has no org', async () => {
    mockUserFindUnique.mockResolvedValue({ ...TRAINER, clerkOrgId: null })
    expect(await getBrandingSettings()).toBeNull()
    expect(mockGetOrganization).not.toHaveBeenCalled()
  })

  it('returns null for a CLIENT', async () => {
    mockUserFindUnique.mockResolvedValue({ ...TRAINER, role: 'CLIENT' })
    expect(await getBrandingSettings()).toBeNull()
  })

  it('maps the org row, including raw asset URLs', async () => {
    mockGetOrganization.mockResolvedValue(orgRow({
      brandingEnabled: true, brandDisplayName: 'Acme', brandPrimaryColor: '#1d4ed8',
      brandLogoOnLightUrl: 'https://legacy.example.com/logo.png',
      brandLogoOnDarkUrl: null, brandMarkUrl: 'https://cdn.example.com/mark.png',
    }))
    expect(await getBrandingSettings()).toEqual({
      brandingEnabled: true,
      brandDisplayName: 'Acme',
      brandPrimaryColor: '#1d4ed8',
      orgName: 'Acme Physio',
      assets: {
        logoOnLightUrl: 'https://legacy.example.com/logo.png',
        logoOnDarkUrl: null,
        markUrl: 'https://cdn.example.com/mark.png',
      },
    })
    expect(mockGetOrganization).toHaveBeenCalledWith('org_1')
  })

  it('returns null (and logs) when loading the org fails, so the page shows its empty state', async () => {
    const err = new Error('db down')
    mockGetOrganization.mockRejectedValue(err)
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(await getBrandingSettings()).toBeNull()
      expect(spy).toHaveBeenCalledWith(expect.any(String), err)
    } finally {
      spy.mockRestore()
    }
  })
})

describe('saveBrandingSettings', () => {
  it('rejects when signed out', async () => {
    mockAuth.mockResolvedValue({ userId: null })
    expect(await saveBrandingSettings(VALID)).toEqual({ success: false, error: 'Unauthorized' })
  })

  it('rejects a CLIENT with Forbidden', async () => {
    mockUserFindUnique.mockResolvedValue({ ...TRAINER, role: 'CLIENT' })
    expect(await saveBrandingSettings(VALID)).toEqual({ success: false, error: 'Forbidden' })
    expect(mockOrgUpdate).not.toHaveBeenCalled()
  })

  it('rejects a trainer without an org', async () => {
    mockUserFindUnique.mockResolvedValue({ ...TRAINER, clerkOrgId: null })
    expect(await saveBrandingSettings(VALID)).toEqual({ success: false, error: 'Organization not set up' })
    expect(mockOrgUpdate).not.toHaveBeenCalled()
  })

  it('rejects an invalid hex with field brandPrimaryColor', async () => {
    const result = await saveBrandingSettings({ ...VALID, brandPrimaryColor: 'blue' })
    expect(result).toMatchObject({ success: false, field: 'brandPrimaryColor' })
    expect(mockOrgUpdate).not.toHaveBeenCalled()
  })

  it('rejects an invalid display name with field brandDisplayName', async () => {
    const result = await saveBrandingSettings({ ...VALID, brandDisplayName: 'x'.repeat(61) })
    expect(result).toMatchObject({ success: false, field: 'brandDisplayName' })
    expect(mockOrgUpdate).not.toHaveBeenCalled()
  })

  it('rejects a non-object input', async () => {
    const result = await saveBrandingSettings('nope')
    expect(result.success).toBe(false)
    expect(mockOrgUpdate).not.toHaveBeenCalled()
  })

  it('rejects an out-of-guardrail color with a plain near-white error', async () => {
    const result = await saveBrandingSettings({ ...VALID, brandPrimaryColor: '#fafafa' })
    expect(result).toMatchObject({ success: false, field: 'brandPrimaryColor' })
    expect(result.success === false && result.error).toMatch(/near-white/)
    // A plain object — no error class crosses the Server Action boundary.
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype)
    expect(mockOrgUpdate).not.toHaveBeenCalled()
  })

  it('saves normalised values, expires the cache, audits and revalidates', async () => {
    mockGetOrganization.mockResolvedValue(orgRow({ brandDisplayName: 'Old' }))
    const result = await saveBrandingSettings(VALID)
    expect(result).toEqual({ success: true })

    expect(mockGetOrganization).toHaveBeenCalledWith('org_1')
    expect(mockOrgUpdate).toHaveBeenCalledWith({
      where: { clerkOrgId: 'org_1' },
      data: {
        brandingEnabled: true,
        brandDisplayName: 'Acme',
        brandPrimaryColor: '#1d4ed8',
        brandUpdatedAt: expect.any(Date),
        brandUpdatedById: 'trainer_1',
      },
    })
    expect(mockExpireBranding).toHaveBeenCalledWith('org_1')
    expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({
      actorId: 'trainer_1',
      actorType: 'TRAINER',
      action: 'BRANDING_UPDATED',
      targetType: 'Organization',
      targetId: 'org_1',
      orgId: 'org_1',
      metadata: {
        before: { brandingEnabled: false, brandDisplayName: 'Old', brandPrimaryColor: null },
        after: { brandingEnabled: true, brandDisplayName: 'Acme', brandPrimaryColor: '#1d4ed8' },
      },
    }))
    expect(mockRevalidatePath).toHaveBeenCalledWith('/settings/branding')
  })

  it('accepts null display name and color', async () => {
    const result = await saveBrandingSettings({ brandingEnabled: false, brandDisplayName: null, brandPrimaryColor: null })
    expect(result).toEqual({ success: true })
    expect(mockOrgUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ brandingEnabled: false, brandDisplayName: null, brandPrimaryColor: null }),
    }))
  })

  it('fails without auditing or expiring when the DB update fails', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockOrgUpdate.mockRejectedValue(new Error('db down'))
    const result = await saveBrandingSettings(VALID)
    expect(result).toEqual({ success: false, error: 'Failed to save branding' })
    expect(mockLogAudit).not.toHaveBeenCalled()
    expect(mockExpireBranding).not.toHaveBeenCalled()
    errSpy.mockRestore()
  })
})

describe('resetBranding', () => {
  it('rejects a CLIENT with Forbidden', async () => {
    mockUserFindUnique.mockResolvedValue({ ...TRAINER, role: 'CLIENT' })
    expect(await resetBranding()).toEqual({ success: false, error: 'Forbidden' })
    expect(mockOrgUpdate).not.toHaveBeenCalled()
    expect(mockDeleteBrandAssets).not.toHaveBeenCalled()
  })

  it('rejects a trainer without an org', async () => {
    mockUserFindUnique.mockResolvedValue({ ...TRAINER, clerkOrgId: null })
    expect(await resetBranding()).toEqual({ success: false, error: 'Organization not set up' })
  })

  it('clears every brand field, deletes assets, expires, audits and revalidates', async () => {
    const result = await resetBranding()
    expect(result).toEqual({ success: true })

    expect(mockGetOrganization).toHaveBeenCalledWith('org_1')
    expect(mockOrgUpdate).toHaveBeenCalledWith({
      where: { clerkOrgId: 'org_1' },
      data: {
        brandingEnabled: false,
        brandDisplayName: null,
        brandPrimaryColor: null,
        brandLogoOnLightUrl: null,
        brandLogoOnDarkUrl: null,
        brandMarkUrl: null,
        brandFaviconUrl: null,
        brandAppleIconUrl: null,
        brandUpdatedAt: expect.any(Date),
        brandUpdatedById: 'trainer_1',
      },
    })
    expect(mockDeleteBrandAssets).toHaveBeenCalledWith('org_1')
    expect(mockExpireBranding).toHaveBeenCalledWith('org_1')
    expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'BRANDING_RESET',
      targetType: 'Organization',
      targetId: 'org_1',
      orgId: 'org_1',
    }))
    expect(mockLogAudit.mock.calls[0][0]).not.toHaveProperty('metadata')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/settings/branding')
  })

  it('still succeeds when asset deletion fails (best-effort)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockDeleteBrandAssets.mockRejectedValue(new Error('r2 down'))
    expect(await resetBranding()).toEqual({ success: true })
    expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'BRANDING_RESET' }))
    errSpy.mockRestore()
  })

  it('fails without deleting assets or auditing when the DB update fails', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockOrgUpdate.mockRejectedValue(new Error('db down'))
    expect(await resetBranding()).toEqual({ success: false, error: 'Failed to reset branding' })
    expect(mockDeleteBrandAssets).not.toHaveBeenCalled()
    expect(mockLogAudit).not.toHaveBeenCalled()
    errSpy.mockRestore()
  })
})

// ---------------------------------------------------------------------------
// confirmBrandAsset / removeBrandAsset
// ---------------------------------------------------------------------------

const R2 = 'https://cdn.example.com'
const UUID = '123e4567-e89b-42d3-a456-426614174000'
const OTHER_UUID = '923e4567-e89b-42d3-a456-426614174999'
const PENDING = (name: string, org = 'org_1', uuid = UUID) => `branding-pending/${org}/${uuid}-${name}.png`
const CACHE_CONTROL = 'public, max-age=31536000, immutable'

const ETAGS: Record<string, string> = {
  mark: 'aaaaaaaa11111111111111111111111a',
  'favicon-32': 'bbbbbbbb22222222222222222222222b',
  'apple-180': 'cccccccc33333333333333333333333c',
  'logo-on-light': 'dddddddd44444444444444444444444d',
}

const MARK_INPUT = {
  kind: 'mark',
  pendingKey: PENDING('mark'),
  derivativeKeys: [PENDING('favicon-32'), PENDING('apple-180')],
}

/** Ordered log of R2 commands and DB writes, to assert operation order. */
let events: string[]
let heads: Record<string, any>

function nameFromKey(key: string) {
  return key.replace(/^.*\/[0-9a-f-]{36}-/, '').replace(/\.png$/, '')
}

function commands() {
  return mockSend.mock.calls.map(([c]) => c)
}

function commandsOf<T>(ctor: new (...a: any[]) => T): T[] {
  return commands().filter((c) => c instanceof ctor) as T[]
}

function deletedKeys() {
  return commandsOf(DeleteObjectCommand).map((c: any) => c.input.Key as string)
}

function describeCommand(c: any) {
  const key = c.input.Key
  return `${c.constructor.name}:${key}`
}

beforeEach(() => {
  vi.stubEnv('CLOUDFLARE_R2_PUBLIC_URL', R2)
  events = []
  heads = {}
  for (const name of Object.keys(ETAGS)) {
    heads[PENDING(name)] = { ContentLength: 1234, ContentType: 'image/png', ETag: `"${ETAGS[name]}"` }
  }
  mockSend.mockImplementation(async (command: any) => {
    events.push(describeCommand(command))
    if (command instanceof HeadObjectCommand) {
      const head = heads[command.input.Key as string]
      if (!head) {
        throw Object.assign(new Error('NotFound'), { name: 'NotFound', $metadata: { httpStatusCode: 404 } })
      }
      return head
    }
    return {}
  })
  mockOrgUpdate.mockImplementation(async ({ data }: any) => {
    events.push('db:update')
    return orgRow(data)
  })
  mockExpireBranding.mockImplementation((orgId: string) => {
    events.push(`expireBranding:${orgId}`)
  })
  // The cleanup re-read sees the snapshot from getOrganization with every
  // update applied on top — i.e. the record as it is right now.
  mockOrgFindUnique.mockImplementation(async () => {
    events.push('db:reread')
    const impl = mockGetOrganization.getMockImplementation()
    const base = impl ? await impl('org_1') : orgRow()
    const applied = mockOrgUpdate.mock.results
      .filter((r: any) => r.type === 'return')
      .map((_r: any, i: number) => mockOrgUpdate.mock.calls[i][0].data)
    return Object.assign({}, base, ...applied)
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('confirmBrandAsset — validation (no R2 calls)', () => {
  it('rejects a CLIENT', async () => {
    mockUserFindUnique.mockResolvedValue({ ...TRAINER, role: 'CLIENT' })
    expect(await confirmBrandAsset(MARK_INPUT)).toEqual({ success: false, error: 'Forbidden' })
    expect(mockSend).not.toHaveBeenCalled()
  })

  it.each([
    ['a non-object', 'nope'],
    ['an unknown kind', { ...MARK_INPUT, kind: 'banner' }],
    ['a non-string key', { ...MARK_INPUT, pendingKey: 42 }],
    ['an over-long key', { ...MARK_INPUT, pendingKey: PENDING('mark') + 'x'.repeat(300) }],
    ['too many derivative keys', { ...MARK_INPUT, derivativeKeys: Array(5).fill(PENDING('favicon-32')) }],
  ])('rejects %s', async (_label, input) => {
    const result = await confirmBrandAsset(input)
    expect(result.success).toBe(false)
    expect(mockSend).not.toHaveBeenCalled()
    expect(mockOrgUpdate).not.toHaveBeenCalled()
  })

  it("rejects another org's pending key with zero R2 calls", async () => {
    const result = await confirmBrandAsset({
      kind: 'mark',
      pendingKey: PENDING('mark', 'org_2'),
      derivativeKeys: [PENDING('favicon-32', 'org_2'), PENDING('apple-180', 'org_2')],
    })
    expect(result.success).toBe(false)
    expect(mockSend).not.toHaveBeenCalled()
    expect(mockOrgUpdate).not.toHaveBeenCalled()
    expect(mockLogAudit).not.toHaveBeenCalled()
  })

  it('rejects a derivative carrying a different uuid with zero R2 calls', async () => {
    const result = await confirmBrandAsset({
      ...MARK_INPUT,
      derivativeKeys: [PENDING('favicon-32'), PENDING('apple-180', 'org_1', OTHER_UUID)],
    })
    expect(result.success).toBe(false)
    expect(mockSend).not.toHaveBeenCalled()
    expect(mockOrgUpdate).not.toHaveBeenCalled()
  })

  it('rejects a mark without its derivatives, and a logo with derivatives', async () => {
    expect((await confirmBrandAsset({ kind: 'mark', pendingKey: PENDING('mark') })).success).toBe(false)
    expect((await confirmBrandAsset({
      kind: 'logo-on-light',
      pendingKey: PENDING('logo-on-light'),
      derivativeKeys: [PENDING('favicon-32')],
    })).success).toBe(false)
    expect(mockSend).not.toHaveBeenCalled()
  })
})

describe('confirmBrandAsset — pending object checks', () => {
  it('fails when a pending object is missing (Head 404) without copying or writing', async () => {
    delete heads[PENDING('apple-180')]
    const result = await confirmBrandAsset(MARK_INPUT)
    expect(result).toMatchObject({ success: false })
    expect(commandsOf(CopyObjectCommand)).toHaveLength(0)
    expect(mockOrgUpdate).not.toHaveBeenCalled()
    expect(mockLogAudit).not.toHaveBeenCalled()
    expect(mockExpireBranding).not.toHaveBeenCalled()
  })

  it.each([
    ['NotFound (404)', { name: 'NotFound', $metadata: { httpStatusCode: 404 } }],
    ['NoSuchKey', { name: 'NoSuchKey' }],
    ['a bare 404', { name: 'Unknown', $metadata: { httpStatusCode: 404 } }],
  ])('maps a Head %s to the expired-upload message', async (_label, shape) => {
    mockSend.mockImplementation(async () => { throw Object.assign(new Error('x'), shape) })
    expect(await confirmBrandAsset(MARK_INPUT)).toEqual({
      success: false,
      error: 'That upload has expired. Please upload the image again.',
    })
  })

  it('maps any other Head error to a generic retry message', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockSend.mockImplementation(async () => {
      throw Object.assign(new Error('boom'), { name: 'InternalError', $metadata: { httpStatusCode: 500 } })
    })
    expect(await confirmBrandAsset(MARK_INPUT)).toEqual({
      success: false,
      error: "Couldn't verify the upload. Please try again.",
    })
    expect(commandsOf(CopyObjectCommand)).toHaveLength(0)
    expect(mockOrgUpdate).not.toHaveBeenCalled()
    errSpy.mockRestore()
  })

  it('fails when a pending object is over the size limit', async () => {
    heads[PENDING('mark')].ContentLength = 2 * 1024 * 1024 + 1
    const result = await confirmBrandAsset(MARK_INPUT)
    expect(result.success).toBe(false)
    expect(commandsOf(CopyObjectCommand)).toHaveLength(0)
    expect(mockOrgUpdate).not.toHaveBeenCalled()
  })

  it('fails when a pending object is not image/png', async () => {
    heads[PENDING('favicon-32')].ContentType = 'image/svg+xml'
    const result = await confirmBrandAsset(MARK_INPUT)
    expect(result.success).toBe(false)
    expect(commandsOf(CopyObjectCommand)).toHaveLength(0)
    expect(mockOrgUpdate).not.toHaveBeenCalled()
  })
})

describe('confirmBrandAsset — happy path', () => {
  it('Head → Copy → DB update → expires → delete pending, then audits without URLs and revalidates', async () => {
    const result = await confirmBrandAsset(MARK_INPUT)

    const markUrl = `${R2}/branding/org_1/mark-aaaaaaaa.png`
    expect(result).toEqual({ success: true, url: markUrl })

    // Operation order.
    const kinds = events.map((e) => e.split(':')[0])
    const lastHead = kinds.lastIndexOf('HeadObjectCommand')
    const firstCopy = kinds.indexOf('CopyObjectCommand')
    const lastCopy = kinds.lastIndexOf('CopyObjectCommand')
    const update = events.indexOf('db:update')
    const expireEvt = events.indexOf('expireBranding:org_1')
    const firstDelete = kinds.indexOf('DeleteObjectCommand')
    expect(lastHead).toBeLessThan(firstCopy)
    expect(lastCopy).toBeLessThan(update)
    expect(update).toBeLessThan(expireEvt)
    expect(expireEvt).toBeLessThan(firstDelete)
    expect(kinds.filter((k) => k === 'HeadObjectCommand')).toHaveLength(3)
    expect(kinds.filter((k) => k === 'CopyObjectCommand')).toHaveLength(3)

    // Copies: URL-encoded bucket/key source, content-addressed final key, png + immutable.
    const copies = commandsOf(CopyObjectCommand).map((c: any) => c.input)
    expect(copies).toEqual([
      {
        Bucket: 'test-bucket',
        CopySource: `test-bucket/${PENDING('mark')}`,
        Key: 'branding/org_1/mark-aaaaaaaa.png',
        MetadataDirective: 'REPLACE',
        ContentType: 'image/png',
        CacheControl: CACHE_CONTROL,
      },
      expect.objectContaining({
        CopySource: `test-bucket/${PENDING('favicon-32')}`,
        Key: 'branding/org_1/favicon-32-bbbbbbbb.png',
      }),
      expect.objectContaining({
        CopySource: `test-bucket/${PENDING('apple-180')}`,
        Key: 'branding/org_1/apple-180-cccccccc.png',
      }),
    ])

    expect(mockOrgUpdate).toHaveBeenCalledWith({
      where: { clerkOrgId: 'org_1' },
      data: {
        brandMarkUrl: markUrl,
        brandFaviconUrl: `${R2}/branding/org_1/favicon-32-bbbbbbbb.png`,
        brandAppleIconUrl: `${R2}/branding/org_1/apple-180-cccccccc.png`,
        brandUpdatedAt: expect.any(Date),
        brandUpdatedById: 'trainer_1',
      },
    })

    // Pending objects deleted after the DB points at the finals; nothing else (no previous assets).
    expect(deletedKeys().sort()).toEqual(MARK_INPUT.derivativeKeys.concat(MARK_INPUT.pendingKey).sort())

    expect(mockExpireBranding).toHaveBeenCalledWith('org_1')
    expect(mockLogAudit).toHaveBeenCalledTimes(1)
    const audit = mockLogAudit.mock.calls[0][0] as any
    expect(audit).toMatchObject({
      action: 'BRANDING_UPDATED',
      targetType: 'Organization',
      targetId: 'org_1',
      orgId: 'org_1',
      metadata: { assets: ['mark'] },
    })
    expect(audit.metadata).toEqual({ assets: ['mark'] })
    expect(JSON.stringify(audit)).not.toMatch(/https?:|branding\//)
    expect(mockRevalidatePath).toHaveBeenCalledWith('/settings/branding')
  })

  it('confirms a logo with no derivatives, touching only its field', async () => {
    const result = await confirmBrandAsset({ kind: 'logo-on-light', pendingKey: PENDING('logo-on-light') })
    expect(result).toEqual({ success: true, url: `${R2}/branding/org_1/logo-on-light-dddddddd.png` })
    expect(commandsOf(CopyObjectCommand)).toHaveLength(1)
    expect(mockOrgUpdate).toHaveBeenCalledWith({
      where: { clerkOrgId: 'org_1' },
      data: {
        brandLogoOnLightUrl: `${R2}/branding/org_1/logo-on-light-dddddddd.png`,
        brandUpdatedAt: expect.any(Date),
        brandUpdatedById: 'trainer_1',
      },
    })
    expect(mockLogAudit.mock.calls[0][0]).toMatchObject({ metadata: { assets: ['logo-on-light'] } })
  })

  it("deletes the previous own final objects for that kind, after the DB update, but not legacy or unchanged URLs", async () => {
    mockGetOrganization.mockResolvedValue(orgRow({
      brandMarkUrl: `${R2}/branding/org_1/mark-00000000.png`,
      brandFaviconUrl: 'https://legacy.example.com/favicon.png',
      // Re-confirming identical bytes: same content-addressed key must survive.
      brandAppleIconUrl: `${R2}/branding/org_1/apple-180-cccccccc.png`,
      // Another kind's asset is never touched.
      brandLogoOnLightUrl: `${R2}/branding/org_1/logo-on-light-11111111.png`,
    }))
    await confirmBrandAsset(MARK_INPUT)

    const deleted = deletedKeys()
    expect(deleted).toContain('branding/org_1/mark-00000000.png')
    expect(deleted).not.toContain('branding/org_1/apple-180-cccccccc.png')
    expect(deleted).not.toContain('branding/org_1/logo-on-light-11111111.png')
    expect(deleted.some((k) => k.includes('legacy'))).toBe(false)
    expect(events.indexOf('DeleteObjectCommand:branding/org_1/mark-00000000.png'))
      .toBeGreaterThan(events.indexOf('db:update'))
  })

  it("never deletes another org's object referenced by a URL on the record", async () => {
    mockGetOrganization.mockResolvedValue(orgRow({ brandMarkUrl: `${R2}/branding/org_2/mark-00000000.png` }))
    await confirmBrandAsset(MARK_INPUT)
    expect(deletedKeys().some((k) => k.includes('org_2'))).toBe(false)
  })

  it('hashes a GetObject body with sha256 when the ETag is not a single-part MD5', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4])
    const sha8 = createHash('sha256').update(bytes).digest('hex').slice(0, 8)
    heads[PENDING('logo-on-light')].ETag = '"d41d8cd98f00b204e9800998ecf8427e-2"'
    mockSend.mockImplementation(async (command: any) => {
      if (command instanceof HeadObjectCommand) return heads[command.input.Key as string]
      if (command instanceof GetObjectCommand) {
        return { Body: { transformToByteArray: async () => bytes } }
      }
      return {}
    })
    const result = await confirmBrandAsset({ kind: 'logo-on-light', pendingKey: PENDING('logo-on-light') })
    expect(result).toEqual({ success: true, url: `${R2}/branding/org_1/logo-on-light-${sha8}.png` })
    expect(commandsOf(GetObjectCommand).map((c: any) => c.input.Key)).toEqual([PENDING('logo-on-light')])
  })

  it('still succeeds when deleting pending or previous objects fails (best-effort)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGetOrganization.mockResolvedValue(orgRow({ brandMarkUrl: `${R2}/branding/org_1/mark-00000000.png` }))
    const base = mockSend.getMockImplementation()!
    mockSend.mockImplementation(async (command: any) => {
      if (command instanceof DeleteObjectCommand) throw new Error('r2 down')
      return base(command)
    })
    const result = await confirmBrandAsset(MARK_INPUT)
    expect(result.success).toBe(true)
    expect(mockLogAudit).toHaveBeenCalled()
    expect(mockExpireBranding).toHaveBeenCalledWith('org_1')
    errSpy.mockRestore()
  })
})

describe('confirmBrandAsset — failures after validation', () => {
  it('writes nothing to the DB and deletes nothing when a Copy fails', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGetOrganization.mockResolvedValue(orgRow({ brandMarkUrl: `${R2}/branding/org_1/mark-aaaaaaaa.png` }))
    const base = mockSend.getMockImplementation()!
    mockSend.mockImplementation(async (command: any) => {
      if (command instanceof CopyObjectCommand && command.input.Key?.includes('apple-180')) {
        throw new Error('copy failed: secret')
      }
      return base(command)
    })
    const result = await confirmBrandAsset(MARK_INPUT)
    expect(result.success).toBe(false)
    expect(JSON.stringify(result)).not.toContain('secret')
    expect(mockOrgUpdate).not.toHaveBeenCalled()
    expect(mockLogAudit).not.toHaveBeenCalled()
    expect(mockExpireBranding).not.toHaveBeenCalled()
    // No rollback: finals are orphans at worst; pending objects stay for a retry.
    expect(commandsOf(DeleteObjectCommand)).toHaveLength(0)
    warnSpy.mockRestore()
    errSpy.mockRestore()
  })

  it('deletes nothing when the DB update fails (it may have committed)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockOrgUpdate.mockRejectedValue(new Error('db timeout'))
    const result = await confirmBrandAsset(MARK_INPUT)
    expect(result).toEqual({ success: false, error: 'Failed to save branding' })
    expect(commandsOf(DeleteObjectCommand)).toHaveLength(0)
    expect(mockLogAudit).not.toHaveBeenCalled()
    expect(mockExpireBranding).not.toHaveBeenCalled()
    warnSpy.mockRestore()
    errSpy.mockRestore()
  })

  it("double submit: a second confirm whose Copy fails after the first committed never deletes the first's final", async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    // A: succeeds, DB → K, pending deleted.
    expect((await confirmBrandAsset(MARK_INPUT)).success).toBe(true)
    const K = 'branding/org_1/mark-aaaaaaaa.png'
    mockSend.mockClear()

    // B: stale Head results and stale `before` (no K), Copy fails NoSuchKey.
    const base = mockSend.getMockImplementation()!
    mockSend.mockImplementation(async (command: any) => {
      if (command instanceof CopyObjectCommand) {
        throw Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey', $metadata: { httpStatusCode: 404 } })
      }
      return base(command)
    })
    const b = await confirmBrandAsset(MARK_INPUT)
    expect(b.success).toBe(false)
    expect(deletedKeys()).not.toContain(K)
    expect(commandsOf(DeleteObjectCommand)).toHaveLength(0)
    warnSpy.mockRestore()
    errSpy.mockRestore()
  })

  it('skips previous-final cleanup of any key the record currently references (fresh re-read, any field)', async () => {
    mockGetOrganization.mockResolvedValue(orgRow({
      brandMarkUrl: `${R2}/branding/org_1/mark-00000000.png`,
      brandFaviconUrl: `${R2}/branding/org_1/favicon-32-11111111.png`,
    }))
    // An interleaved write re-pointed the favicon field at the old favicon
    // after our update (e.g. a concurrent confirm of identical old bytes).
    mockOrgFindUnique.mockImplementation(async () => (events.push('db:reread'), {
      brandLogoOnLightUrl: null,
      brandLogoOnDarkUrl: null,
      brandMarkUrl: `${R2}/branding/org_1/mark-aaaaaaaa.png`,
      brandFaviconUrl: `${R2}/branding/org_1/favicon-32-11111111.png`,
      brandAppleIconUrl: `${R2}/branding/org_1/apple-180-cccccccc.png`,
    }))
    expect((await confirmBrandAsset(MARK_INPUT)).success).toBe(true)
    const deleted = deletedKeys()
    expect(deleted).toContain('branding/org_1/mark-00000000.png')
    expect(deleted).not.toContain('branding/org_1/favicon-32-11111111.png')
    expect(mockOrgFindUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { clerkOrgId: 'org_1' } }))
    // Re-read happens after the update and before the previous-final delete.
    expect(events.indexOf('db:update')).toBeLessThan(events.indexOf('db:reread'))
    expect(events.indexOf('db:reread'))
      .toBeLessThan(events.indexOf('DeleteObjectCommand:branding/org_1/mark-00000000.png'))
  })

  it('skips previous-final cleanup entirely (still succeeds) when the re-read fails', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGetOrganization.mockResolvedValue(orgRow({ brandMarkUrl: `${R2}/branding/org_1/mark-00000000.png` }))
    mockOrgFindUnique.mockRejectedValue(new Error('db down'))
    expect((await confirmBrandAsset(MARK_INPUT)).success).toBe(true)
    expect(deletedKeys().every((k) => k.startsWith('branding-pending/'))).toBe(true)
    expect(mockLogAudit).toHaveBeenCalled()
    errSpy.mockRestore()
  })

  it('logs best-effort delete failures as { name, message, httpStatusCode } only', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const base = mockSend.getMockImplementation()!
    const sdkError = Object.assign(new Error('r2 down'), {
      name: 'ServiceUnavailable',
      $metadata: { httpStatusCode: 503 },
      $response: { headers: { authorization: 'secret' } },
    })
    mockSend.mockImplementation(async (command: any) => {
      if (command instanceof DeleteObjectCommand) throw sdkError
      return base(command)
    })
    expect((await confirmBrandAsset(MARK_INPUT)).success).toBe(true)
    const call = errSpy.mock.calls.find(([m]) => String(m).includes('delete'))
    expect(call).toBeDefined()
    expect(call![1]).toEqual({ error: { name: 'ServiceUnavailable', message: 'r2 down', httpStatusCode: 503 } })
    expect(JSON.stringify(errSpy.mock.calls)).not.toContain('secret')
    errSpy.mockRestore()
  })
})

describe('removeBrandAsset', () => {
  it('rejects a CLIENT and an unknown kind without touching anything', async () => {
    mockUserFindUnique.mockResolvedValue({ ...TRAINER, role: 'CLIENT' })
    expect(await removeBrandAsset({ kind: 'mark' })).toEqual({ success: false, error: 'Forbidden' })
    mockUserFindUnique.mockResolvedValue(TRAINER)
    expect((await removeBrandAsset({ kind: 'banner' })).success).toBe(false)
    expect((await removeBrandAsset(null)).success).toBe(false)
    expect(mockOrgUpdate).not.toHaveBeenCalled()
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('clears the mark and its derivatives, expires, deletes own objects after the update, audits and revalidates', async () => {
    mockGetOrganization.mockResolvedValue(orgRow({
      brandMarkUrl: `${R2}/branding/org_1/mark-00000000.png`,
      brandFaviconUrl: `${R2}/branding/org_1/favicon-32-11111111.png`,
      brandAppleIconUrl: 'https://legacy.example.com/apple.png',
    }))
    expect(await removeBrandAsset({ kind: 'mark' })).toEqual({ success: true })
    expect(mockOrgUpdate).toHaveBeenCalledWith({
      where: { clerkOrgId: 'org_1' },
      data: {
        brandMarkUrl: null,
        brandFaviconUrl: null,
        brandAppleIconUrl: null,
        brandUpdatedAt: expect.any(Date),
        brandUpdatedById: 'trainer_1',
      },
    })
    expect(deletedKeys().sort()).toEqual([
      'branding/org_1/favicon-32-11111111.png',
      'branding/org_1/mark-00000000.png',
    ])
    const updateIdx = events.indexOf('db:update')
    const expireIdx = events.indexOf('expireBranding:org_1')
    const deleteIdx = events.findIndex((e) => e.startsWith('DeleteObjectCommand'))
    expect(updateIdx).toBeLessThan(expireIdx)
    expect(expireIdx).toBeLessThan(deleteIdx)
    expect(mockExpireBranding).toHaveBeenCalledWith('org_1')
    const audit = mockLogAudit.mock.calls[0][0] as any
    expect(audit).toMatchObject({ action: 'BRANDING_UPDATED', targetId: 'org_1', orgId: 'org_1' })
    expect(audit.metadata).toEqual({ assets: ['mark'], removed: true })
    expect(mockRevalidatePath).toHaveBeenCalledWith('/settings/branding')
  })

  it('clears only the field for a logo', async () => {
    mockGetOrganization.mockResolvedValue(orgRow({ brandLogoOnDarkUrl: `${R2}/branding/org_1/logo-on-dark-22222222.png` }))
    expect(await removeBrandAsset({ kind: 'logo-on-dark' })).toEqual({ success: true })
    expect(mockOrgUpdate).toHaveBeenCalledWith({
      where: { clerkOrgId: 'org_1' },
      data: { brandLogoOnDarkUrl: null, brandUpdatedAt: expect.any(Date), brandUpdatedById: 'trainer_1' },
    })
    expect(deletedKeys()).toEqual(['branding/org_1/logo-on-dark-22222222.png'])
  })

  it('still succeeds when the object delete fails', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGetOrganization.mockResolvedValue(orgRow({ brandMarkUrl: `${R2}/branding/org_1/mark-00000000.png` }))
    mockSend.mockRejectedValue(new Error('r2 down'))
    expect(await removeBrandAsset({ kind: 'mark' })).toEqual({ success: true })
    expect(mockLogAudit).toHaveBeenCalled()
    errSpy.mockRestore()
  })

  it('fails without deleting objects or auditing when the DB update fails', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGetOrganization.mockResolvedValue(orgRow({ brandMarkUrl: `${R2}/branding/org_1/mark-00000000.png` }))
    mockOrgUpdate.mockRejectedValue(new Error('db down'))
    expect((await removeBrandAsset({ kind: 'mark' })).success).toBe(false)
    expect(mockSend).not.toHaveBeenCalled()
    expect(mockLogAudit).not.toHaveBeenCalled()
    expect(mockExpireBranding).not.toHaveBeenCalled()
    errSpy.mockRestore()
  })
})
