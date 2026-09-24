import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/services/notification.service', () => ({
  notifyUser: vi.fn().mockResolvedValue(undefined),
  NOTIFICATION_TYPES: { CHECK_IN_DUE: 'CHECK_IN_DUE', NEW_RESPONSE: 'NEW_RESPONSE' },
}))
vi.mock('@/lib/current-user', () => ({
  requireRole: vi.fn(),
  getCurrentUser: vi.fn(),
}))
vi.mock('@/lib/services/checkin.service', () => ({
  assignTemplateToClient: vi.fn(),
  submitCheckInResponse: vi.fn(),
}))
vi.mock('@/lib/services/client.service', () => ({ getClientIdsForTrainer: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    checkInTemplate: { findUnique: vi.fn() },
    checkInAssignment: { findUnique: vi.fn() },
  },
}))

import { notifyUser } from '@/lib/services/notification.service'
import { requireRole, getCurrentUser } from '@/lib/current-user'
import * as checkinService from '@/lib/services/checkin.service'
import { getClientIdsForTrainer } from '@/lib/services/client.service'
import { prisma } from '@/lib/prisma'
import { assignCheckInAction, submitCheckInResponseAction } from '../checkin-actions'

const mockRequireRole = vi.mocked(requireRole)
const mockGetCurrentUser = vi.mocked(getCurrentUser)
const mockAssignTemplate = vi.mocked(checkinService.assignTemplateToClient)
const mockSubmitResponse = vi.mocked(checkinService.submitCheckInResponse)
const mockGetClientIds = vi.mocked(getClientIdsForTrainer)
const mockTemplateFindUnique = vi.mocked(prisma.checkInTemplate.findUnique)
const mockAssignmentFindUnique = vi.mocked(prisma.checkInAssignment.findUnique)

beforeEach(() => {
  // resetAllMocks (not clearAllMocks) so implementations from one test never
  // leak into the next — clearAllMocks only clears call history, not
  // mockResolvedValue/mockImplementation configuration, and this file has no
  // clearMocks/mockReset default in vitest.config.ts to fall back on.
  // notifyUser's resolved value is a shared default every test relies on
  // (it's re-asserted per test only via its call args, never reconfigured),
  // so it's restored here; everything else is configured explicitly inside
  // each test below.
  vi.resetAllMocks()
  vi.mocked(notifyUser).mockResolvedValue(undefined)
})

describe('assignCheckInAction', () => {
  it('notifies the client with the template name and due date', async () => {
    mockRequireRole.mockResolvedValue({ id: 'trainer1' } as never)
    mockGetClientIds.mockResolvedValue(['c1'])
    mockAssignTemplate.mockResolvedValue({
      id: 'assignment1',
      nextDueDate: new Date('2026-10-01T00:00:00.000Z'),
    } as never)
    mockTemplateFindUnique.mockResolvedValue({ name: 'Weekly Check-In' } as never)

    await assignCheckInAction('tpl1', 'c1')

    const arg = vi.mocked(notifyUser).mock.calls[0][0]
    expect(arg.type).toBe('CHECK_IN_DUE')
    expect(arg.userId).toBe('c1')
    expect(arg.email).toMatchObject({ templateName: 'Weekly Check-In' })
  })

  it('does not notify when the client is not on the trainer roster', async () => {
    mockRequireRole.mockResolvedValue({ id: 'trainer1' } as never)
    mockGetClientIds.mockResolvedValue(['c1']) // excludes 'c9'

    const res = await assignCheckInAction('tpl1', 'c9')

    expect(res.success).toBe(false)
    expect(notifyUser).not.toHaveBeenCalled()
  })
})

describe('submitCheckInResponseAction', () => {
  it('notifies the assigning trainer', async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: 'client1',
      role: 'CLIENT',
      firstName: 'Sarah',
      lastName: 'Lee',
    } as never)
    mockSubmitResponse.mockResolvedValue({
      id: 'resp1',
      submittedAt: new Date('2026-09-22T12:00:00.000Z'),
    } as never)
    mockAssignmentFindUnique.mockResolvedValue({
      trainerId: 'trainer1',
      template: { name: 'Weekly Check-In' },
    } as never)

    await submitCheckInResponseAction('a1', { sleep: 'good' })

    const arg = vi.mocked(notifyUser).mock.calls[0][0]
    expect(arg.type).toBe('NEW_RESPONSE')
    expect(arg.userId).toBe('trainer1')
    expect(arg.email).toMatchObject({ clientName: 'Sarah Lee' })
  })

  it('does not notify when the submission failed', async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: 'client1',
      role: 'CLIENT',
      firstName: 'Sarah',
      lastName: 'Lee',
    } as never)
    // The assignment lookup now runs before the write (Fix 1), so it needs
    // an explicit result even though this test's focus is the write failure.
    mockAssignmentFindUnique.mockResolvedValue({
      trainerId: 'trainer1',
      template: { name: 'Weekly Check-In' },
    } as never)
    mockSubmitResponse.mockRejectedValue(new Error('boom'))

    await submitCheckInResponseAction('a1', { sleep: 'good' })

    expect(notifyUser).not.toHaveBeenCalled()
  })
})
