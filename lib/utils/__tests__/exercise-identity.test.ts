import { describe, it, expect } from 'vitest'
import {
  exerciseVideoKey,
  exercisesShareScope,
  findExerciseConflicts,
  normalizeExerciseName,
  type ExerciseIdentity,
} from '../exercise-identity'

describe('normalizeExerciseName', () => {
  it('ignores case, punctuation and spacing', () => {
    expect(normalizeExerciseName('Sit-to-Stand')).toBe('sit to stand')
    expect(normalizeExerciseName('  SIT  to stand ')).toBe('sit to stand')
    expect(normalizeExerciseName('90/90 Hip Switches')).toBe('90 90 hip switches')
  })
})

describe('exerciseVideoKey', () => {
  it('treats every YouTube URL shape for one video as the same key', () => {
    const keys = [
      'https://www.youtube.com/watch?v=PhTDzR0TpZs',
      'https://youtu.be/PhTDzR0TpZs',
      'https://www.youtube.com/embed/PhTDzR0TpZs',
      'https://youtube.com/shorts/PhTDzR0TpZs',
      'https://m.youtube.com/watch?v=PhTDzR0TpZs&t=30s',
    ].map(exerciseVideoKey)
    expect(new Set(keys)).toEqual(new Set(['yt:PhTDzR0TpZs']))
  })

  it('ignores empty values and YouTube search placeholders', () => {
    expect(exerciseVideoKey(null)).toBeNull()
    expect(exerciseVideoKey('  ')).toBeNull()
    expect(exerciseVideoKey('https://www.youtube.com/results?search_query=squat')).toBeNull()
  })

  it('falls back to the trimmed URL for non-YouTube videos', () => {
    expect(exerciseVideoKey(' https://files.example.com/a.mp4/ ')).toBe('https://files.example.com/a.mp4')
  })
})

describe('exercisesShareScope', () => {
  const universal = { source: 'UNIVERSAL' as const, organizationId: null }
  const orgA = { source: 'ORGANIZATION' as const, organizationId: 'org_a' }
  const orgB = { source: 'ORGANIZATION' as const, organizationId: 'org_b' }

  it('universal exercises share scope with everything', () => {
    expect(exercisesShareScope(universal, universal)).toBe(true)
    expect(exercisesShareScope(universal, orgA)).toBe(true)
    expect(exercisesShareScope(orgB, universal)).toBe(true)
  })

  it('org exercises only share scope with the same org', () => {
    expect(exercisesShareScope(orgA, orgA)).toBe(true)
    expect(exercisesShareScope(orgA, orgB)).toBe(false)
  })
})

describe('findExerciseConflicts', () => {
  const pool: ExerciseIdentity[] = [
    { id: '1', name: 'Glute Bridge', videoUrl: 'https://youtu.be/AAAAAAAAAAA', source: 'UNIVERSAL', organizationId: null },
    { id: '2', name: 'Bear Crawl', videoUrl: 'https://youtu.be/BBBBBBBBBBB', source: 'ORGANIZATION', organizationId: 'org_a' },
  ]

  it('reports a name clash with the universal library', () => {
    const conflicts = findExerciseConflicts(
      { name: 'glute-bridge', source: 'ORGANIZATION', organizationId: 'org_b' },
      pool
    )
    expect(conflicts).toEqual([{ field: 'name', existing: { id: '1', name: 'Glute Bridge' } }])
  })

  it('reports a video clash separately from the name', () => {
    const conflicts = findExerciseConflicts(
      { name: 'Hip Thrust', videoUrl: 'https://www.youtube.com/watch?v=AAAAAAAAAAA', source: 'UNIVERSAL' },
      pool
    )
    expect(conflicts).toEqual([{ field: 'videoUrl', existing: { id: '1', name: 'Glute Bridge' } }])
  })

  it('lets two different orgs each have the same exercise', () => {
    expect(
      findExerciseConflicts(
        { name: 'Bear Crawl', videoUrl: 'https://youtu.be/BBBBBBBBBBB', source: 'ORGANIZATION', organizationId: 'org_b' },
        pool
      )
    ).toEqual([])
  })

  it('blocks a universal exercise that an org already has', () => {
    expect(findExerciseConflicts({ name: 'Bear Crawl', source: 'UNIVERSAL' }, pool).map(c => c.field)).toEqual(['name'])
  })

  it('does not conflict with itself', () => {
    expect(findExerciseConflicts({ ...pool[0] }, pool)).toEqual([])
  })
})
