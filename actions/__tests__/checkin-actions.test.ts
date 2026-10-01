import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/org-capabilities.server', async () => {
  const { getOrgCapabilities } = await vi.importActual<typeof import('@/lib/org-capabilities')>('@/lib/org-capabilities')
  return { getCapabilitiesForUser: vi.fn(async () => getOrgCapabilities(null)), canCoachInteract: vi.fn(async () => true), filterCoachableClientIds: vi.fn(async (_t: unknown, ids: string[]) => ids) }
})
vi.mock('@/lib/current-user', () => ({ requireRole: vi.fn() }))
vi.mock('@/lib/services/client.service', () => ({ getClientIdsForTrainer: vi.fn() }))
vi.mock('@/lib/services/checkin.service', () => ({ assignTemplateToClient: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    checkInTemplate: { findUnique: vi.fn() },
  },
}))
vi.mock('@/lib/services/notification.service', () => ({
  notifyUser: vi.fn().mockResolvedValue(undefined),
  NOTIFICATION_TYPES: { CHECK_IN_DUE: 'CHECK_IN_DUE' },
}))

import { requireRole } from '@/lib/current-user'
import { getClientIdsForTrainer } from '@/lib/services/client.service'
import * as checkinService from '@/lib/services/checkin.service'
import { prisma } from '@/lib/prisma'
import { assignCheckInAction } from '../checkin-actions'
import { canCoachInteract } from '@/lib/org-capabilities.server'

const mockRequireRole = vi.mocked(requireRole)
const mockGetClientIds = vi.mocked(getClientIdsForTrainer)
const mockAssignTemplate = vi.mocked(checkinService.assignTemplateToClient)
const mockTemplateFindUnique = vi.mocked(prisma.checkInTemplate.findUnique)

const trainer = { id: 'trainer_1' }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('assignCheckInAction', () => {
  it('allows assigning a template to a roster client', async () => {
    mockRequireRole.mockResolvedValue(trainer as never)
    mockGetClientIds.mockResolvedValue(['client_1'])
    mockAssignTemplate.mockResolvedValue({
      id: 'assignment_1',
      nextDueDate: new Date('2026-10-01T00:00:00.000Z'),
    } as never)
    mockTemplateFindUnique.mockResolvedValue({ name: 'Weekly Check-In' } as never)

    const result = await assignCheckInAction('template_1', 'client_1')

    expect(result.success).toBe(true)
  })

  it('rejects assigning a template to a non-roster client', async () => {
    mockRequireRole.mockResolvedValue(trainer as never)
    mockGetClientIds.mockResolvedValue(['someone_else'])

    const result = await assignCheckInAction('template_1', 'client_1')

    expect(result.success).toBe(false)
    expect(mockAssignTemplate).not.toHaveBeenCalled()
  })
})

describe('assignCheckInAction — pair rule', () => {
  beforeEach(() => {
    mockRequireRole.mockResolvedValue({ ...trainer, role: 'TRAINER', clerkOrgId: 'org_club' } as never)
    mockGetClientIds.mockResolvedValue(['member_1'])
    mockAssignTemplate.mockResolvedValue({
      id: 'assignment_1',
      nextDueDate: new Date('2026-10-01T00:00:00.000Z'),
    } as never)
    mockTemplateFindUnique.mockResolvedValue({ name: 'Weekly Check-In' } as never)
  })

  it('refuses a club trainer → uncoached member', async () => {
    vi.mocked(canCoachInteract).mockResolvedValueOnce(false)
    expect(await assignCheckInAction('template_1', 'member_1')).toEqual({
      success: false,
      error: "Check-ins aren't available for this client.",
    })
    expect(canCoachInteract).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'trainer_1' }),
      'member_1',
      'checkIns'
    )
    expect(mockAssignTemplate).not.toHaveBeenCalled()
  })

  it('allows a club trainer → coached member', async () => {
    vi.mocked(canCoachInteract).mockResolvedValueOnce(true)
    expect((await assignCheckInAction('template_1', 'member_1')).success).toBe(true)
    expect(mockAssignTemplate).toHaveBeenCalledWith('template_1', 'member_1', 'trainer_1')
  })

  it('trainer-org trainer → roster client is unchanged (regression)', async () => {
    mockRequireRole.mockResolvedValue({ ...trainer, role: 'TRAINER', clerkOrgId: 'org_t' } as never)
    mockGetClientIds.mockResolvedValue(['client_1'])
    expect((await assignCheckInAction('template_1', 'client_1')).success).toBe(true)
    expect(canCoachInteract).toHaveBeenCalledWith(expect.objectContaining({ clerkOrgId: 'org_t' }), 'client_1', 'checkIns')
    expect(mockAssignTemplate).toHaveBeenCalledWith('template_1', 'client_1', 'trainer_1')
  })
})
