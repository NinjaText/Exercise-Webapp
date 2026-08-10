import { describe, it, expect, vi, afterEach } from 'vitest'
import { dedupeAcrossDays } from '../exercise-dedup'

function pool() {
  return [
    { id: 'a', name: 'Squat', bodyRegion: ['LOWER_BODY'] },
    { id: 'b', name: 'Lunge', bodyRegion: ['LOWER_BODY'] },
    { id: 'c', name: 'Push-up', bodyRegion: ['UPPER_BODY'] },
    { id: 'd', name: 'Plank', bodyRegion: ['CORE'] },
  ]
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('dedupeAcrossDays', () => {
  it('leaves templates untouched when no exerciseId repeats', () => {
    const templates = [
      { dayOfWeek: 0, exercises: [{ exerciseId: 'a' }, { exerciseId: 'c' }] },
      { dayOfWeek: 1, exercises: [{ exerciseId: 'b' }, { exerciseId: 'd' }] },
    ]
    const result = dedupeAcrossDays(templates, pool())
    expect(result[0].exercises.map(e => e.exerciseId)).toEqual(['a', 'c'])
    expect(result[1].exercises.map(e => e.exerciseId)).toEqual(['b', 'd'])
  })

  it('swaps a repeated exerciseId for an unused pool exercise', () => {
    const templates = [
      { dayOfWeek: 0, exercises: [{ exerciseId: 'a' }] },
      { dayOfWeek: 1, exercises: [{ exerciseId: 'a' }] },
    ]
    const result = dedupeAcrossDays(templates, pool())
    const allIds = result.flatMap(t => t.exercises.map(e => e.exerciseId))
    expect(new Set(allIds).size).toBe(allIds.length)
    expect(allIds).toContain('a')
  })

  it('prefers a replacement sharing a body region with the original', () => {
    const templates = [
      { dayOfWeek: 0, exercises: [{ exerciseId: 'a' }] },
      { dayOfWeek: 1, exercises: [{ exerciseId: 'a' }] }, // should become 'b' (also LOWER_BODY)
    ]
    const result = dedupeAcrossDays(templates, pool())
    expect(result[1].exercises[0].exerciseId).toBe('b')
  })

  it('leaves a duplicate in place and warns when the pool is exhausted', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const tinyPool = [{ id: 'a', name: 'Squat', bodyRegion: ['LOWER_BODY'] }]
    const templates = [
      { dayOfWeek: 0, exercises: [{ exerciseId: 'a' }] },
      { dayOfWeek: 1, exercises: [{ exerciseId: 'a' }] },
    ]
    const result = dedupeAcrossDays(templates, tinyPool)
    expect(result[1].exercises[0].exerciseId).toBe('a')
    expect(warnSpy).toHaveBeenCalled()
  })

  it('updates exerciseName to match the replacement exercise', () => {
    const templates = [
      { dayOfWeek: 0, exercises: [{ exerciseId: 'a', exerciseName: 'Squat' }] },
      { dayOfWeek: 1, exercises: [{ exerciseId: 'a', exerciseName: 'Squat' }] },
    ]
    const result = dedupeAcrossDays(templates, pool())
    const replaced = result[1].exercises[0]
    expect(replaced.exerciseId).not.toBe('a')
    expect(replaced.exerciseName).not.toBe('Squat')
  })
})
