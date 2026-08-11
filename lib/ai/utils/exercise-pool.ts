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

interface PhasePoolPrimaryInput {
  rehabStage: string
  focusAreas: string[]
  derivedIndicationTags: string[]
}

/**
 * Primary (most specific) exercise-pool query for a phase: exact-matches
 * rehabStage/indicationTags. Only valid when the phase's label is actually
 * a stage stored on Exercise.rehabStage (i.e. one of the clinical stages) —
 * callers must skip straight to buildPhasePoolFallbackWhereClause otherwise.
 */
export function buildPhasePoolPrimaryWhereClause(
  input: PhasePoolPrimaryInput,
  usedIds: Set<string>
): Record<string, unknown> {
  const clause: Record<string, unknown> = {
    isActive: true,
    isAssessment: false,
    rehabStage: input.rehabStage,
    bodyRegion: { hasSome: input.focusAreas },
  }

  if (input.derivedIndicationTags.length > 0) {
    clause.indicationTags = { hasSome: input.derivedIndicationTags }
  }

  if (usedIds.size > 0) {
    clause.id = { notIn: [...usedIds] }
  }

  return clause
}

/**
 * Region-only fallback query, used when the primary query returns too few
 * results (or is skipped entirely for phase labels with no matching
 * Exercise.rehabStage data). Optionally narrows by difficultyLevel.
 */
export function buildPhasePoolFallbackWhereClause(
  focusAreas: string[],
  usedIds: Set<string>,
  difficultyLevel?: string
): Record<string, unknown> {
  const clause: Record<string, unknown> = {
    isActive: true,
    isAssessment: false,
    bodyRegion: { hasSome: focusAreas },
  }

  if (difficultyLevel) {
    clause.difficultyLevel = difficultyLevel
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
