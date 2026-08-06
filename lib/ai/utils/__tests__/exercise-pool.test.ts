import { describe, it, expect } from 'vitest'
import {
  filterByContraindications,
  buildWeekPoolWhereClause,
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

describe('buildWeekPoolWhereClause', () => {
  it('includes rehabStage and indicationTags when provided', () => {
    const weekPlan = {
      rehabStage: 'EARLY_REHAB' as const,
      focusAreas: ['LOWER_BODY'],
      derivedIndicationTags: ['ACL', 'knee'],
    }
    const usedIds = new Set(['abc', 'def'])
    const clause = buildWeekPoolWhereClause(weekPlan, usedIds)

    expect(clause.rehabStage).toBe('EARLY_REHAB')
    expect(clause.bodyRegion).toEqual({ hasSome: ['LOWER_BODY'] })
    expect(clause.indicationTags).toEqual({ hasSome: ['ACL', 'knee'] })
    expect(clause.id).toEqual({ notIn: ['abc', 'def'] })
    expect(clause.isActive).toBe(true)
  })

  it('omits indicationTags filter when derivedIndicationTags is empty', () => {
    const weekPlan = {
      rehabStage: 'MID_REHAB' as const,
      focusAreas: ['UPPER_BODY'],
      derivedIndicationTags: [],
    }
    const clause = buildWeekPoolWhereClause(weekPlan, new Set())
    expect(clause.indicationTags).toBeUndefined()
  })

  it('omits used IDs from the query when set is empty', () => {
    const weekPlan = {
      rehabStage: 'MID_REHAB' as const,
      focusAreas: ['CORE'],
      derivedIndicationTags: ['low-back-pain'],
    }
    const clause = buildWeekPoolWhereClause(weekPlan, new Set())
    expect(clause.id).toBeUndefined()
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
