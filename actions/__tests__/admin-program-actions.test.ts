import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/current-user', () => ({ requireSuperAdmin: vi.fn() }))
vi.mock('@/lib/services/program.service', () => ({
  updateProgram: vi.fn(),
  assignProgram: vi.fn(),
  duplicateProgram: vi.fn(),
  toggleProgramPublic: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: { program: { findUnique: vi.fn() } },
}))

import { requireSuperAdmin } from '@/lib/current-user'
import * as programService from '@/lib/services/program.service'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import {
  updateAdminProgramAction,
  assignAdminProgramAction,
  unpublishAdminProgramAction,
} from '../admin-program-actions'

const mockRequireSuperAdmin = vi.mocked(requireSuperAdmin)
const mockUpdateProgram = vi.mocked(programService.updateProgram)
const mockAssignProgram = vi.mocked(programService.assignProgram)
const mockDuplicateProgram = vi.mocked(programService.duplicateProgram)
const mockToggleProgramPublic = vi.mocked(programService.toggleProgramPublic)
const mockFindUnique = vi.mocked(prisma.program.findUnique)

beforeEach(() => {
  vi.clearAllMocks()
  mockRequireSuperAdmin.mockResolvedValue({ id: 'admin_1', firstName: 'Ad', lastName: 'Min' } as any)
  mockFindUnique.mockResolvedValue({ isGlobal: false, trainerId: 'trainer_1' } as any)
})

describe('updateAdminProgramAction', () => {
  it('checks super admin, updates the program, and revalidates admin paths', async () => {
    mockUpdateProgram.mockResolvedValue({ id: 'prog_1', name: 'Updated' } as any)

    const result = await updateAdminProgramAction('prog_1', { name: 'Updated' })

    expect(mockRequireSuperAdmin).toHaveBeenCalled()
    expect(mockUpdateProgram).toHaveBeenCalledWith(
      'prog_1',
      expect.objectContaining({ name: 'Updated' })
    )
    expect(revalidatePath).toHaveBeenCalledWith('/admin/programs')
    expect(revalidatePath).toHaveBeenCalledWith('/admin/programs/prog_1')
    expect(result).toEqual({ success: true, data: { id: 'prog_1', name: 'Updated' } })
  })

  it('returns a validation error and does not call the service for an invalid daysPerWeek', async () => {
    const result = await updateAdminProgramAction('prog_1', { daysPerWeek: 0 } as any)

    expect(result.success).toBe(false)
    expect(mockUpdateProgram).not.toHaveBeenCalled()
  })

  it('returns a generic error when the service call throws', async () => {
    mockUpdateProgram.mockRejectedValue(new Error('db down'))

    const result = await updateAdminProgramAction('prog_1', { name: 'Updated' })

    expect(result).toEqual({ success: false, error: 'Failed to update program' })
  })

  it('rejects and does not call the service when the program is global', async () => {
    mockFindUnique.mockResolvedValue({ isGlobal: true } as any)

    const result = await updateAdminProgramAction('prog_1', { name: 'Updated' })

    expect(result.success).toBe(false)
    expect((result as any).error).toBeTruthy()
    expect(mockUpdateProgram).not.toHaveBeenCalled()
  })
})

describe('unpublishAdminProgramAction', () => {
  it('unmarks the program as public and returns success', async () => {
    mockFindUnique.mockResolvedValue({
      name: 'Shared Plan', isGlobal: false, isPublic: true, trainer: { clerkOrgId: 'org_9' },
    } as any)
    mockToggleProgramPublic.mockResolvedValue({} as any)

    const result = await unpublishAdminProgramAction('prog_1')

    expect(mockRequireSuperAdmin).toHaveBeenCalled()
    expect(mockToggleProgramPublic).toHaveBeenCalledWith('prog_1', false)
    expect(revalidatePath).toHaveBeenCalledWith('/admin/programs')
    expect(revalidatePath).toHaveBeenCalledWith('/admin/programs/prog_1')
    expect(result).toEqual({ success: true })
  })

  it('returns an error and does not call the service when the program is not found', async () => {
    mockFindUnique.mockResolvedValue(null)

    const result = await unpublishAdminProgramAction('prog_1')

    expect(result.success).toBe(false)
    expect(mockToggleProgramPublic).not.toHaveBeenCalled()
  })

  it('rejects and does not call the service when the program is global', async () => {
    mockFindUnique.mockResolvedValue({ isGlobal: true, isPublic: true } as any)

    const result = await unpublishAdminProgramAction('prog_1')

    expect(result.success).toBe(false)
    expect((result as any).error).toBeTruthy()
    expect(mockToggleProgramPublic).not.toHaveBeenCalled()
  })

  it('rejects and does not call the service when the program is not currently public', async () => {
    mockFindUnique.mockResolvedValue({ isGlobal: false, isPublic: false } as any)

    const result = await unpublishAdminProgramAction('prog_1')

    expect(result.success).toBe(false)
    expect(mockToggleProgramPublic).not.toHaveBeenCalled()
  })

  it('returns a generic error when the service call throws', async () => {
    mockFindUnique.mockResolvedValue({ name: 'X', isGlobal: false, isPublic: true } as any)
    mockToggleProgramPublic.mockRejectedValue(new Error('db down'))

    const result = await unpublishAdminProgramAction('prog_1')

    expect(result).toEqual({ success: false, error: 'Failed to remove program from universal' })
  })
})

describe('assignAdminProgramAction', () => {
  it('clones the source program, assigns the clone, and revalidates admin paths', async () => {
    mockDuplicateProgram.mockResolvedValue({ id: 'copy_1' } as any)
    mockAssignProgram.mockResolvedValue({ id: 'copy_1' } as any)

    const result = await assignAdminProgramAction({
      programId: 'prog_1',
      clientId: 'client_1',
      startDate: '2026-08-01T00:00:00.000Z',
    })

    expect(mockRequireSuperAdmin).toHaveBeenCalled()
    expect(mockDuplicateProgram).toHaveBeenCalledWith('prog_1', 'trainer_1', false)
    expect(mockAssignProgram).toHaveBeenCalledWith(
      'copy_1',
      'client_1',
      new Date('2026-08-01T00:00:00.000Z')
    )
    expect(revalidatePath).toHaveBeenCalledWith('/admin/programs')
    expect(revalidatePath).toHaveBeenCalledWith('/admin/programs/prog_1')
    expect(result).toEqual({ success: true, data: { id: 'copy_1' } })
  })

  it('returns a validation error and does not call the service when clientId is missing', async () => {
    const result = await assignAdminProgramAction({
      programId: 'prog_1',
      clientId: '',
      startDate: '2026-08-01T00:00:00.000Z',
    })

    expect(result.success).toBe(false)
    expect(mockAssignProgram).not.toHaveBeenCalled()
  })

  it('rejects and does not call the service when the program is global', async () => {
    mockFindUnique.mockResolvedValue({ isGlobal: true } as any)

    const result = await assignAdminProgramAction({
      programId: 'prog_1',
      clientId: 'client_1',
      startDate: '2026-08-01T00:00:00.000Z',
    })

    expect(result.success).toBe(false)
    expect((result as any).error).toBeTruthy()
    expect(mockAssignProgram).not.toHaveBeenCalled()
  })
})
