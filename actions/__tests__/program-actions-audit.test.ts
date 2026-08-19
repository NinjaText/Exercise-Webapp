import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn().mockResolvedValue({ userId: 'clerk_1' }) }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    program: { findUnique: vi.fn() },
    exercise: { findMany: vi.fn() },
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/services/ai.service', () => ({ generateProgram: vi.fn() }))
vi.mock('@/lib/services/program-brief.service', () => ({
  extractProgramBriefText: vi.fn(),
  extractBriefMetadata: vi.fn(),
  parseProgramBrief: vi.fn(),
}))
vi.mock('@/lib/services/program.service', () => ({
  createProgram: vi.fn().mockResolvedValue({ id: 'prog_1', name: 'New Program' }),
  updateProgram: vi.fn().mockResolvedValue({ id: 'prog_1', name: 'Updated', status: 'ACTIVE' }),
  deleteProgram: vi.fn().mockResolvedValue({}),
  hardDeleteProgram: vi.fn().mockResolvedValue({}),
  deleteClientProgram: vi.fn().mockResolvedValue({}),
  duplicateProgram: vi.fn(),
  assignProgram: vi.fn(),
  toggleProgramPublic: vi.fn().mockResolvedValue({}),
}))
vi.mock('@/lib/services/client.service', () => ({ getClientIdsForTrainer: vi.fn() }))
vi.mock('@/lib/services/audit-log.service', () => ({
  logAudit: vi.fn(),
  diffFields: (before: any, after: any, keys: string[]) => {
    const b: any = {}, a: any = {}
    let changed = false
    for (const k of keys) if (k in after && after[k] !== before[k]) { b[k] = before[k]; a[k] = after[k]; changed = true }
    return changed ? { before: b, after: a } : undefined
  },
  deriveActorType: vi.fn(() => 'TRAINER'),
  AUDIT_ACTIONS: {
    PROGRAM_CREATED: 'PROGRAM_CREATED',
    PROGRAM_UPDATED: 'PROGRAM_UPDATED',
    PROGRAM_DELETED: 'PROGRAM_DELETED',
    PROGRAM_HARD_DELETED: 'PROGRAM_HARD_DELETED',
  },
}))

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { logAudit } from '@/lib/services/audit-log.service'
import { getClientIdsForTrainer } from '@/lib/services/client.service'
import * as programService from '@/lib/services/program.service'
import {
  createProgramAction,
  updateProgramAction,
  deleteProgramAction,
  hardDeleteProgramAction,
  assignProgramAction,
  deleteClientProgramAction,
  toggleProgramPublicAction,
  generateProgramAction,
  saveGeneratedProgramAction,
} from '../program-actions'

const mockUserFindUnique = vi.mocked(prisma.user.findUnique)
const mockProgramFindUnique = vi.mocked(prisma.program.findUnique)
const mockLogAudit = vi.mocked(logAudit)
const mockGetClientIds = vi.mocked(getClientIdsForTrainer)
const mockDeleteProgram = vi.mocked(programService.deleteProgram)
const mockHardDeleteProgram = vi.mocked(programService.hardDeleteProgram)
const mockDuplicateProgram = vi.mocked(programService.duplicateProgram)
const mockAssignProgram = vi.mocked(programService.assignProgram)
const mockDeleteClientProgram = vi.mocked(programService.deleteClientProgram)
const mockToggleProgramPublic = vi.mocked(programService.toggleProgramPublic)

const trainer = { id: 'trainer_1', role: 'TRAINER', clerkOrgId: 'org_1', firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' }

beforeEach(() => {
  vi.clearAllMocks()
  mockUserFindUnique.mockResolvedValue(trainer as never)
})

it('logs PROGRAM_CREATED', async () => {
  const result = await createProgramAction({ name: 'New Program' } as never)
  expect(result.success).toBe(true)
  expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({
    action: 'PROGRAM_CREATED', targetType: 'Program', targetId: 'prog_1', orgId: 'org_1',
  }))
})

it('logs PROGRAM_UPDATED with a diff', async () => {
  mockProgramFindUnique.mockResolvedValue({ trainerId: 'trainer_1', name: 'Old', status: 'DRAFT' } as never)
  await updateProgramAction('prog_1', { name: 'Updated' } as never)
  const call = mockLogAudit.mock.calls[0][0]
  expect(call.action).toBe('PROGRAM_UPDATED')
  expect(call.metadata).toEqual({ before: { name: 'Old' }, after: { name: 'Updated' } })
})

it('logs PROGRAM_DELETED with the pre-fetched name, after the delete succeeds', async () => {
  mockProgramFindUnique.mockResolvedValue({ trainerId: 'trainer_1', name: 'Old' } as never)
  const result = await deleteProgramAction('prog_1')

  expect(result).toEqual({ success: true })
  expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({
    action: 'PROGRAM_DELETED', targetLabel: 'Old',
  }))
  // The delete must actually succeed before the audit row is written, so a
  // failed delete never produces a false "deleted" audit entry.
  expect(mockDeleteProgram.mock.invocationCallOrder[0]).toBeLessThan(
    mockLogAudit.mock.invocationCallOrder[0]
  )
})

it('does not log PROGRAM_DELETED when the delete itself fails', async () => {
  mockProgramFindUnique.mockResolvedValue({ trainerId: 'trainer_1', name: 'Old' } as never)
  mockDeleteProgram.mockRejectedValueOnce(new Error('db error'))

  const result = await deleteProgramAction('prog_1')

  expect(result).toEqual({ success: false, error: 'Failed to delete program' })
  expect(mockLogAudit).not.toHaveBeenCalled()
})

it('logs PROGRAM_HARD_DELETED with the pre-fetched name, after the delete succeeds', async () => {
  mockProgramFindUnique.mockResolvedValue({ trainerId: 'trainer_1', name: 'Old' } as never)
  const result = await hardDeleteProgramAction('prog_1')

  expect(result).toEqual({ success: true })
  expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({
    action: 'PROGRAM_HARD_DELETED', targetLabel: 'Old',
  }))
  expect(mockHardDeleteProgram.mock.invocationCallOrder[0]).toBeLessThan(
    mockLogAudit.mock.invocationCallOrder[0]
  )
})

it('does not log PROGRAM_HARD_DELETED when the delete itself fails', async () => {
  mockProgramFindUnique.mockResolvedValue({ trainerId: 'trainer_1', name: 'Old' } as never)
  mockHardDeleteProgram.mockRejectedValueOnce(new Error('db error'))

  const result = await hardDeleteProgramAction('prog_1')

  expect(result).toEqual({ success: false, error: 'Failed to permanently delete program' })
  expect(mockLogAudit).not.toHaveBeenCalled()
})

it('surfaces the specific guard message when hard delete is blocked', async () => {
  mockProgramFindUnique.mockResolvedValue({ trainerId: 'trainer_1', name: 'Old' } as never)
  mockHardDeleteProgram.mockRejectedValueOnce(
    new Error('Cannot delete: this program is linked to a sellable package')
  )

  const result = await hardDeleteProgramAction('prog_1')

  expect(result).toEqual({
    success: false,
    error: 'Cannot delete: this program is linked to a sellable package',
  })
  expect(mockLogAudit).not.toHaveBeenCalled()
})

describe('assignProgramAction', () => {
  it('clones the source program and assigns the clone, never the original', async () => {
    mockProgramFindUnique.mockResolvedValue({ trainerId: 'trainer_1' } as never)
    mockGetClientIds.mockResolvedValue(['client_1'])
    mockDuplicateProgram.mockResolvedValue({ id: 'copy_1' } as never)
    mockAssignProgram.mockResolvedValue({ id: 'copy_1' } as never)

    const result = await assignProgramAction({
      programId: 'template_1',
      clientId: 'client_1',
      startDate: '2026-08-01T00:00:00.000Z',
    })

    expect(mockDuplicateProgram).toHaveBeenCalledWith('template_1', 'trainer_1', false)
    expect(mockAssignProgram).toHaveBeenCalledWith(
      'copy_1',
      'client_1',
      new Date('2026-08-01T00:00:00.000Z')
    )
    expect(result).toEqual({ success: true, data: { id: 'copy_1' } })
  })

  it('rejects when the requesting trainer does not own the program', async () => {
    mockProgramFindUnique.mockResolvedValue({ trainerId: 'someone_else' } as never)

    const result = await assignProgramAction({
      programId: 'template_1',
      clientId: 'client_1',
      startDate: '2026-08-01T00:00:00.000Z',
    })

    expect(result).toEqual({ success: false, error: 'Forbidden' })
    expect(mockDuplicateProgram).not.toHaveBeenCalled()
    expect(mockAssignProgram).not.toHaveBeenCalled()
  })

  it('rejects when the client is not in the trainer\'s roster', async () => {
    mockProgramFindUnique.mockResolvedValue({ trainerId: 'trainer_1' } as never)
    mockGetClientIds.mockResolvedValue(['someone_else'])

    const result = await assignProgramAction({
      programId: 'template_1',
      clientId: 'client_1',
      startDate: '2026-08-01T00:00:00.000Z',
    })

    expect(result).toEqual({ success: false, error: 'Forbidden' })
    expect(mockDuplicateProgram).not.toHaveBeenCalled()
    expect(mockAssignProgram).not.toHaveBeenCalled()
  })
})

describe('deleteClientProgramAction', () => {
  it('deletes an assigned program, logs the audit, and revalidates the client page', async () => {
    mockProgramFindUnique.mockResolvedValue({
      trainerId: 'trainer_1',
      name: 'Old',
      clientId: 'client_1',
    } as never)

    const result = await deleteClientProgramAction('prog_1')

    expect(mockDeleteClientProgram).toHaveBeenCalledWith('prog_1')
    expect(result).toEqual({ success: true })
    expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'PROGRAM_HARD_DELETED', targetLabel: 'Old',
    }))
    expect(revalidatePath).toHaveBeenCalledWith('/clients/client_1')
  })

  it('rejects when the requesting trainer does not own the program', async () => {
    mockProgramFindUnique.mockResolvedValue({
      trainerId: 'someone_else',
      name: 'Old',
      clientId: 'client_1',
    } as never)

    const result = await deleteClientProgramAction('prog_1')

    expect(result).toEqual({ success: false, error: 'Forbidden' })
    expect(mockDeleteClientProgram).not.toHaveBeenCalled()
  })

  it('rejects when the program has no client attached', async () => {
    mockProgramFindUnique.mockResolvedValue({
      trainerId: 'trainer_1',
      name: 'Old',
      clientId: null,
    } as never)

    const result = await deleteClientProgramAction('prog_1')

    expect(result).toEqual({
      success: false,
      error: 'This program is not assigned to a client',
    })
    expect(mockDeleteClientProgram).not.toHaveBeenCalled()
  })

  it('surfaces the sellable-package guard message when the service throws it', async () => {
    mockProgramFindUnique.mockResolvedValue({
      trainerId: 'trainer_1',
      name: 'Old',
      clientId: 'client_1',
    } as never)
    mockDeleteClientProgram.mockRejectedValueOnce(
      new Error('Cannot delete: this program is linked to a sellable package')
    )

    const result = await deleteClientProgramAction('prog_1')

    expect(result).toEqual({
      success: false,
      error: 'Cannot delete: this program is linked to a sellable package',
    })
    expect(mockLogAudit).not.toHaveBeenCalled()
  })
})

describe('toggleProgramPublicAction', () => {
  const ownedTemplate = {
    trainerId: 'trainer_1',
    name: 'My Template',
    isTemplate: true,
    clientId: null,
  }

  it('publishes an owned template with no client, and logs the audit', async () => {
    mockProgramFindUnique.mockResolvedValue(ownedTemplate as never)

    const result = await toggleProgramPublicAction('prog_1', true)

    expect(mockToggleProgramPublic).toHaveBeenCalledWith('prog_1', true)
    expect(result).toEqual({ success: true })
    expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'PROGRAM_UPDATED', targetType: 'Program', targetId: 'prog_1', targetLabel: 'My Template',
      metadata: { isPublic: true },
    }))
  })

  it('rejects when the requesting trainer does not own the program', async () => {
    mockProgramFindUnique.mockResolvedValue({ ...ownedTemplate, trainerId: 'someone_else' } as never)

    const result = await toggleProgramPublicAction('prog_1', true)

    expect(result).toEqual({ success: false, error: 'Forbidden' })
    expect(mockToggleProgramPublic).not.toHaveBeenCalled()
  })

  it('rejects a non-template program', async () => {
    mockProgramFindUnique.mockResolvedValue({ ...ownedTemplate, isTemplate: false } as never)

    const result = await toggleProgramPublicAction('prog_1', true)

    expect(result).toEqual({
      success: false,
      error: 'Only templates with no client assigned can be made public',
    })
    expect(mockToggleProgramPublic).not.toHaveBeenCalled()
  })

  it('rejects a program that has a client assigned', async () => {
    mockProgramFindUnique.mockResolvedValue({ ...ownedTemplate, clientId: 'client_1' } as never)

    const result = await toggleProgramPublicAction('prog_1', true)

    expect(result).toEqual({
      success: false,
      error: 'Only templates with no client assigned can be made public',
    })
    expect(mockToggleProgramPublic).not.toHaveBeenCalled()
  })

  it('surfaces a generic error when the service call fails', async () => {
    mockProgramFindUnique.mockResolvedValue(ownedTemplate as never)
    mockToggleProgramPublic.mockRejectedValueOnce(new Error('db error'))

    const result = await toggleProgramPublicAction('prog_1', true)

    expect(result).toEqual({ success: false, error: 'Failed to update program' })
    expect(mockLogAudit).not.toHaveBeenCalled()
  })
})

describe('generateProgramAction', () => {
  it('rejects when the supplied clientId is not in the trainer\'s roster', async () => {
    mockGetClientIds.mockResolvedValue(['someone_else'])

    const result = await generateProgramAction({ clientId: 'client_1' })

    expect(result).toEqual({ success: false, error: 'Forbidden' })
  })
})

describe('saveGeneratedProgramAction', () => {
  it('rejects when the supplied clientId is not in the trainer\'s roster', async () => {
    mockGetClientIds.mockResolvedValue(['someone_else'])

    const result = await saveGeneratedProgramAction({
      aiPlan: {} as never,
      params: {},
      isTemplate: false,
      clientId: 'client_1',
    })

    expect(result).toEqual({ success: false, error: 'Forbidden' })
  })
})
