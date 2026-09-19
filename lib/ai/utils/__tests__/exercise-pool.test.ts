import { describe, it, expect } from 'vitest'
import {
  filterByContraindications,
  buildPhasePoolPrimaryWhereClause,
  buildPhasePoolFallbackWhereClause,
  filterByEquipment,
  orderPoolByDifficultyPreference,
  poolItemMatchesCircuitFocus,
  poolItemFitsCircuit,
  isEarlyRehabExercise,
  scoreCircuitRelevance,
  inferEquipmentFromName,
} from '../exercise-pool'

describe('filterByContraindications', () => {
  const exercises = [
    { id: '1', name: 'Squat', contraindications: ['knee flexion >90°', 'impact'] },
    { id: '2', name: 'Quad Set', contraindications: [] },
    { id: '3', name: 'Leg Press', contraindications: ['post-surgical knee flexion'] },
  ]

  it('returns all exercises when client has no limitations', () => {
    const result = filterByContraindications(exercises, [])
    expect(result).toHaveLength(3)
  })

  it('excludes exercises whose contraindications overlap with client limitations', () => {
    const result = filterByContraindications(exercises, ['knee flexion'])
    const names = result.map(e => e.name)
    expect(names).toContain('Quad Set')
    expect(names).not.toContain('Squat')
    expect(names).not.toContain('Leg Press')
  })

  it('is case-insensitive', () => {
    const result = filterByContraindications(exercises, ['IMPACT'])
    expect(result.map(e => e.name)).not.toContain('Squat')
  })
})

describe('buildPhasePoolPrimaryWhereClause', () => {
  it('includes rehabStage and indicationTags when provided', () => {
    const phaseInput = {
      rehabStage: 'EARLY_REHAB' as const,
      focusAreas: ['LOWER_BODY'],
      derivedIndicationTags: ['ACL', 'knee'],
    }
    const usedIds = new Set(['abc', 'def'])
    const clause = buildPhasePoolPrimaryWhereClause(phaseInput, usedIds)

    expect(clause.rehabStage).toBe('EARLY_REHAB')
    expect(clause.bodyRegion).toEqual({ hasSome: ['LOWER_BODY'] })
    expect(clause.indicationTags).toEqual({ hasSome: ['ACL', 'knee'] })
    expect(clause.id).toEqual({ notIn: ['abc', 'def'] })
    expect(clause.isActive).toBe(true)
  })

  it('omits indicationTags filter when derivedIndicationTags is empty', () => {
    const phaseInput = {
      rehabStage: 'MID_REHAB' as const,
      focusAreas: ['UPPER_BODY'],
      derivedIndicationTags: [],
    }
    const clause = buildPhasePoolPrimaryWhereClause(phaseInput, new Set())
    expect(clause.indicationTags).toBeUndefined()
  })

  it('omits used IDs from the query when set is empty', () => {
    const phaseInput = {
      rehabStage: 'MID_REHAB' as const,
      focusAreas: ['CORE'],
      derivedIndicationTags: ['low-back-pain'],
    }
    const clause = buildPhasePoolPrimaryWhereClause(phaseInput, new Set())
    expect(clause.id).toBeUndefined()
  })

  it('always excludes assessment exercises from the pool', () => {
    const phaseInput = {
      rehabStage: 'MID_REHAB' as const,
      focusAreas: ['CORE'],
      derivedIndicationTags: [],
    }
    const clause = buildPhasePoolPrimaryWhereClause(phaseInput, new Set())
    expect(clause.isAssessment).toBe(false)
  })
})

describe('buildPhasePoolFallbackWhereClause', () => {
  it('filters by body region only when no difficultyLevel given', () => {
    const clause = buildPhasePoolFallbackWhereClause(['LOWER_BODY'], new Set())
    expect(clause.bodyRegion).toEqual({ hasSome: ['LOWER_BODY'] })
    expect(clause.difficultyLevel).toBeUndefined()
    expect(clause.isActive).toBe(true)
  })

  it('adds a difficultyLevel filter when provided', () => {
    const clause = buildPhasePoolFallbackWhereClause(['UPPER_BODY'], new Set(), 'INTERMEDIATE')
    expect(clause.difficultyLevel).toBe('INTERMEDIATE')
  })

  it('includes used IDs when the set is non-empty', () => {
    const clause = buildPhasePoolFallbackWhereClause(['CORE'], new Set(['x', 'y']))
    expect(clause.id).toEqual({ notIn: ['x', 'y'] })
  })

  it('always excludes assessment exercises from the pool', () => {
    const clause = buildPhasePoolFallbackWhereClause(['CORE'], new Set())
    expect(clause.isAssessment).toBe(false)
  })
})

describe('filterByEquipment', () => {
  const exercises = [
    { id: '1', name: 'Squat', equipmentRequired: [] },
    { id: '2', name: 'Dumbbell Curl', equipmentRequired: ['Dumbbells'] },
    { id: '3', name: 'Band Pull Apart', equipmentRequired: ['Resistance Band'] },
    { id: '4', name: 'Barbell Deadlift', equipmentRequired: ['Barbell'] },
    { id: '5', name: 'Chair Sit-to-Stand', equipmentRequired: ['None'] },
    { id: '6', name: 'DB Shoulder Press', equipmentRequired: ['Dumbbells', 'Chair'] },
  ]

  it('returns all exercises when availableEquipment is empty (no filter)', () => {
    expect(filterByEquipment(exercises, [])).toHaveLength(6)
  })

  it('always includes bodyweight exercises (empty equipmentRequired)', () => {
    const result = filterByEquipment(exercises, ['Dumbbells'])
    const names = result.map(e => e.name)
    expect(names).toContain('Squat')
  })

  it('always includes exercises with only "None" as equipment', () => {
    const result = filterByEquipment(exercises, ['Dumbbells'])
    const names = result.map(e => e.name)
    expect(names).toContain('Chair Sit-to-Stand')
  })

  it('includes exercises whose equipment is fully covered by the available set', () => {
    const result = filterByEquipment(exercises, ['Dumbbells'])
    const names = result.map(e => e.name)
    expect(names).toContain('Dumbbell Curl')
  })

  it('excludes exercises needing equipment not in the available set', () => {
    const result = filterByEquipment(exercises, ['Dumbbells'])
    const names = result.map(e => e.name)
    expect(names).not.toContain('Band Pull Apart')
    expect(names).not.toContain('Barbell Deadlift')
  })

  it('includes exercises only when ALL required equipment is available', () => {
    // DB Shoulder Press needs both Dumbbells and Chair
    const withChairOnly = filterByEquipment(exercises, ['Chair'])
    expect(withChairOnly.map(e => e.name)).not.toContain('DB Shoulder Press')

    const withBoth = filterByEquipment(exercises, ['Dumbbells', 'Chair'])
    expect(withBoth.map(e => e.name)).toContain('DB Shoulder Press')
  })
})

describe('filterByEquipment — normalization', () => {
  const dumbbellUpper = { id: 'a', equipmentRequired: ['dumbbell'] }
  const dumbbellsPlural = { id: 'b', equipmentRequired: ['Dumbbells'] }
  const optionalBand = { id: 'c', equipmentRequired: ['resistance band (optional)'] }
  const bench = { id: 'd', equipmentRequired: ['bench'] }

  it('matches equipment case-insensitively and across singular/plural spellings', () => {
    const result = filterByEquipment([dumbbellUpper, dumbbellsPlural, bench], ['Dumbbells'])
    expect(result.map(e => e.id)).toEqual(['a', 'b'])
  })

  it('treats "(optional)" equipment as not required', () => {
    expect(filterByEquipment([optionalBand, bench], ['none']).map(e => e.id)).toEqual(['c'])
  })

  it('a selection of just "none" means bodyweight only', () => {
    expect(filterByEquipment([dumbbellsPlural, bench], ['none'])).toEqual([])
  })
})

describe('orderPoolByDifficultyPreference', () => {
  const pool = [
    { id: '1', difficultyLevel: 'ADVANCED' },
    { id: '2', difficultyLevel: 'BEGINNER' },
    { id: '3', difficultyLevel: 'INTERMEDIATE' },
    { id: '4', difficultyLevel: 'INTERMEDIATE' },
  ]
  it('puts the requested difficulty first, then adjacent levels, never dropping anything', () => {
    const ordered = orderPoolByDifficultyPreference(pool, 'INTERMEDIATE', 1)
    expect(ordered).toHaveLength(4)
    expect(ordered.slice(0, 2).map(e => e.difficultyLevel)).toEqual(['INTERMEDIATE', 'INTERMEDIATE'])
  })
  it('is deterministic for a fixed seed', () => {
    expect(orderPoolByDifficultyPreference(pool, 'BEGINNER', 7)).toEqual(orderPoolByDifficultyPreference(pool, 'BEGINNER', 7))
  })
})

describe('poolItemMatchesCircuitFocus', () => {
  it('maps circuit focus types onto exercise metadata', () => {
    const cooldown = { bodyRegion: ['LOWER_BODY'], exercisePhases: ['MOBILITY'] }
    const lower = { bodyRegion: ['LOWER_BODY'], exercisePhases: ['STRENGTHENING'] }
    expect(poolItemMatchesCircuitFocus(cooldown, 'COOLDOWN')).toBe(true)
    expect(poolItemMatchesCircuitFocus(lower, 'COOLDOWN')).toBe(false)
    expect(poolItemMatchesCircuitFocus(lower, 'LOWER_BODY')).toBe(true)
    expect(poolItemMatchesCircuitFocus(lower, 'UPPER_BODY')).toBe(false)
    expect(poolItemMatchesCircuitFocus(lower, 'FULL_BODY')).toBe(true)
    expect(poolItemMatchesCircuitFocus(lower, 'CARDIO')).toBe(true)
  })
})

describe('poolItemFitsCircuit', () => {
  it('rejects stretches and drills from working circuits but allows them in warm-up/cool-down', () => {
    const stretch = { bodyRegion: ['CORE'], exercisePhases: ['COOLDOWN'] }
    const plank = { bodyRegion: ['CORE'], exercisePhases: ['STRENGTHENING'] }
    const untagged = { bodyRegion: ['CORE'], exercisePhases: [] }
    expect(poolItemFitsCircuit(stretch, 'CORE')).toBe(false)
    expect(poolItemFitsCircuit(stretch, 'COOLDOWN')).toBe(true)
    expect(poolItemFitsCircuit(plank, 'CORE')).toBe(true)
    expect(poolItemFitsCircuit(untagged, 'CORE')).toBe(true)
    expect(poolItemFitsCircuit({ bodyRegion: ['LOWER_BODY'], exercisePhases: ['STRENGTHENING'] }, 'UPPER_BODY')).toBe(false)
  })
  it('flags early-rehab stages', () => {
    expect(isEarlyRehabExercise({ rehabStage: 'EARLY_REHAB' })).toBe(true)
    expect(isEarlyRehabExercise({ rehabStage: 'Subacute' })).toBe(true)
    expect(isEarlyRehabExercise({ rehabStage: 'MID_REHAB' })).toBe(false)
    expect(isEarlyRehabExercise({ rehabStage: null })).toBe(false)
  })
})

describe('poolItemFitsCircuit — warm-up and cool-down', () => {
  it('accepts mobility work in a warm-up but not a loaded strength exercise or a static stretch', () => {
    expect(poolItemFitsCircuit({ bodyRegion: ['LOWER_BODY'], exercisePhases: ['MOBILITY'] }, 'WARMUP')).toBe(true)
    expect(poolItemFitsCircuit({ bodyRegion: ['LOWER_BODY'], exercisePhases: ['STRENGTHENING'] }, 'WARMUP')).toBe(false)
    expect(poolItemFitsCircuit({ bodyRegion: ['LOWER_BODY'], exercisePhases: ['COOLDOWN'] }, 'WARMUP')).toBe(false)
  })
  it('accepts a gentle balance hold as a cool-down but not a strength exercise', () => {
    expect(poolItemFitsCircuit({ bodyRegion: ['BALANCE'], exercisePhases: ['ACTIVATION'] }, 'COOLDOWN')).toBe(true)
    expect(poolItemFitsCircuit({ bodyRegion: ['UPPER_BODY', 'CORE'], exercisePhases: ['STRENGTHENING'] }, 'COOLDOWN')).toBe(false)
  })
})

describe('scoreCircuitRelevance', () => {
  it('prefers primary-region strengthening work in a working circuit and penalises early-rehab content for healthy clients', () => {
    const row = { bodyRegion: ['UPPER_BODY'], exercisePhases: ['STRENGTHENING'], rehabStage: null }
    const balanceDrill = { bodyRegion: ['BALANCE'], exercisePhases: ['ACTIVATION'], rehabStage: 'EARLY_REHAB' }
    expect(scoreCircuitRelevance(row, 'UPPER_BODY', ['UPPER_BODY'], 'PERFORMANCE'))
      .toBeGreaterThan(scoreCircuitRelevance(balanceDrill, 'UPPER_BODY', ['UPPER_BODY'], 'PERFORMANCE'))
  })
  it('prefers warm-ups that prepare the regions the session trains', () => {
    const shoulderPrep = { bodyRegion: ['UPPER_BODY'], exercisePhases: ['WARMUP'] }
    const anklePumps = { bodyRegion: ['LOWER_BODY'], exercisePhases: ['WARMUP'] }
    expect(scoreCircuitRelevance(shoulderPrep, 'WARMUP', ['UPPER_BODY'], 'CLINICAL'))
      .toBeGreaterThan(scoreCircuitRelevance(anklePumps, 'WARMUP', ['UPPER_BODY'], 'CLINICAL'))
  })
})

describe('inferEquipmentFromName / filterByEquipment name safety net', () => {
  it('infers equipment the name implies', () => {
    expect(inferEquipmentFromName('Seated Leg Press on Insignia Machine')).toEqual(['machine'])
    expect(inferEquipmentFromName('Adductor Release with Foam Roller')).toEqual(['foam roller'])
    expect(inferEquipmentFromName('Bodyweight Squat')).toEqual([])
    expect(inferEquipmentFromName('IT Band Stretch')).toEqual([])
  })
  it('excludes an untagged machine exercise from a bodyweight-only pool', () => {
    const machine = { id: 'm', name: 'Seated Leg Press on Insignia Machine', equipmentRequired: [] }
    const squat = { id: 's', name: 'Bodyweight Squat', equipmentRequired: [] }
    expect(filterByEquipment([machine, squat], ['none']).map(e => e.id)).toEqual(['s'])
    expect(filterByEquipment([machine, squat], ['Dumbbells']).map(e => e.id)).toEqual(['s'])
  })
})

describe('scoreCircuitRelevance — conservative substitutes', () => {
  it('never prefers a plyometric drill for a clinical or beginner program', () => {
    const skip = { name: 'A Skip', bodyRegion: ['LOWER_BODY'], exercisePhases: ['WARMUP'], difficultyLevel: 'BEGINNER' }
    const march = { name: 'Standing March', bodyRegion: ['LOWER_BODY'], exercisePhases: ['WARMUP'], difficultyLevel: 'BEGINNER' }
    expect(scoreCircuitRelevance(march, 'WARMUP', ['LOWER_BODY'], 'CLINICAL', 'BEGINNER'))
      .toBeGreaterThan(scoreCircuitRelevance(skip, 'WARMUP', ['LOWER_BODY'], 'CLINICAL', 'BEGINNER'))
  })
  it('penalises rehab-flavoured names for healthy clients and difficulty mismatches', () => {
    const rehab = { name: 'Anterior Tibialis Tendonitis Rehab Exercise', bodyRegion: ['LOWER_BODY'], exercisePhases: ['WARMUP'], difficultyLevel: 'BEGINNER' }
    const march = { name: 'Standing March', bodyRegion: ['LOWER_BODY'], exercisePhases: ['WARMUP'], difficultyLevel: 'BEGINNER' }
    const advanced = { name: 'Standing March', bodyRegion: ['LOWER_BODY'], exercisePhases: ['WARMUP'], difficultyLevel: 'ADVANCED' }
    expect(scoreCircuitRelevance(march, 'WARMUP', ['LOWER_BODY'], 'PERFORMANCE', 'BEGINNER'))
      .toBeGreaterThan(scoreCircuitRelevance(rehab, 'WARMUP', ['LOWER_BODY'], 'PERFORMANCE', 'BEGINNER'))
    expect(scoreCircuitRelevance(march, 'WARMUP', ['LOWER_BODY'], 'PERFORMANCE', 'BEGINNER'))
      .toBeGreaterThan(scoreCircuitRelevance(advanced, 'WARMUP', ['LOWER_BODY'], 'PERFORMANCE', 'BEGINNER'))
  })
})
