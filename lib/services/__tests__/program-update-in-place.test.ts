import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => {
  const model = () => ({ createMany: vi.fn(), update: vi.fn(), deleteMany: vi.fn(), findMany: vi.fn() })
  return {
    prisma: {
      program: { update: vi.fn(), findUnique: vi.fn() },
      workout: model(),
      workoutBlockV2: model(),
      blockExerciseV2: model(),
      exerciseSet: model(),
    },
  }
})

import { prisma } from '@/lib/prisma'
import { updateProgram } from '../program.service'

const p = vi.mocked(prisma, true)

/** A stored one-day program: w1 → b1 → e1 (2 sets) + e2 (1 set). */
function storedTree() {
  const set = (id: string, blockExerciseId: string, orderIndex: number) => ({
    id, blockExerciseId, orderIndex, setType: 'NORMAL', targetReps: 10, targetWeight: null,
    targetDuration: null, targetDurationUnit: null, targetDistance: null, targetPace: null,
    targetHrZone: null, repeatCount: null, targetRPE: null, restAfter: null,
  })
  const exercise = (id: string, orderIndex: number, sets: ReturnType<typeof set>[]) => ({
    id, blockId: 'b1', exerciseId: `ex_${id}`, orderIndex, activityType: 'STRENGTH',
    restSeconds: 60, notes: null, supersetGroup: null, sets,
  })
  return [
    {
      id: 'w1', name: 'Day 1', description: null, dayIndex: 0, weekIndex: 0, orderIndex: 0,
      estimatedMinutes: 45, videoUrl: null, videoDurationSec: null,
      blocks: [
        {
          id: 'b1', workoutId: 'w1', name: null, type: 'NORMAL', orderIndex: 0, rounds: 1,
          restBetweenRounds: null, timeCap: null, notes: null,
          exercises: [
            exercise('e1', 0, [set('s1', 'e1', 0), set('s2', 'e1', 1)]),
            exercise('e2', 1, [set('s3', 'e2', 0)]),
          ],
        },
      ],
    },
  ]
}

function omit<T extends object, K extends keyof T>(obj: T, key: K): Omit<T, K> {
  const { [key]: _drop, ...rest } = obj
  void _drop
  return rest
}

/** The editor's payload for the stored tree — every row carries its id back. */
function editorPayload() {
  return storedTree().map(({ blocks, ...w }) => ({
    ...w,
    blocks: blocks.map(({ exercises, ...b }) => ({
      ...omit(b, 'workoutId'),
      type: b.type as 'NORMAL',
      exercises: exercises.map(({ sets, ...e }) => ({
        ...omit(e, 'blockId'),
        activityType: e.activityType as 'STRENGTH',
        sets: sets.map((s) => ({ ...omit(s, 'blockExerciseId'), setType: s.setType as 'NORMAL' })),
      })),
    })),
  }))
}

beforeEach(() => {
  vi.clearAllMocks()
  p.workout.findMany.mockResolvedValue(storedTree() as never)
  p.program.findUnique.mockResolvedValue({ id: 'p1' } as never)
})

function noWrites() {
  for (const m of [p.workout, p.workoutBlockV2, p.blockExerciseV2, p.exerciseSet]) {
    expect(m.createMany).not.toHaveBeenCalled()
    expect(m.update).not.toHaveBeenCalled()
    expect(m.deleteMany).not.toHaveBeenCalled()
  }
}

describe('updateProgram saves the workout tree in place', () => {
  it('an unchanged save writes nothing to the tree (sessions and logs untouched)', async () => {
    await updateProgram('p1', { name: 'Renamed', workouts: editorPayload() })
    noWrites()
    expect(p.program.update.mock.calls[0][0].data).toMatchObject({ name: 'Renamed' })
  })

  it('editing one set updates only that set', async () => {
    const payload = editorPayload()
    payload[0].blocks[0].exercises[0].sets[1].targetReps = 8
    await updateProgram('p1', { workouts: payload })

    expect(p.exerciseSet.update).toHaveBeenCalledTimes(1)
    expect(p.exerciseSet.update).toHaveBeenCalledWith({ where: { id: 's2' }, data: { targetReps: 8 } })
    expect(p.workout.deleteMany).not.toHaveBeenCalled()
    expect(p.blockExerciseV2.deleteMany).not.toHaveBeenCalled()
  })

  it('removing an exercise deletes only it; adding one creates only it', async () => {
    const payload = editorPayload()
    const [first] = payload[0].blocks[0].exercises
    payload[0].blocks[0].exercises = [
      first,
      { exerciseId: 'ex_new', orderIndex: 1, activityType: 'STRENGTH', restSeconds: null, notes: null, supersetGroup: null,
        sets: [{ orderIndex: 0, setType: 'NORMAL', targetReps: 5 }] } as never,
    ]
    await updateProgram('p1', { workouts: payload })

    expect(p.blockExerciseV2.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['e2'] } } })
    expect(p.blockExerciseV2.createMany.mock.calls[0][0]?.data).toEqual([
      expect.objectContaining({ blockId: 'b1', exerciseId: 'ex_new' }),
    ])
    expect(p.workout.deleteMany).not.toHaveBeenCalled()
    expect(p.workout.createMany).not.toHaveBeenCalled()
  })

  it('moving an exercise to a new day keeps its id (its logged sets stay attached)', async () => {
    const payload = editorPayload()
    const moved = payload[0].blocks[0].exercises.pop()!
    payload.push({
      name: 'Day 2', description: null, dayIndex: 1, weekIndex: 0, orderIndex: 1, estimatedMinutes: null,
      videoUrl: null, videoDurationSec: null,
      blocks: [{ name: null, type: 'NORMAL', orderIndex: 0, rounds: 1, restBetweenRounds: null, timeCap: null, notes: null,
        exercises: [{ ...moved, orderIndex: 0 }] }],
    } as never)
    await updateProgram('p1', { workouts: payload })

    const newBlockId = p.workoutBlockV2.createMany.mock.calls[0][0]?.data as { id: string }[]
    expect(p.blockExerciseV2.update).toHaveBeenCalledWith({
      where: { id: 'e2' },
      data: { blockId: newBlockId[0].id, orderIndex: 0 },
    })
    expect(p.blockExerciseV2.createMany).not.toHaveBeenCalled()
    expect(p.blockExerciseV2.deleteMany).not.toHaveBeenCalled()
  })

  it('a duplicated id (copied day) becomes a new row instead of stealing the original', async () => {
    const payload = editorPayload()
    payload.push({ ...payload[0], dayIndex: 1, orderIndex: 1 })
    await updateProgram('p1', { workouts: payload })

    expect(p.workout.update).not.toHaveBeenCalled()
    const created = p.workout.createMany.mock.calls[0][0]?.data as { id: string; dayIndex: number }[]
    expect(created).toEqual([expect.objectContaining({ dayIndex: 1 })])
    expect(created[0].id).not.toBe('w1')
  })

  it('removing a day deletes that workout only', async () => {
    await updateProgram('p1', { workouts: [] })
    expect(p.workout.deleteMany).toHaveBeenCalledWith({ where: { programId: 'p1', id: { in: ['w1'] } } })
  })
})
