import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    auditLog: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import {
  logAudit,
  diffFields,
  deriveActorType,
  getAuditLogs,
  AUDIT_ACTIONS,
} from '../audit-log.service'

const mockCreate = vi.mocked(prisma.auditLog.create)
const mockFindMany = vi.mocked(prisma.auditLog.findMany)
const mockCount = vi.mocked(prisma.auditLog.count)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('logAudit', () => {
  it('writes an audit log row with the given fields', async () => {
    mockCreate.mockResolvedValue({} as never)
    await logAudit({
      actorId: 'user_1',
      actorType: 'TRAINER',
      actorName: 'Jane Doe',
      action: AUDIT_ACTIONS.PROGRAM_CREATED,
      targetType: 'Program',
      targetId: 'prog_1',
      targetLabel: 'Shoulder Rehab',
      orgId: 'org_1',
      metadata: { foo: 'bar' },
    })

    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        actorId: 'user_1',
        actorType: 'TRAINER',
        actorName: 'Jane Doe',
        action: 'PROGRAM_CREATED',
        targetType: 'Program',
        targetId: 'prog_1',
        targetLabel: 'Shoulder Rehab',
        orgId: 'org_1',
        metadata: { foo: 'bar' },
      },
    })
  })

  it('never throws when the write fails', async () => {
    mockCreate.mockRejectedValue(new Error('db down'))
    await expect(
      logAudit({ actorType: 'SYSTEM', actorName: 'System', action: 'LOGIN' })
    ).resolves.toBeUndefined()
  })
})

describe('diffFields', () => {
  it('returns only changed keys', () => {
    const before = { name: 'Old', status: 'DRAFT', unchanged: 'x' }
    const after = { name: 'New', status: 'DRAFT' }
    const diff = diffFields(before, after, ['name', 'status'])
    expect(diff).toEqual({ before: { name: 'Old' }, after: { name: 'New' } })
  })

  it('returns undefined when nothing changed', () => {
    const before = { name: 'Same' }
    const after = { name: 'Same' }
    expect(diffFields(before, after, ['name'])).toBeUndefined()
  })
})

describe('diffFields with array values', () => {
  it('does not report a change when an array is reordered but has the same members', () => {
    const before = { bodyRegion: ['CORE', 'UPPER_BODY'] }
    const after = { bodyRegion: ['UPPER_BODY', 'CORE'] }
    expect(diffFields(before, after, ['bodyRegion'])).toBeUndefined()
  })

  it('reports a change when array members actually differ', () => {
    const before = { bodyRegion: ['CORE'] }
    const after = { bodyRegion: ['CORE', 'UPPER_BODY'] }
    expect(diffFields(before, after, ['bodyRegion'])).toEqual({
      before: { bodyRegion: ['CORE'] },
      after: { bodyRegion: ['CORE', 'UPPER_BODY'] },
    })
  })

  it('still reports scalar changes as before', () => {
    const before = { name: 'Squat' }
    const after = { name: 'Squat Updated' }
    expect(diffFields(before, after, ['name'])).toEqual({
      before: { name: 'Squat' },
      after: { name: 'Squat Updated' },
    })
  })
})

describe('deriveActorType', () => {
  const originalEnv = process.env.SUPER_ADMIN_EMAILS
  afterEach(() => { process.env.SUPER_ADMIN_EMAILS = originalEnv })

  it('returns SUPER_ADMIN when email is in the allowlist', () => {
    process.env.SUPER_ADMIN_EMAILS = 'admin@example.com'
    expect(deriveActorType({ role: 'TRAINER', email: 'ADMIN@example.com' })).toBe('SUPER_ADMIN')
  })

  it('falls back to role otherwise', () => {
    process.env.SUPER_ADMIN_EMAILS = ''
    expect(deriveActorType({ role: 'TRAINER', email: 'trainer@example.com' })).toBe('TRAINER')
    expect(deriveActorType({ role: 'CLIENT', email: 'client@example.com' })).toBe('CLIENT')
  })
})

describe('getAuditLogs', () => {
  it('paginates and scopes by orgId', async () => {
    mockFindMany.mockResolvedValue([{ id: '1' }] as never)
    mockCount.mockResolvedValue(1)

    const result = await getAuditLogs({ orgId: 'org_1', page: 2, pageSize: 10 })

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { orgId: 'org_1' },
      orderBy: { createdAt: 'desc' },
      skip: 10,
      take: 10,
    })
    expect(result).toEqual({ entries: [{ id: '1' }], total: 1, page: 2, pageSize: 10, totalPages: 1 })
  })
})
