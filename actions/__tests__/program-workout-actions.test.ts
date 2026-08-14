import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    workout: { findUnique: vi.fn(), delete: vi.fn(), create: vi.fn() },
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import {
  deleteWorkoutFromProgramAction,
  duplicateWorkoutToDayAction,
} from '../program-workout-actions'

const mockAuth = vi.mocked(auth)
const mockUserFind = vi.mocked(prisma.user.findUnique)
const mockWorkoutFind = vi.mocked(prisma.workout.findUnique)
const mockWorkoutDelete = vi.mocked(prisma.workout.delete)
const mockWorkoutCreate = vi.mocked(prisma.workout.create)

const CLERK_ID = 'clerk_1'
const TRAINER_ID = 'trainer_db_1'
const WORKOUT_ID = 'workout_1'
const PROGRAM_ID = 'program_1'

const dbTrainer = { id: TRAINER_ID, clerkId: CLERK_ID, role: 'TRAINER' }

const workoutWithProgram = {
  id: WORKOUT_ID,
  programId: PROGRAM_ID,
  name: 'Push Day',
  estimatedMinutes: 45,
  program: { id: PROGRAM_ID, trainerId: TRAINER_ID },
  blocks: [],
}

beforeEach(() => vi.clearAllMocks())

describe('deleteWorkoutFromProgramAction', () => {
  it('returns Unauthorized when not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null } as never)
    expect(await deleteWorkoutFromProgramAction(WORKOUT_ID)).toEqual({
      success: false,
      error: 'Unauthorized',
    })
  })

  it('returns Unauthorized when user not in db', async () => {
    mockAuth.mockResolvedValue({ userId: CLERK_ID } as never)
    mockUserFind.mockResolvedValue(null)
    expect(await deleteWorkoutFromProgramAction(WORKOUT_ID)).toEqual({
      success: false,
      error: 'Unauthorized',
    })
  })

  it('returns Forbidden when workout belongs to a different trainer', async () => {
    mockAuth.mockResolvedValue({ userId: CLERK_ID } as never)
    mockUserFind.mockResolvedValue(dbTrainer as never)
    mockWorkoutFind.mockResolvedValue({
      ...workoutWithProgram,
      program: { id: PROGRAM_ID, trainerId: 'other_trainer' },
    } as never)
    expect(await deleteWorkoutFromProgramAction(WORKOUT_ID)).toEqual({
      success: false,
      error: 'Forbidden',
    })
  })

  it('deletes the workout and returns success', async () => {
    mockAuth.mockResolvedValue({ userId: CLERK_ID } as never)
    mockUserFind.mockResolvedValue(dbTrainer as never)
    mockWorkoutFind.mockResolvedValue(workoutWithProgram as never)
    mockWorkoutDelete.mockResolvedValue(undefined as never)

    const result = await deleteWorkoutFromProgramAction(WORKOUT_ID)

    expect(mockWorkoutDelete).toHaveBeenCalledWith({ where: { id: WORKOUT_ID } })
    expect(result).toEqual({ success: true, data: undefined })
  })
})

describe('duplicateWorkoutToDayAction', () => {
  it('returns Unauthorized when not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null } as never)
    expect(await duplicateWorkoutToDayAction(WORKOUT_ID, 1, 2)).toEqual({
      success: false,
      error: 'Unauthorized',
    })
  })

  it('returns Forbidden when workout belongs to a different trainer', async () => {
    mockAuth.mockResolvedValue({ userId: CLERK_ID } as never)
    mockUserFind.mockResolvedValue(dbTrainer as never)
    mockWorkoutFind.mockResolvedValue({
      ...workoutWithProgram,
      program: { id: PROGRAM_ID, trainerId: 'other_trainer' },
    } as never)
    expect(await duplicateWorkoutToDayAction(WORKOUT_ID, 1, 2)).toEqual({
      success: false,
      error: 'Forbidden',
    })
  })

  it('creates a cloned workout at the target week and day', async () => {
    mockAuth.mockResolvedValue({ userId: CLERK_ID } as never)
    mockUserFind.mockResolvedValue(dbTrainer as never)
    mockWorkoutFind.mockResolvedValue(workoutWithProgram as never)
    mockWorkoutCreate.mockResolvedValue({ id: 'new_workout' } as never)

    const result = await duplicateWorkoutToDayAction(WORKOUT_ID, 2, 4)

    expect(mockWorkoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          programId: PROGRAM_ID,
          name: 'Push Day (copy)',
          weekIndex: 2,
          dayIndex: 4,
          orderIndex: 18, // weekIndex * 7 + dayIndex
        }),
      })
    )
    expect(result).toEqual({ success: true, data: undefined })
  })

  it('rejects a dayIndex outside 0-6 without touching the database', async () => {
    mockAuth.mockResolvedValue({ userId: CLERK_ID } as never)

    const result = await duplicateWorkoutToDayAction(WORKOUT_ID, 0, 7)

    expect(result).toEqual({
      success: false,
      error: 'Day must be within a single week (max 7 days)',
    })
    expect(mockWorkoutFind).not.toHaveBeenCalled()
    expect(mockWorkoutCreate).not.toHaveBeenCalled()
  })

  it('rejects a negative weekIndex without touching the database', async () => {
    mockAuth.mockResolvedValue({ userId: CLERK_ID } as never)

    const result = await duplicateWorkoutToDayAction(WORKOUT_ID, -1, 0)

    expect(result).toEqual({ success: false, error: 'Invalid week' })
    expect(mockWorkoutFind).not.toHaveBeenCalled()
    expect(mockWorkoutCreate).not.toHaveBeenCalled()
  })
})
