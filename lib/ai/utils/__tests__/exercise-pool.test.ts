import { describe, it, expect } from 'vitest'
import {
  filterByContraindications,
  buildPhasePoolPrimaryWhereClause,
  buildPhasePoolFallbackWhereClause,
  filterByEquipment,
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
