import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: { exercise: { create: vi.fn() } },
}))
vi.mock('@/lib/utils/video', () => ({
  buildYouTubeSearchUrl: vi.fn(() => 'https://www.youtube.com/results?search_query=x'),
  extractYouTubeId: vi.fn(() => null),
  getYouTubeThumbnail: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { createExercise } from '../exercise.service'

const mockCreate = vi.mocked(prisma.exercise.create)

beforeEach(() => {
  vi.clearAllMocks()
  mockCreate.mockResolvedValue({ id: 'ex_1' } as never)
})

it('creates an exercise with no bodyRegion or difficultyLevel', async () => {
  await createExercise({
    name: 'Brisk Walk',
    equipmentRequired: [],
    contraindications: [],
    createdById: 'trainer_1',
  })

  const call = mockCreate.mock.calls[0][0]
  expect(call.data.bodyRegion).toEqual([])
  expect(call.data.difficultyLevel).toBeNull()
})
