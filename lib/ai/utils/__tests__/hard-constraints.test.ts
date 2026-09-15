import { describe, expect, it } from 'vitest'
import {
  extractHardConstraints,
  exerciseViolatesHardConstraints,
  filterPoolByHardConstraints,
  auditAndReplaceViolations,
} from '../hard-constraints'

describe('extractHardConstraints', () => {
  it('detects "no plyometrics"', () => {
    const categories = extractHardConstraints('No plyometrics this week, knee is sore.')
    expect(categories.map((c) => c.id)).toEqual(['NO_PLYOMETRICS'])
  })

  it('detects "no jumping" as equivalent to no plyometrics', () => {
    const categories = extractHardConstraints('Trainer note: no jumping please')
    expect(categories.map((c) => c.id)).toContain('NO_PLYOMETRICS')
  })

  it('detects "strength only" and "no plyometrics"; STRENGTH_ONLY alone already prohibits running', () => {
    const categories = extractHardConstraints('Strictly strength training. No plyometrics or running.')
    const ids = categories.map((c) => c.id)
    expect(ids).toContain('STRENGTH_ONLY')
    expect(ids).toContain('NO_PLYOMETRICS')
    // "no running" isn't a literal substring here ("no plyometrics OR running"),
    // so NO_RUNNING isn't separately triggered — but STRENGTH_ONLY's own
    // prohibitedPatterns already exclude running exercises, so this is a
    // detection-category redundancy, not an enforcement gap.
    expect(exerciseViolatesHardConstraints('Treadmill Running', categories)).toBe(true)
  })

  it('detects "no overhead"', () => {
    expect(extractHardConstraints('no overhead exercises').map((c) => c.id)).toEqual(['NO_OVERHEAD'])
  })

  it('returns empty for unrelated text', () => {
    expect(extractHardConstraints('Focus on posterior chain and mobility.')).toEqual([])
  })

  it('returns empty for null/undefined/blank input', () => {
    expect(extractHardConstraints(null, undefined, '', '   ')).toEqual([])
  })

  it('combines multiple text sources', () => {
    const categories = extractHardConstraints('General notes here', 'no jumping', undefined)
    expect(categories.map((c) => c.id)).toContain('NO_PLYOMETRICS')
  })
})

describe('exerciseViolatesHardConstraints', () => {
  const noPlyo = extractHardConstraints('no plyometrics')

  it('flags obvious plyometric exercise names', () => {
    expect(exerciseViolatesHardConstraints('Box Jump', noPlyo)).toBe(true)
    expect(exerciseViolatesHardConstraints('Broad Jump', noPlyo)).toBe(true)
    expect(exerciseViolatesHardConstraints('Skater Hops', noPlyo)).toBe(true)
    expect(exerciseViolatesHardConstraints('Jumping Lunge', noPlyo)).toBe(true)
    expect(exerciseViolatesHardConstraints('Depth Jump', noPlyo)).toBe(true)
  })

  it('does not flag unrelated exercises', () => {
    expect(exerciseViolatesHardConstraints('Barbell Back Squat', noPlyo)).toBe(false)
    expect(exerciseViolatesHardConstraints('Trunk Rotation', noPlyo)).toBe(false)
  })

  it('does not false-positive "trunk" against a no-running constraint (word boundary check)', () => {
    const noRunning = extractHardConstraints('no running')
    expect(exerciseViolatesHardConstraints('Trunk Rotation', noRunning)).toBe(false)
    expect(exerciseViolatesHardConstraints('Treadmill Running', noRunning)).toBe(true)
  })

  it('returns false when there are no active categories', () => {
    expect(exerciseViolatesHardConstraints('Box Jump', [])).toBe(false)
  })
})

describe('filterPoolByHardConstraints', () => {
  const pool = [
    { name: 'Box Jump' },
    { name: 'Barbell Squat' },
    { name: 'Push-up' },
    { name: 'Jumping Lunge' },
  ]

  it('removes violating exercises from the pool', () => {
    const categories = extractHardConstraints('no plyometrics')
    const filtered = filterPoolByHardConstraints(pool, categories)
    expect(filtered.map((e) => e.name)).toEqual(['Barbell Squat', 'Push-up'])
  })

  it('returns the pool unchanged when there are no constraints', () => {
    expect(filterPoolByHardConstraints(pool, [])).toEqual(pool)
  })
})

describe('auditAndReplaceViolations', () => {
  const pool = [
    { id: 'a', name: 'Box Jump', bodyRegion: ['LOWER_BODY'] },
    { id: 'b', name: 'Goblet Squat', bodyRegion: ['LOWER_BODY'] },
    { id: 'c', name: 'Push-up', bodyRegion: ['UPPER_BODY'] },
    { id: 'd', name: 'Jumping Lunge', bodyRegion: ['LOWER_BODY'] },
  ]

  it('replaces a violating exercise with a compliant same-region substitute', () => {
    const categories = extractHardConstraints('no plyometrics')
    const generated = [
      { exerciseId: 'a', exerciseName: 'Box Jump' },
      { exerciseId: 'c', exerciseName: 'Push-up' },
    ]
    const result = auditAndReplaceViolations(generated, categories, pool)
    expect(result.violationsFound).toHaveLength(1)
    expect(result.violationsFound[0].exerciseId).toBe('a')
    expect(result.cleaned.find((e) => e.exerciseId === 'c')).toBeTruthy()
    const replaced = result.cleaned.find((e) => e.exerciseId !== 'c')!
    expect(replaced.exerciseId).toBe('b') // same body region, unused, compliant
    expect(result.unresolvedViolations).toHaveLength(0)
  })

  it('leaves a violation in place and reports it when the pool is exhausted', () => {
    const smallPool = [{ id: 'a', name: 'Box Jump', bodyRegion: ['LOWER_BODY'] }]
    const categories = extractHardConstraints('no plyometrics')
    const generated = [{ exerciseId: 'a', exerciseName: 'Box Jump' }]
    const result = auditAndReplaceViolations(generated, categories, smallPool)
    expect(result.unresolvedViolations).toHaveLength(1)
    expect(result.cleaned[0].exerciseId).toBe('a')
  })

  it('is a no-op when there are no active constraints', () => {
    const generated = [{ exerciseId: 'a', exerciseName: 'Box Jump' }]
    const result = auditAndReplaceViolations(generated, [], pool)
    expect(result.cleaned).toEqual(generated)
    expect(result.violationsFound).toHaveLength(0)
  })
})
