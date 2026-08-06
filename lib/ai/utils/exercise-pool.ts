interface ExerciseWithContraindications {
  id: string
  name: string
  contraindications: string[]
}

export function filterByContraindications<T extends ExerciseWithContraindications>(
  exercises: T[],
  clientLimitations: string[]
): T[] {
  if (clientLimitations.length === 0) return exercises
  return exercises.filter(exercise => {
    const contraLower = exercise.contraindications.map(c => c.toLowerCase())
    return !clientLimitations.some(limitation =>
      contraLower.some(
        contra =>
          contra.includes(limitation.toLowerCase()) ||
          limitation.toLowerCase().includes(contra)
      )
    )
  })
}

interface WeekPoolInput {
  rehabStage: string
  focusAreas: string[]
  derivedIndicationTags: string[]
}

export function buildWeekPoolWhereClause(
  weekPlan: WeekPoolInput,
  usedIds: Set<string>
): Record<string, unknown> {
  const clause: Record<string, unknown> = {
    isActive: true,
    rehabStage: weekPlan.rehabStage,
    bodyRegion: { hasSome: weekPlan.focusAreas },
  }

  if (weekPlan.derivedIndicationTags.length > 0) {
    clause.indicationTags = { hasSome: weekPlan.derivedIndicationTags }
  }

  if (usedIds.size > 0) {
    clause.id = { notIn: [...usedIds] }
  }

  return clause
}

interface ExerciseWithEquipment {
  id: string
  equipmentRequired: string[]
}

export function filterByEquipment<T extends ExerciseWithEquipment>(
  exercises: T[],
  availableEquipment: string[]
): T[] {
  if (availableEquipment.length === 0) return exercises
  return exercises.filter(exercise => {
    const required = exercise.equipmentRequired.filter(
      e => e && e.toLowerCase() !== 'none'
    )
    if (required.length === 0) return true
    return required.every(e => availableEquipment.includes(e))
  })
}
