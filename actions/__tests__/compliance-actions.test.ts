import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    workoutSessionV2: { count: vi.fn() },
    notification: { findMany: vi.fn() },
  },
}))
vi.mock('@/lib/services/notification.service', () => ({
  notifyUser: vi.fn().mockResolvedValue(undefined),
  NOTIFICATION_TYPES: { MISSED_SESSION: 'MISSED_SESSION' },
}))
vi.mock('@/lib/utils/app-url', () => ({ appBaseUrl: () => 'https://app.example.com' }))

import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { notifyUser } from '@/lib/services/notification.service'
import { checkComplianceAndNotify } from '../compliance-actions'

const mockAuth = vi.mocked(auth)
const mockTrainerFind = vi.mocked(prisma.user.findUnique)
const mockClientsFind = vi.mocked(prisma.user.findMany)
const mockSessionCount = vi.mocked(prisma.workoutSessionV2.count)
const mockNotificationFindMany = vi.mocked(prisma.notification.findMany)
const mockNotifyUser = vi.mocked(notifyUser)

const trainer = {
  id: 'trainer1',
  role: 'TRAINER',
  email: 'trainer@example.com',
  firstName: 'Tom',
  lastName: 'Trainer',
  clerkOrgId: 'org1',
}

beforeEach(() => {
  vi.clearAllMocks()
  mockNotifyUser.mockResolvedValue(undefined)
  mockAuth.mockResolvedValue({ userId: 'clerk_1' } as never)
  mockTrainerFind.mockResolvedValue(trainer as never)
  mockClientsFind.mockResolvedValue([{ id: 'client1', firstName: 'Sarah', lastName: 'Lee' }] as never)
  mockNotificationFindMany.mockResolvedValue([] as never)
})

describe('checkComplianceAndNotify', () => {
  it('notifies the trainer once per client with the missed count', async () => {
    mockSessionCount.mockResolvedValue(3 as never)

    const result = await checkComplianceAndNotify()

    expect(result).toEqual({ alerted: 1 })
    expect(notifyUser).toHaveBeenCalledTimes(1)
    const arg = vi.mocked(notifyUser).mock.calls[0][0]
    expect(arg.type).toBe('MISSED_SESSION')
    expect(arg.userId).toBe('trainer1')
    expect(arg.recipientEmail).toBe('trainer@example.com')
    expect(arg.email).toMatchObject({ clientName: 'Sarah Lee', missedCount: 3 })
  })

  it('does not throw when notifyUser rejects', async () => {
    mockSessionCount.mockResolvedValue(3 as never)
    mockNotifyUser.mockRejectedValue(new Error('boom'))

    await expect(checkComplianceAndNotify()).resolves.toMatchObject({ alerted: 0 })
  })

  it('skips clients below the missed-session threshold', async () => {
    mockSessionCount.mockResolvedValue(1 as never)

    const result = await checkComplianceAndNotify()

    expect(result).toEqual({ alerted: 0 })
    expect(notifyUser).not.toHaveBeenCalled()
  })

  it('skips a client already alerted within the dedup window', async () => {
    mockSessionCount.mockResolvedValue(3 as never)
    mockNotificationFindMany.mockResolvedValue([{ metadata: { clientId: 'client1' } }] as never)

    const result = await checkComplianceAndNotify()

    expect(result).toEqual({ alerted: 0 })
    expect(notifyUser).not.toHaveBeenCalled()
  })

  it('returns alerted: 0 without notifying when the caller is not a trainer', async () => {
    mockTrainerFind.mockResolvedValue({ ...trainer, role: 'CLIENT' } as never)

    const result = await checkComplianceAndNotify()

    expect(result).toEqual({ alerted: 0 })
    expect(notifyUser).not.toHaveBeenCalled()
  })
})
