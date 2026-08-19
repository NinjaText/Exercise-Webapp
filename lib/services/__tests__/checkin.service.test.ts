import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    checkInTemplate: { findUnique: vi.fn() },
    checkInAssignment: { updateMany: vi.fn(), create: vi.fn() },
  },
}))

import { prisma } from '@/lib/prisma'
import { assignTemplateToClient } from '../checkin.service'

const mockTemplateFind = vi.mocked(prisma.checkInTemplate.findUnique)
const mockAssignmentUpdateMany = vi.mocked(prisma.checkInAssignment.updateMany)
const mockAssignmentCreate = vi.mocked(prisma.checkInAssignment.create)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('assignTemplateToClient', () => {
  it('throws when the template does not belong to the trainer', async () => {
    mockTemplateFind.mockResolvedValue({
      frequency: 'WEEKLY',
      trainerId: 'other_trainer',
    } as never)

    await expect(
      assignTemplateToClient('template_1', 'client_1', 'trainer_1')
    ).rejects.toThrow('Unauthorized')

    expect(mockAssignmentUpdateMany).not.toHaveBeenCalled()
    expect(mockAssignmentCreate).not.toHaveBeenCalled()
  })

  it('succeeds when the template belongs to the trainer', async () => {
    mockTemplateFind.mockResolvedValue({
      frequency: 'WEEKLY',
      trainerId: 'trainer_1',
    } as never)
    mockAssignmentUpdateMany.mockResolvedValue({ count: 0 } as never)
    mockAssignmentCreate.mockResolvedValue({ id: 'assignment_1' } as never)

    const result = await assignTemplateToClient('template_1', 'client_1', 'trainer_1')

    expect(result).toEqual({ id: 'assignment_1' })
    expect(mockAssignmentUpdateMany).toHaveBeenCalledWith({
      where: { templateId: 'template_1', clientId: 'client_1', isActive: true },
      data: { isActive: false },
    })
    expect(mockAssignmentCreate).toHaveBeenCalled()
  })
})
