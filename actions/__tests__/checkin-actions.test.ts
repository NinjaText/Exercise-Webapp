import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/current-user', () => ({ requireRole: vi.fn() }))
vi.mock('@/lib/services/client.service', () => ({ getClientIdsForTrainer: vi.fn() }))
vi.mock('@/lib/services/checkin.service', () => ({ assignTemplateToClient: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { requireRole } from '@/lib/current-user'
import { getClientIdsForTrainer } from '@/lib/services/client.service'
import * as checkinService from '@/lib/services/checkin.service'
import { assignCheckInAction } from '../checkin-actions'

const mockRequireRole = vi.mocked(requireRole)
const mockGetClientIds = vi.mocked(getClientIdsForTrainer)
const mockAssignTemplate = vi.mocked(checkinService.assignTemplateToClient)

const trainer = { id: 'trainer_1' }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('assignCheckInAction', () => {
  it('allows assigning a template to a roster client', async () => {
    mockRequireRole.mockResolvedValue(trainer as never)
    mockGetClientIds.mockResolvedValue(['client_1'])
    mockAssignTemplate.mockResolvedValue({ id: 'assignment_1' } as never)

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
