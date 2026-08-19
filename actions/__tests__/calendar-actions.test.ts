import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/current-user', () => ({ getCurrentUser: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    workoutSession: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    program: { findUnique: vi.fn(), create: vi.fn() },
  },
}))
vi.mock('@/lib/services/client.service', () => ({ getClientIdsForTrainer: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { getCurrentUser } from '@/lib/current-user'
import { prisma } from '@/lib/prisma'
import { getClientIdsForTrainer } from '@/lib/services/client.service'
import {
  getClientWorkoutSessions,
  updateSessionDate,
  scheduleProgramForClientAction,
} from '../calendar-actions'

const mockGetCurrentUser = vi.mocked(getCurrentUser)
const mockSessionFindMany = vi.mocked(prisma.workoutSession.findMany)
const mockSessionFindUnique = vi.mocked(prisma.workoutSession.findUnique)
const mockProgramFindUnique = vi.mocked(prisma.program.findUnique)
const mockGetClientIds = vi.mocked(getClientIdsForTrainer)

const trainer = { id: 'trainer_1', role: 'TRAINER' }
const otherTrainer = { id: 'trainer_2', role: 'TRAINER' }
const client = { id: 'client_1', role: 'CLIENT' }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getClientWorkoutSessions', () => {
  it('allows a client fetching their own sessions', async () => {
    mockGetCurrentUser.mockResolvedValue(client as never)
    mockSessionFindMany.mockResolvedValue([] as never)

    const result = await getClientWorkoutSessions('client_1')

    expect(result.success).toBe(true)
  })

  it('rejects a client fetching another client\'s sessions', async () => {
    mockGetCurrentUser.mockResolvedValue(client as never)

    const result = await getClientWorkoutSessions('someone_else')

    expect(result.success).toBe(false)
    expect(mockSessionFindMany).not.toHaveBeenCalled()
  })

  it('allows a trainer fetching a roster client\'s sessions', async () => {
    mockGetCurrentUser.mockResolvedValue(trainer as never)
    mockGetClientIds.mockResolvedValue(['client_1'])
    mockSessionFindMany.mockResolvedValue([] as never)

    const result = await getClientWorkoutSessions('client_1')

    expect(result.success).toBe(true)
  })

  it('rejects a trainer fetching a non-roster client\'s sessions', async () => {
    mockGetCurrentUser.mockResolvedValue(trainer as never)
    mockGetClientIds.mockResolvedValue(['someone_else'])

    const result = await getClientWorkoutSessions('client_1')

    expect(result.success).toBe(false)
    expect(mockSessionFindMany).not.toHaveBeenCalled()
  })
})

describe('updateSessionDate', () => {
  it('allows the owning trainer to update the date', async () => {
    mockGetCurrentUser.mockResolvedValue(trainer as never)
    mockSessionFindUnique.mockResolvedValue({
      clientId: 'client_1',
      plan: { createdById: 'trainer_1' },
    } as never)
    vi.mocked(prisma.workoutSession.update).mockResolvedValue({} as never)

    const result = await updateSessionDate('session_1', new Date('2026-08-22T00:00:00.000Z'))

    expect(result.success).toBe(true)
  })

  it('rejects a trainer who does not own the plan', async () => {
    mockGetCurrentUser.mockResolvedValue(otherTrainer as never)
    mockSessionFindUnique.mockResolvedValue({
      clientId: 'client_1',
      plan: { createdById: 'trainer_1' },
    } as never)

    const result = await updateSessionDate('session_1', new Date('2026-08-22T00:00:00.000Z'))

    expect(result.success).toBe(false)
    expect(prisma.workoutSession.update).not.toHaveBeenCalled()
  })

  it('still rejects a client updating another client\'s session', async () => {
    mockGetCurrentUser.mockResolvedValue(client as never)
    mockSessionFindUnique.mockResolvedValue({
      clientId: 'someone_else',
      plan: { createdById: 'trainer_1' },
    } as never)

    const result = await updateSessionDate('session_1', new Date('2026-08-22T00:00:00.000Z'))

    expect(result.success).toBe(false)
    expect(prisma.workoutSession.update).not.toHaveBeenCalled()
  })
})

describe('scheduleProgramForClientAction', () => {
  const baseInput = {
    programId: 'template_1',
    clientId: 'client_1',
    startDate: '2026-08-01',
  }

  it('rejects a trainer who does not own the source program', async () => {
    mockGetCurrentUser.mockResolvedValue(trainer as never)
    mockGetClientIds.mockResolvedValue(['client_1'])
    mockProgramFindUnique.mockResolvedValue({ id: 'template_1', trainerId: 'someone_else', workouts: [] } as never)

    const result = await scheduleProgramForClientAction(baseInput)

    expect(result.success).toBe(false)
    expect(prisma.program.create).not.toHaveBeenCalled()
  })

  it('rejects a trainer assigning to a non-roster client', async () => {
    mockGetCurrentUser.mockResolvedValue(trainer as never)
    mockGetClientIds.mockResolvedValue(['someone_else'])

    const result = await scheduleProgramForClientAction(baseInput)

    expect(result.success).toBe(false)
    expect(mockProgramFindUnique).not.toHaveBeenCalled()
    expect(prisma.program.create).not.toHaveBeenCalled()
  })

  it('allows a trainer scheduling their own program for a roster client', async () => {
    mockGetCurrentUser.mockResolvedValue(trainer as never)
    mockGetClientIds.mockResolvedValue(['client_1'])
    mockProgramFindUnique.mockResolvedValue({
      id: 'template_1',
      trainerId: 'trainer_1',
      name: 'Template',
      description: null,
      durationWeeks: 4,
      daysPerWeek: 3,
      tags: [],
      workouts: [],
    } as never)
    vi.mocked(prisma.program.create).mockResolvedValue({ id: 'new_program_1' } as never)

    const result = await scheduleProgramForClientAction(baseInput)

    expect(result.success).toBe(true)
  })
})
