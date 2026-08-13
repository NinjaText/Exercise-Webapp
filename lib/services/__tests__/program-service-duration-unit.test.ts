import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    program: { create: vi.fn(), findUnique: vi.fn() },
    workout: { createMany: vi.fn() },
    workoutBlockV2: { createMany: vi.fn() },
    blockExerciseV2: { createMany: vi.fn() },
    exerciseSet: { createMany: vi.fn() },
  },
}))

import { prisma } from '@/lib/prisma'
import { createProgram } from '../program.service'

const mockCreate = vi.mocked(prisma.program.create)
const mockSetCreateMany = vi.mocked(prisma.exerciseSet.createMany)
const mockFindUnique = vi.mocked(prisma.program.findUnique)

beforeEach(() => {
  vi.clearAllMocks()
  mockCreate.mockResolvedValue({ id: 'prog_1' } as never)
  mockFindUnique.mockResolvedValue({ id: 'prog_1' } as never)
})

it('persists targetDurationUnit on each set', async () => {
  await createProgram('trainer_1', {
    name: 'Walk Program',
    isTemplate: false,
    tags: [],
    equipmentRequired: [],
    organizationIds: [],
    workouts: [{
      name: 'Day 1', dayIndex: 0, weekIndex: 0, orderIndex: 0,
      blocks: [{
        type: 'NORMAL', orderIndex: 0, rounds: 1,
        exercises: [{
          exerciseId: 'ex_1', orderIndex: 0,
          sets: [{ orderIndex: 0, setType: 'NORMAL', targetDuration: 5, targetDurationUnit: 'MIN' }],
        }],
      }],
    }],
  } as never)

  const rows = mockSetCreateMany.mock.calls[0]![0]!.data as { targetDurationUnit?: string }[]
  expect(rows[0]!.targetDurationUnit).toBe('MIN')
})
