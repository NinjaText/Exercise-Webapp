import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    program: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
    workout: { createMany: vi.fn(), deleteMany: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    workoutBlockV2: { createMany: vi.fn() },
    blockExerciseV2: { createMany: vi.fn() },
    exerciseSet: { createMany: vi.fn() },
  },
}))

import { prisma } from '@/lib/prisma'
import { createProgram, duplicateProgram, syncProgramToTemplate, updateFollowAlongProgram } from '../program.service'

const mockProgramCreate = vi.mocked(prisma.program.create)
const mockProgramUpdate = vi.mocked(prisma.program.update)
const mockProgramFind = vi.mocked(prisma.program.findUnique)
const mockWorkoutCreateMany = vi.mocked(prisma.workout.createMany)

const VIDEO_URL = 'https://media.example.com/follow-along/trainer_1/day1.mp4'

/** A stored follow-along program as getProgramById returns it (detail include). */
function storedFollowAlongProgram(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tpl_1',
    trainerId: 'trainer_1',
    name: '90 day reset',
    description: null,
    isPublic: false,
    isGlobal: false,
    schedulingType: 'SCHEDULED',
    contentFormat: 'FOLLOW_ALONG',
    durationWeeks: 13,
    daysPerWeek: 7,
    tags: [],
    equipmentRequired: [],
    bodyAreas: [],
    goals: [],
    activities: [],
    level: null,
    sourceTemplateId: null,
    workouts: [
      {
        id: 'w1',
        name: 'Day 1',
        description: 'Easy start',
        dayIndex: 0,
        weekIndex: 0,
        orderIndex: 0,
        estimatedMinutes: null,
        videoUrl: VIDEO_URL,
        videoDurationSec: 900,
        blocks: [],
      },
    ],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockProgramCreate.mockResolvedValue({ id: 'new_1' } as never)
  mockProgramUpdate.mockResolvedValue({ id: 'tpl_1' } as never)
})

describe('follow-along fields survive every copy path', () => {
  it('createProgram writes videoUrl/videoDurationSec on zero-block workouts', async () => {
    mockProgramFind.mockResolvedValue({ id: 'new_1' } as never)

    await createProgram('trainer_1', {
      name: '90 day reset',
      contentFormat: 'FOLLOW_ALONG',
      isTemplate: false,
      schedulingType: 'SCHEDULED',
      tags: [],
      equipmentRequired: [],
      organizationIds: [],
      collectionIds: [],
      bodyAreas: [],
      goals: [],
      activities: [],
      workouts: [
        { name: 'Day 1', dayIndex: 0, weekIndex: 0, orderIndex: 0, videoUrl: VIDEO_URL, videoDurationSec: 900, blocks: [] },
      ],
    })

    expect(mockProgramCreate.mock.calls[0][0].data).toMatchObject({ contentFormat: 'FOLLOW_ALONG' })
    expect(mockWorkoutCreateMany.mock.calls[0][0]?.data).toEqual([
      expect.objectContaining({ name: 'Day 1', videoUrl: VIDEO_URL, videoDurationSec: 900 }),
    ])
  })

  it('duplicateProgram (the assign path) keeps contentFormat and the video fields', async () => {
    mockProgramFind
      .mockResolvedValueOnce(storedFollowAlongProgram() as never) // getProgramById(source)
      .mockResolvedValueOnce({ id: 'new_1' } as never) // createProgram's read-back

    await duplicateProgram('tpl_1', 'trainer_1')

    expect(mockProgramCreate.mock.calls[0][0].data).toMatchObject({ contentFormat: 'FOLLOW_ALONG' })
    expect(mockWorkoutCreateMany.mock.calls[0][0]?.data).toEqual([
      expect.objectContaining({ description: 'Easy start', videoUrl: VIDEO_URL, videoDurationSec: 900 }),
    ])
  })

  it('duplicateProgram writes a null contentFormat for a normal program', async () => {
    mockProgramFind
      .mockResolvedValueOnce(storedFollowAlongProgram({ contentFormat: undefined, workouts: [] }) as never)
      .mockResolvedValueOnce({ id: 'new_1' } as never)

    await duplicateProgram('tpl_1', 'trainer_1')

    expect(mockProgramCreate.mock.calls[0][0].data).toMatchObject({ contentFormat: null })
  })

  it('syncProgramToTemplate pushes video days back onto the template', async () => {
    mockProgramFind
      .mockResolvedValueOnce(storedFollowAlongProgram({ id: 'copy_1', sourceTemplateId: 'tpl_1' }) as never)
      .mockResolvedValueOnce({ id: 'tpl_1', trainerId: 'trainer_1' } as never) // template lookup
      .mockResolvedValueOnce({ id: 'tpl_1' } as never) // updateProgram's read-back

    await syncProgramToTemplate('copy_1', 'trainer_1')

    expect(mockProgramUpdate.mock.calls[0][0].data).toMatchObject({ contentFormat: 'FOLLOW_ALONG' })
    expect(mockWorkoutCreateMany.mock.calls[0][0]?.data).toEqual([
      expect.objectContaining({ videoUrl: VIDEO_URL, videoDurationSec: 900 }),
    ])
  })
})

describe('updateFollowAlongProgram (in-place save)', () => {
  const mockWorkoutFindMany = vi.mocked(prisma.workout.findMany)
  const mockWorkoutUpdate = vi.mocked(prisma.workout.update)
  const mockWorkoutDeleteMany = vi.mocked(prisma.workout.deleteMany)

  const stored = (id: string, day: number, videoUrl = VIDEO_URL) => ({
    id,
    name: `Day ${day}`,
    description: null,
    weekIndex: Math.floor((day - 1) / 7),
    dayIndex: (day - 1) % 7,
    orderIndex: day - 1,
    estimatedMinutes: 15,
    videoUrl,
    videoDurationSec: 900,
  })
  const input = (w: ReturnType<typeof stored>, overrides: Record<string, unknown> = {}) => ({ ...w, blocks: [], ...overrides })

  beforeEach(() => {
    mockWorkoutFindMany.mockResolvedValue([stored('w1', 1), stored('w2', 2), stored('w3', 3)] as never)
    mockProgramFind.mockResolvedValue({ id: 'p1' } as never)
  })

  it("editing one day's video updates only that row — other days (and their sessions) are untouched", async () => {
    const NEW_URL = 'https://media.example.com/follow-along/trainer_1/new.mp4'
    await updateFollowAlongProgram('p1', {
      contentFormat: 'FOLLOW_ALONG',
      workouts: [input(stored('w1', 1)), input(stored('w2', 2), { videoUrl: NEW_URL }), input(stored('w3', 3))],
    })

    expect(mockWorkoutDeleteMany).not.toHaveBeenCalled()
    expect(mockWorkoutCreateMany).not.toHaveBeenCalled()
    expect(mockWorkoutUpdate).toHaveBeenCalledTimes(1)
    expect(mockWorkoutUpdate.mock.calls[0][0]).toMatchObject({ where: { id: 'w2' }, data: { videoUrl: NEW_URL } })
  })

  it('deletes only removed days and creates new ones', async () => {
    await updateFollowAlongProgram('p1', {
      workouts: [
        input(stored('w1', 1)),
        input(stored('w3', 3)),
        { name: 'Day 4', weekIndex: 0, dayIndex: 3, orderIndex: 3, videoUrl: VIDEO_URL, videoDurationSec: 600, blocks: [] },
      ],
    })

    expect(mockWorkoutDeleteMany).toHaveBeenCalledWith({ where: { programId: 'p1', id: { in: ['w2'] } } })
    expect(mockWorkoutCreateMany.mock.calls[0][0]?.data).toEqual([expect.objectContaining({ name: 'Day 4', dayIndex: 3 })])
    expect(mockWorkoutUpdate).not.toHaveBeenCalled()
  })

  it("treats an id from another program as a new day (never updates a foreign row)", async () => {
    await updateFollowAlongProgram('p1', {
      workouts: [input(stored('w1', 1)), input(stored('w2', 2)), input(stored('w3', 3)), input(stored('foreign', 5))],
    })

    expect(mockWorkoutUpdate).not.toHaveBeenCalled()
    expect(mockWorkoutCreateMany.mock.calls[0][0]?.data).toEqual([expect.objectContaining({ dayIndex: 4 })])
    expect(mockWorkoutCreateMany.mock.calls[0][0]?.data).not.toEqual([expect.objectContaining({ id: 'foreign' })])
  })

  it('writes program fields without rebuilding workouts', async () => {
    await updateFollowAlongProgram('p1', { name: 'Renamed', workouts: [input(stored('w1', 1)), input(stored('w2', 2)), input(stored('w3', 3))] })

    expect(mockProgramUpdate.mock.calls[0][0].data).toMatchObject({ name: 'Renamed' })
    expect(mockProgramUpdate.mock.calls[0][0].data).not.toHaveProperty('workouts')
    expect(mockWorkoutDeleteMany).not.toHaveBeenCalled()
  })
})
