import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('svix', () => ({
  Webhook: vi.fn().mockImplementation(function () {
    return {
      verify: vi.fn((body: string) => JSON.parse(body)),
    }
  }),
}))
vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Map([
    ['svix-id', 'id'],
    ['svix-timestamp', 'ts'],
    ['svix-signature', 'sig'],
  ])),
}))
vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { deleteMany: vi.fn(), updateMany: vi.fn(), upsert: vi.fn(), findUnique: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}))
vi.mock('@/lib/services/user-deletion.service', () => ({
  deleteUserData: vi.fn(),
  findDeletionBlockers: vi.fn(),
}))

process.env.CLERK_WEBHOOK_SECRET = 'test_secret'

import { prisma } from '@/lib/prisma'
import { deleteUserData, findDeletionBlockers } from '@/lib/services/user-deletion.service'
import { POST } from '../route'

const mockFindUnique = vi.mocked(prisma.user.findUnique)
const mockAuditCreate = vi.mocked(prisma.auditLog.create)
const mockDeleteUserData = vi.mocked(deleteUserData)
const mockFindBlockers = vi.mocked(findDeletionBlockers)

beforeEach(() => {
  vi.clearAllMocks()
  mockFindBlockers.mockResolvedValue([])
})

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/webhooks/clerk', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('session webhook events', () => {
  it('logs LOGIN on session.created for a known user', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'user_1',
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      role: 'TRAINER',
      clerkOrgId: 'org_1',
    } as never)

    await POST(makeRequest({ type: 'session.created', data: { user_id: 'clerk_1' } }))

    expect(mockAuditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: 'user_1',
        actorType: 'TRAINER',
        action: 'LOGIN',
        orgId: 'org_1',
      }),
    })
  })

  it('logs LOGOUT on session.ended', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'user_1',
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      role: 'TRAINER',
      clerkOrgId: null,
    } as never)

    await POST(makeRequest({ type: 'session.ended', data: { user_id: 'clerk_1' } }))

    expect(mockAuditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'LOGOUT' }),
    })
  })

  it('does nothing when the user is not found locally', async () => {
    mockFindUnique.mockResolvedValue(null)
    await POST(makeRequest({ type: 'session.created', data: { user_id: 'unknown' } }))
    expect(mockAuditCreate).not.toHaveBeenCalled()
  })
})

describe('user.deleted webhook event', () => {
  it('routes a user.deleted event through deleteUserData', async () => {
    mockFindUnique.mockResolvedValue({ id: 'user_1' } as never)
    mockDeleteUserData.mockResolvedValue(undefined)

    const res = await POST(makeRequest({ type: 'user.deleted', data: { id: 'clerk_1' } }))

    expect(mockFindUnique).toHaveBeenCalledWith({ where: { clerkId: 'clerk_1' }, select: { id: true } })
    expect(mockDeleteUserData).toHaveBeenCalledWith('user_1')
    expect(res.status).toBe(200)
  })

  it('is a no-op when no local user matches the Clerk id', async () => {
    mockFindUnique.mockResolvedValue(null)

    const res = await POST(makeRequest({ type: 'user.deleted', data: { id: 'clerk_unknown' } }))

    expect(mockDeleteUserData).not.toHaveBeenCalled()
    expect(res.status).toBe(200)
  })

  it('returns 500 without deleting the row when cleanup fails', async () => {
    mockFindUnique.mockResolvedValue({ id: 'user_1' } as never)
    mockDeleteUserData.mockRejectedValue(new Error('db down'))

    const res = await POST(makeRequest({ type: 'user.deleted', data: { id: 'clerk_1' } }))

    expect(res.status).toBe(500)
  })

  it('checks deletion blockers before destroying anything', async () => {
    mockFindUnique.mockResolvedValue({ id: 'user_1' } as never)
    mockDeleteUserData.mockResolvedValue(undefined)

    await POST(makeRequest({ type: 'user.deleted', data: { id: 'clerk_1' } }))

    expect(mockFindBlockers).toHaveBeenCalledWith('user_1', { includeActiveClients: false })
    expect(mockFindBlockers.mock.invocationCallOrder[0]).toBeLessThan(
      mockDeleteUserData.mock.invocationCallOrder[0]
    )
  })

  // deleteUserData deletes leaf-first and only trips the restrict on the user
  // row at the end, so running it on a blocked user would destroy health data
  // and then fail. Nothing must be deleted, and a retry cannot help, so the
  // event is acked rather than redelivered forever.
  it('deletes nothing and acks with 200 when a blocker is present', async () => {
    mockFindUnique.mockResolvedValue({ id: 'user_1' } as never)
    mockFindBlockers.mockResolvedValue([
      { code: 'CLIENT_SUBSCRIPTIONS', count: 1, message: 'this client has 1 billing subscription(s) on file. Cancel them first.' },
    ])

    const res = await POST(makeRequest({ type: 'user.deleted', data: { id: 'clerk_1' } }))

    expect(mockDeleteUserData).not.toHaveBeenCalled()
    expect(res.status).toBe(200)
  })

  it('returns 500 when the blocker lookup itself fails, so Svix retries', async () => {
    mockFindUnique.mockResolvedValue({ id: 'user_1' } as never)
    mockFindBlockers.mockRejectedValue(new Error('db down'))

    const res = await POST(makeRequest({ type: 'user.deleted', data: { id: 'clerk_1' } }))

    expect(mockDeleteUserData).not.toHaveBeenCalled()
    expect(res.status).toBe(500)
  })
})
