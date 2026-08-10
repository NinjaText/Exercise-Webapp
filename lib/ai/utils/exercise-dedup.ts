export interface DedupPoolItem {
  id: string
  name: string
  bodyRegion: string[]
}

export interface DedupableExercise {
  exerciseId: string
  exerciseName?: string
}

export interface DedupableDayTemplate<T extends DedupableExercise> {
  dayOfWeek: number
  sessionName?: string
  exercises: T[]
}

/**
 * Guarantees no exerciseId repeats across day templates by swapping any
 * repeat for an unused pool exercise (preferring one sharing a body region
 * with the original), instead of just logging a warning like the old
 * behavior did. If the pool is exhausted, the duplicate is left in place and
 * a warning is logged — this never throws.
 */
export function dedupeAcrossDays<T extends DedupableExercise, P extends DedupPoolItem>(
  templates: DedupableDayTemplate<T>[],
  pool: P[]
): DedupableDayTemplate<T>[] {
  const used = new Set<string>()
  const poolById = new Map(pool.map((p) => [p.id, p]))

  return templates.map((template) => ({
    ...template,
    exercises: template.exercises.map((ex) => {
      if (!used.has(ex.exerciseId)) {
        used.add(ex.exerciseId)
        return ex
      }

      const original = poolById.get(ex.exerciseId)
      const replacement =
        pool.find(
          (p) =>
            !used.has(p.id) &&
            p.id !== ex.exerciseId &&
            (!original || p.bodyRegion.some((r) => original.bodyRegion.includes(r)))
        ) ?? pool.find((p) => !used.has(p.id))

      if (!replacement) {
        console.warn(`[AI] Pool exhausted — duplicate exercise ${ex.exerciseId} left in place`)
        return ex
      }

      used.add(replacement.id)
      return { ...ex, exerciseId: replacement.id, exerciseName: replacement.name }
    }),
  }))
}
