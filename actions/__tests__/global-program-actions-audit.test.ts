import { describe, it, expect, vi, beforeEach } from 'vitest'

const { superAdmin } = vi.hoisted(() => ({
  superAdmin: { id: 'admin_1', firstName: 'Ada', lastName: 'Min', email: 'admin@example.com', role: 'TRAINER', clerkOrgId: null },
}))

vi.mock('@/lib/current-user', () => ({ requireSuperAdmin: vi.fn().mockResolvedValue(superAdmin) }))
vi.mock('@/lib/prisma', () => ({ prisma: { program: { findUnique: vi.fn() } } }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/services/ai.service', () => ({ generateProgram: vi.fn() }))
vi.mock('@/lib/services/program-categorization.service', () => ({
  categorizeGeneratedProgram: vi.fn().mockResolvedValue({
    bodyAreas: [], goals: [], activities: [], level: null, tags: [],
  }),
  buildCategorizationContextFromParams: vi.fn().mockReturnValue({}),
}))
vi.mock('@/lib/services/program.service', () => ({
  createGlobalProgram: vi.fn().mockResolvedValue({ id: 'prog_1', name: 'Global Program' }),
  updateGlobalProgram: vi.fn().mockResolvedValue({ id: 'prog_1', name: 'Updated Global' }),
  deleteGlobalProgram: vi.fn().mockResolvedValue({}),
}))
vi.mock('@/lib/services/audit-log.service', () => ({
  logAudit: vi.fn(),
  diffFields: (before: any, after: any, keys: string[]) => {
    const b: any = {}, a: any = {}
    let changed = false
    for (const k of keys) if (k in after && after[k] !== before[k]) { b[k] = before[k]; a[k] = after[k]; changed = true }
    return changed ? { before: b, after: a } : undefined
  },
  AUDIT_ACTIONS: {
    GLOBAL_PROGRAM_CREATED: 'GLOBAL_PROGRAM_CREATED',
    GLOBAL_PROGRAM_UPDATED: 'GLOBAL_PROGRAM_UPDATED',
    GLOBAL_PROGRAM_DELETED: 'GLOBAL_PROGRAM_DELETED',
  },
}))

import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/services/audit-log.service'
import * as programService from '@/lib/services/program.service'
import { createGlobalProgramAction, updateGlobalProgramAction, deleteGlobalProgramAction } from '../global-program-actions'

const mockProgramFindUnique = vi.mocked(prisma.program.findUnique)
const mockLogAudit = vi.mocked(logAudit)
const mockDeleteGlobalProgram = vi.mocked(programService.deleteGlobalProgram)

beforeEach(() => vi.clearAllMocks())

it('logs GLOBAL_PROGRAM_CREATED', async () => {
  await createGlobalProgramAction({ name: 'Global Program' } as never)
  expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({
    action: 'GLOBAL_PROGRAM_CREATED', targetId: 'prog_1', orgId: null,
  }))
})

it('logs GLOBAL_PROGRAM_UPDATED with a diff', async () => {
  mockProgramFindUnique.mockResolvedValue({ name: 'Global Program', description: null, status: 'DRAFT' } as never)
  await updateGlobalProgramAction('prog_1', { name: 'Updated Global' } as never)
  const call = mockLogAudit.mock.calls[0][0]
  expect(call.action).toBe('GLOBAL_PROGRAM_UPDATED')
  expect(call.metadata).toEqual({ before: { name: 'Global Program' }, after: { name: 'Updated Global' } })
})

it('logs GLOBAL_PROGRAM_DELETED with the pre-fetched name, after the delete succeeds', async () => {
  mockProgramFindUnique.mockResolvedValue({ name: 'Global Program' } as never)
  const result = await deleteGlobalProgramAction('prog_1')

  expect(result).toEqual({ success: true })
  expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({
    action: 'GLOBAL_PROGRAM_DELETED', targetId: 'prog_1', targetLabel: 'Global Program',
  }))
  // The delete must actually succeed before the audit row is written, so a
  // failed delete never produces a false "deleted" audit entry.
  expect(mockDeleteGlobalProgram.mock.invocationCallOrder[0]).toBeLessThan(
    mockLogAudit.mock.invocationCallOrder[0]
  )
})

it('does not log GLOBAL_PROGRAM_DELETED when the delete itself fails', async () => {
  mockProgramFindUnique.mockResolvedValue({ name: 'Global Program' } as never)
  mockDeleteGlobalProgram.mockRejectedValueOnce(new Error('db error'))

  const result = await deleteGlobalProgramAction('prog_1')

  expect(result).toEqual({ success: false, error: 'Failed to delete global program' })
  expect(mockLogAudit).not.toHaveBeenCalled()
})
