import { describe, it, expect, vi } from 'vitest'

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn().mockResolvedValue({ userId: 'clerk_1' }) }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    program: { findUnique: vi.fn() },
    exercise: { findMany: vi.fn() },
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/services/ai.service', () => ({
  generateProgram: vi.fn(),
  buildProgramPreviewFromBlueprint: vi.fn(),
}))
vi.mock('@/lib/services/program-brief.service', () => ({
  extractProgramBriefText: vi.fn(),
  extractBriefMetadata: vi.fn(),
  parseProgramBrief: vi.fn(),
}))
vi.mock('@/lib/services/program.service', () => ({
  createProgram: vi.fn(),
  updateProgram: vi.fn(),
  deleteProgram: vi.fn(),
}))
vi.mock('@/lib/services/audit-log.service', () => ({
  logAudit: vi.fn(),
  diffFields: vi.fn(),
  deriveActorType: vi.fn(() => 'TRAINER'),
  AUDIT_ACTIONS: { PROGRAM_CREATED: 'PROGRAM_CREATED', PROGRAM_UPDATED: 'PROGRAM_UPDATED', PROGRAM_DELETED: 'PROGRAM_DELETED' },
}))

import { computeDurationWeeksFromWorkouts } from '../program-actions'

describe('computeDurationWeeksFromWorkouts', () => {
  it('returns max weekIndex + 1 across all workouts', () => {
    const workouts = [{ weekIndex: 0 }, { weekIndex: 2 }, { weekIndex: 1 }] as any
    expect(computeDurationWeeksFromWorkouts(workouts)).toBe(3)
  })

  it('returns 1 for a single-week program', () => {
    const workouts = [{ weekIndex: 0 }, { weekIndex: 0 }] as any
    expect(computeDurationWeeksFromWorkouts(workouts)).toBe(1)
  })

  it('returns null for an empty workouts array', () => {
    expect(computeDurationWeeksFromWorkouts([])).toBeNull()
  })
})
