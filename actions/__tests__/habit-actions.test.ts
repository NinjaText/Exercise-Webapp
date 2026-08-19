import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/current-user', () => ({ getCurrentUser: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: { habitDefinition: { findUnique: vi.fn() } },
}))
vi.mock('@/lib/services/client.service', () => ({ getClientIdsForTrainer: vi.fn() }))
vi.mock('@/lib/services/habit.service', () => ({
  createHabit: vi.fn(),
  logHabit: vi.fn(),
  deleteHabit: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { getCurrentUser } from '@/lib/current-user'
import { prisma } from '@/lib/prisma'
import { getClientIdsForTrainer } from '@/lib/services/client.service'
import * as habitService from '@/lib/services/habit.service'
import { createHabitAction, logHabitAction, deleteHabitAction } from '../habit-actions'

const mockGetCurrentUser = vi.mocked(getCurrentUser)
const mockHabitFindUnique = vi.mocked(prisma.habitDefinition.findUnique)
const mockGetClientIds = vi.mocked(getClientIdsForTrainer)
const mockCreateHabit = vi.mocked(habitService.createHabit)
const mockLogHabit = vi.mocked(habitService.logHabit)
const mockDeleteHabit = vi.mocked(habitService.deleteHabit)

const trainer = { id: 'trainer_1', role: 'TRAINER' }
const client = { id: 'client_1', role: 'CLIENT' }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('createHabitAction', () => {
  it('allows a trainer creating a habit for a roster client', async () => {
    mockGetCurrentUser.mockResolvedValue(trainer as never)
    mockGetClientIds.mockResolvedValue(['client_1'])
    mockCreateHabit.mockResolvedValue({ id: 'habit_1' } as never)

    const result = await createHabitAction({ clientId: 'client_1', name: 'Sleep 8h' })

    expect(result.success).toBe(true)
  })

  it('rejects a trainer creating a habit for a non-roster client', async () => {
    mockGetCurrentUser.mockResolvedValue(trainer as never)
    mockGetClientIds.mockResolvedValue(['someone_else'])

    const result = await createHabitAction({ clientId: 'client_1', name: 'Sleep 8h' })

    expect(result.success).toBe(false)
    expect(mockCreateHabit).not.toHaveBeenCalled()
  })

  it('allows a client creating their own habit', async () => {
    mockGetCurrentUser.mockResolvedValue(client as never)
    mockCreateHabit.mockResolvedValue({ id: 'habit_1' } as never)

    const result = await createHabitAction({ name: 'Sleep 8h' })

    expect(result.success).toBe(true)
  })
})

describe('logHabitAction', () => {
  it('allows the owning client to log their own habit', async () => {
    mockGetCurrentUser.mockResolvedValue(client as never)
    mockHabitFindUnique.mockResolvedValue({ clientId: 'client_1' } as never)
    mockLogHabit.mockResolvedValue({ id: 'log_1' } as never)

    const result = await logHabitAction('habit_1', true)

    expect(result.success).toBe(true)
  })

  it("rejects a client logging another client's habit", async () => {
    mockGetCurrentUser.mockResolvedValue(client as never)
    mockHabitFindUnique.mockResolvedValue({ clientId: 'someone_else' } as never)

    const result = await logHabitAction('habit_1', true)

    expect(result.success).toBe(false)
    expect(mockLogHabit).not.toHaveBeenCalled()
  })

  it('allows a trainer logging a roster client\'s habit', async () => {
    mockGetCurrentUser.mockResolvedValue(trainer as never)
    mockHabitFindUnique.mockResolvedValue({ clientId: 'client_1' } as never)
    mockGetClientIds.mockResolvedValue(['client_1'])
    mockLogHabit.mockResolvedValue({ id: 'log_1' } as never)

    const result = await logHabitAction('habit_1', true)

    expect(result.success).toBe(true)
  })

  it("rejects a trainer logging a non-roster client's habit", async () => {
    mockGetCurrentUser.mockResolvedValue(trainer as never)
    mockHabitFindUnique.mockResolvedValue({ clientId: 'client_1' } as never)
    mockGetClientIds.mockResolvedValue(['someone_else'])

    const result = await logHabitAction('habit_1', true)

    expect(result.success).toBe(false)
    expect(mockLogHabit).not.toHaveBeenCalled()
  })
})

describe('deleteHabitAction', () => {
  it('allows the owning client to delete their own habit', async () => {
    mockGetCurrentUser.mockResolvedValue(client as never)
    mockHabitFindUnique.mockResolvedValue({ clientId: 'client_1' } as never)
    mockDeleteHabit.mockResolvedValue({} as never)

    const result = await deleteHabitAction('habit_1')

    expect(result.success).toBe(true)
  })

  it("rejects a trainer deleting a non-roster client's habit", async () => {
    mockGetCurrentUser.mockResolvedValue(trainer as never)
    mockHabitFindUnique.mockResolvedValue({ clientId: 'client_1' } as never)
    mockGetClientIds.mockResolvedValue(['someone_else'])

    const result = await deleteHabitAction('habit_1')

    expect(result.success).toBe(false)
    expect(mockDeleteHabit).not.toHaveBeenCalled()
  })
})
