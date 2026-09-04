import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/current-user', () => ({ requireSuperAdmin: vi.fn() }))
vi.mock('@/lib/services/program.service', () => ({
  assignGlobalProgramOrganizations: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    program: { create: vi.fn() },
  },
}))
vi.mock('@/lib/services/ai.service', () => ({ generateProgram: vi.fn() }))
vi.mock('@/lib/services/program-categorization.service', () => ({
  categorizeGeneratedProgram: vi.fn().mockResolvedValue({
    bodyAreas: [], goals: [], activities: [], level: null, tags: [],
  }),
  buildCategorizationContextFromParams: vi.fn().mockReturnValue({}),
}))

import { requireSuperAdmin } from '@/lib/current-user'
import * as programService from '@/lib/services/program.service'
import { revalidatePath } from 'next/cache'
import { generateProgram } from '@/lib/services/ai.service'
import { prisma } from '@/lib/prisma'
import {
  assignGlobalProgramOrganizationsAction,
  generateGlobalProgramAction,
} from '../global-program-actions'

const mockRequireSuperAdmin = vi.mocked(requireSuperAdmin)
const mockAssign = vi.mocked(programService.assignGlobalProgramOrganizations)
const mockGenerateProgram = vi.mocked(generateProgram)
const mockProgramCreate = vi.mocked(prisma.program.create)

beforeEach(() => {
  vi.clearAllMocks()
  mockRequireSuperAdmin.mockResolvedValue({ id: 'admin_1' } as any)
})

describe('assignGlobalProgramOrganizationsAction', () => {
  it('checks super admin, assigns organizations, and revalidates', async () => {
    mockAssign.mockResolvedValue({ id: 'prog_1' } as any)

    const result = await assignGlobalProgramOrganizationsAction('prog_1', ['org_1', 'org_2'])

    expect(mockRequireSuperAdmin).toHaveBeenCalled()
    expect(mockAssign).toHaveBeenCalledWith('prog_1', ['org_1', 'org_2'])
    expect(revalidatePath).toHaveBeenCalledWith('/admin/global-programs')
    expect(result).toEqual({ success: true })
  })

  it('returns a generic error when the service call throws', async () => {
    mockAssign.mockRejectedValue(new Error('db down'))

    const result = await assignGlobalProgramOrganizationsAction('prog_1', ['org_1'])

    expect(result).toEqual({ success: false, error: 'Failed to assign program to clinics' })
  })
})

describe('generateGlobalProgramAction', () => {
  it('writes organizationIds from params onto the created program', async () => {
    mockGenerateProgram.mockResolvedValue({
      name: 'AI Program',
      description: 'Generated',
      workouts: [],
    } as any)
    mockProgramCreate.mockResolvedValue({ id: 'prog_ai_1' } as any)

    const result = await generateGlobalProgramAction({
      organizationIds: ['org_1'],
    } as any)

    expect(mockProgramCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isGlobal: true,
          organizationIds: ['org_1'],
        }),
      })
    )
    expect(result).toEqual({ success: true, data: 'prog_ai_1' })
  })

  it('defaults organizationIds to an empty array when omitted from params', async () => {
    mockGenerateProgram.mockResolvedValue({
      name: 'AI Program',
      description: 'Generated',
      workouts: [],
    } as any)
    mockProgramCreate.mockResolvedValue({ id: 'prog_ai_2' } as any)

    await generateGlobalProgramAction({} as any)

    expect(mockProgramCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ organizationIds: [] }),
      })
    )
  })
})
