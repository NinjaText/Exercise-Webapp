/** Sentinel the equipment picker uses for "bodyweight only". */
export const NO_EQUIPMENT_OPTION = 'none'

/**
 * Maps a client's stored equipment onto the exercise library's equipment
 * vocabulary so the program form can pre-select the matching picker options.
 *
 * Client profiles record equipment from the fixed onboarding list
 * (COMMON_EQUIPMENT), which can differ in casing from the distinct values found
 * on exercises — so matching is case-insensitive and the library's spelling
 * wins. An unmatched item is kept verbatim rather than dropped, so the trainer
 * can still see (and remove) what the client reported. "None" collapses to the
 * picker's bodyweight-only sentinel, which is mutually exclusive with real
 * equipment.
 */
export function mapClientEquipmentToOptions(
  clientEquipment: string[] | undefined,
  libraryOptions: string[],
): string[] {
  const reported = (clientEquipment ?? []).map((item) => item.trim()).filter(Boolean)
  if (reported.length === 0) return []

  const bySpelling = new Map(libraryOptions.map((option) => [option.toLowerCase(), option]))

  const realItems: string[] = []
  let reportedNone = false

  for (const item of reported) {
    const key = item.toLowerCase()
    if (key === NO_EQUIPMENT_OPTION) {
      reportedNone = true
      continue
    }
    realItems.push(bySpelling.get(key) ?? item)
  }

  if (realItems.length > 0) return [...new Set(realItems)]
  return reportedNone ? [NO_EQUIPMENT_OPTION] : []
}

export function aggregateProgramEquipment(workouts: Record<string, unknown>[]): string[] {
  const all = workouts
    .flatMap((w) => (w.blocks as Record<string, unknown>[]) ?? [])
    .flatMap((b) => (b.exercises as Record<string, unknown>[]) ?? [])
    .flatMap((be) => {
      const ex = be.exercise as Record<string, unknown> | null
      return (ex?.equipmentRequired as string[]) ?? []
    })
    .filter((eq) => eq && eq.toLowerCase() !== 'none')

  return [...new Set(all)].sort()
}
