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

export interface CircuitFocusPoolItem {
  bodyRegion: string[]
  exercisePhases: string[]
}

/**
 * Whether an exercise is a plausible candidate for a circuit of the given
 * focusType. Mirrors the "Circuit focus guidelines" given to the model, so
 * the pool offered for a circuit actually contains candidates for it (a
 * LOWER_BODY-only pool has almost nothing usable for a COOLDOWN or CORE
 * block). CARDIO and unknown labels accept anything — no metadata narrows
 * them usefully.
 */
export function poolItemMatchesCircuitFocus(item: CircuitFocusPoolItem, focusType: string): boolean {
  switch (focusType.toUpperCase()) {
    case 'WARMUP':
      return item.exercisePhases.includes('WARMUP') || item.exercisePhases.includes('ACTIVATION')
    case 'COOLDOWN':
      return item.exercisePhases.includes('COOLDOWN') || item.exercisePhases.includes('MOBILITY')
    case 'FLEXIBILITY':
      return item.exercisePhases.includes('MOBILITY') || item.bodyRegion.includes('FLEXIBILITY')
    case 'LOWER_BODY':
      return item.bodyRegion.includes('LOWER_BODY')
    case 'UPPER_BODY':
      return item.bodyRegion.includes('UPPER_BODY')
    case 'CORE':
      return item.bodyRegion.includes('CORE')
    case 'BALANCE':
      return item.bodyRegion.includes('BALANCE')
    case 'FULL_BODY':
      return ['FULL_BODY', 'LOWER_BODY', 'UPPER_BODY', 'CORE'].some(r => item.bodyRegion.includes(r))
    default:
      return true
  }
}

const STRENGTH_LIKE_CIRCUITS = new Set(['LOWER_BODY', 'UPPER_BODY', 'CORE', 'FULL_BODY', 'BALANCE'])
const WORKING_PHASES = new Set(['STRENGTHENING', 'ACTIVATION'])

/**
 * Stricter than poolItemMatchesCircuitFocus: a strength-type circuit (or a
 * balance block) must hold exercises that actually load or activate — an
 * exercise tagged only WARMUP/COOLDOWN/MOBILITY is a stretch or drill and
 * does not belong in a "Main Circuit". Untagged exercises are allowed.
 */
export function poolItemFitsCircuit(item: CircuitFocusPoolItem, focusType: string): boolean {
  const focus = focusType.toUpperCase()
  if (item.exercisePhases.length === 0) return poolItemMatchesCircuitFocus(item, focus)
  switch (focus) {
    case 'WARMUP':
      // Preparation work: warm-up, activation or mobility. A pure loaded
      // strength exercise or a static cool-down stretch does not belong.
      return item.exercisePhases.some(p => p === 'WARMUP' || p === 'ACTIVATION' || p === 'MOBILITY')
    case 'COOLDOWN':
      // Recovery work: stretches, mobility, or gentle balance/flexibility.
      return (
        item.exercisePhases.some(p => p === 'COOLDOWN' || p === 'MOBILITY') ||
        item.bodyRegion.includes('FLEXIBILITY') ||
        (item.bodyRegion.includes('BALANCE') && !item.exercisePhases.includes('STRENGTHENING'))
      )
    default:
      if (!poolItemMatchesCircuitFocus(item, focus)) return false
      if (!STRENGTH_LIKE_CIRCUITS.has(focus)) return true
      return item.exercisePhases.some(p => WORKING_PHASES.has(p))
  }
}

const REGION_CIRCUITS: Record<string, string> = {
  LOWER_BODY: 'LOWER_BODY',
  UPPER_BODY: 'UPPER_BODY',
  CORE: 'CORE',
  BALANCE: 'BALANCE',
  FLEXIBILITY: 'FLEXIBILITY',
}

const EARLY_REHAB_STAGES = new Set(['EARLY_REHAB', 'ACUTE', 'SUBACUTE'])

/** Early-stage rehab content (heel slides, ankle pumps, pelvic tilts…). */
export function isEarlyRehabExercise(item: { rehabStage?: string | null }): boolean {
  return !!item.rehabStage && EARLY_REHAB_STAGES.has(item.rehabStage.toUpperCase())
}

const PLYO_OR_IMPACT_NAME = /\b(plyo\w*|jump\w*|hop\w*|bound(?:ing|s)?|pogo\w*|skater\w*|skips?|skipping|sprint\w*|bounds?)\b/i
const REHAB_FLAVOURED_NAME = /\b(rehab\w*|tendonitis|tendinopathy|therapy|pain relief|post-?op\w*|self-mobili[sz]ation|pumps?)\b/i

/** Jump / hop / bound / skip / sprint drills, by name. */
export function isPlyometricName(name: string): boolean {
  return PLYO_OR_IMPACT_NAME.test(name)
}

/** Names that announce themselves as rehab content ("…Tendonitis Rehab Exercise", "Ankle Pumps"). */
export function isRehabFlavouredName(name: string): boolean {
  return REHAB_FLAVOURED_NAME.test(name)
}
const DIFFICULTY_RANK_FOR_SCORE: Record<string, number> = { BEGINNER: 0, INTERMEDIATE: 1, ADVANCED: 2 }

export interface RelevanceScoreItem extends CircuitFocusPoolItem {
  name?: string
  rehabStage?: string | null
  difficultyLevel?: string | null
}

/**
 * How well a (fitting) exercise suits a circuit, used to pick the best
 * replacement when a model-chosen exercise has to be swapped. Higher is
 * better. `sessionRegions` are the regions the session's working circuits
 * train, so warm-ups and cool-downs prefer exercises for those regions.
 * Conservative by design: a deterministic backstop must never introduce
 * plyometrics into a clinical or beginner program, rehab drills into a
 * healthy client's program, or the wrong difficulty tier.
 */
export function scoreCircuitRelevance(
  item: RelevanceScoreItem,
  focusType: string,
  sessionRegions: string[],
  programMode: 'CLINICAL' | 'PERFORMANCE',
  requestedDifficulty?: string
): number {
  const focus = focusType.toUpperCase()
  let score = 0
  const region = REGION_CIRCUITS[focus]
  if (region) {
    if (item.bodyRegion[0] === region) score += 2
    else if (item.bodyRegion.includes(region)) score += 1
  }
  if (focus === 'FULL_BODY') {
    const working = item.bodyRegion.filter(r => ['FULL_BODY', 'LOWER_BODY', 'UPPER_BODY', 'CORE'].includes(r))
    if (item.bodyRegion.includes('FULL_BODY') || working.length >= 2) score += 2
  }
  if (STRENGTH_LIKE_CIRCUITS.has(focus) && focus !== 'BALANCE') {
    if (item.exercisePhases.includes('STRENGTHENING')) score += 3
    if (item.bodyRegion.length === 1 && item.bodyRegion[0] === 'BALANCE') score -= 2
  }
  if (focus === 'WARMUP') {
    if (item.exercisePhases.includes('WARMUP')) score += 1
    if (item.bodyRegion.some(r => sessionRegions.includes(r))) score += 2
  }
  if (focus === 'COOLDOWN') {
    if (item.exercisePhases.includes('COOLDOWN')) score += 1
    if (item.bodyRegion.some(r => sessionRegions.includes(r))) score += 2
  }
  const name = item.name ?? ''
  const beginner = requestedDifficulty?.toUpperCase() === 'BEGINNER'
  if (PLYO_OR_IMPACT_NAME.test(name)) score -= programMode === 'CLINICAL' || beginner ? 5 : 1
  if (programMode === 'PERFORMANCE') {
    if (isEarlyRehabExercise(item)) score -= 3
    if (REHAB_FLAVOURED_NAME.test(name)) score -= 4
  }
  if (requestedDifficulty && item.difficultyLevel) {
    const want = DIFFICULTY_RANK_FOR_SCORE[requestedDifficulty.toUpperCase()]
    const have = DIFFICULTY_RANK_FOR_SCORE[item.difficultyLevel.toUpperCase()]
    if (want !== undefined && have !== undefined) score -= Math.abs(want - have)
  }
  return score
}

const DIFFICULTY_RANK: Record<string, number> = { BEGINNER: 0, INTERMEDIATE: 1, ADVANCED: 2 }

/**
 * Orders a pool so exercises at the requested difficulty come first, then
 * the adjacent levels, with a seeded shuffle inside each tier so the same
 * first-N rows aren't offered on every generation. Difficulty is a
 * preference here, never a hard filter — a hard filter left ADVANCED
 * upper-body pools with 4 exercises (0 with dumbbells only).
 */
export function orderPoolByDifficultyPreference<T extends { id: string; difficultyLevel: string | null }>(
  pool: T[],
  requestedDifficulty: string | undefined,
  seed: number = Date.now()
): T[] {
  const target = requestedDifficulty ? DIFFICULTY_RANK[requestedDifficulty.toUpperCase()] : undefined
  const distance = (e: T) => {
    if (target === undefined) return 0
    const rank = e.difficultyLevel ? DIFFICULTY_RANK[e.difficultyLevel.toUpperCase()] : undefined
    return rank === undefined ? 1 : Math.abs(rank - target)
  }
  // Deterministic per-item jitter derived from the seed and id, so tests can
  // pass a fixed seed and callers get a fresh order per generation.
  const jitter = (id: string) => {
    let h = seed >>> 0
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
    return h
  }
  return [...pool].sort((a, b) => distance(a) - distance(b) || jitter(a.id) - jitter(b.id))
}

interface ExerciseWithEquipment {
  id: string
  equipmentRequired: string[]
}

/** Lowercases, trims, and strips an "(optional)" qualifier for comparison. */
export function normalizeEquipmentName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s*\((optional|for balance|for safety|for support)\)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isOptionalEquipment(name: string): boolean {
  return /\(optional\)/i.test(name) || /\boptional\b/i.test(name)
}

const NO_EQUIPMENT_VALUES = new Set(['', 'none', 'bodyweight', 'body weight', 'no equipment'])

const NAME_IMPLIED_EQUIPMENT: { pattern: RegExp; equipment: string }[] = [
  { pattern: /\bdumbbells?\b|\bdb\b/i, equipment: 'dumbbells' },
  { pattern: /\bbarbell\b/i, equipment: 'barbell' },
  { pattern: /\bkettlebell\b/i, equipment: 'kettlebell' },
  { pattern: /\bmed(?:icine)? ball\b/i, equipment: 'medicine ball' },
  { pattern: /\b(?:resistance|mini|loop)\s+band\b|\bbanded\b|\bwith band\b/i, equipment: 'resistance band' },
  { pattern: /\bcable\b/i, equipment: 'cable' },
  { pattern: /\bmachine\b|\blat pulldown\b|\bleg press\b|\bleg curl\b|\bleg extension machine\b/i, equipment: 'machine' },
  { pattern: /\bfoam roll(?:er|ing)?\b/i, equipment: 'foam roller' },
  { pattern: /\btrx\b|\bsuspension\b/i, equipment: 'TRX' },
  { pattern: /\bpull-?up\b|\bchin-?up\b|\bhanging\b/i, equipment: 'pull-up bar' },
  { pattern: /\bbench\b/i, equipment: 'bench' },
  { pattern: /\bbox jump\b|\bstep-?ups?\b/i, equipment: 'step or box' },
  { pattern: /\bstability ball\b|\bswiss ball\b|\bbosu\b/i, equipment: 'stability ball' },
  { pattern: /\bslider\b/i, equipment: 'slider' },
]

/**
 * Equipment an exercise NAME implies ("Seated Leg Press on Insignia Machine",
 * "Adductor Release with Foam Roller"). A safety net for library rows whose
 * equipmentRequired was never filled in.
 */
export function inferEquipmentFromName(name: string): string[] {
  return NAME_IMPLIED_EQUIPMENT.filter(m => m.pattern.test(name)).map(m => m.equipment)
}

/**
 * Keeps only exercises whose required equipment is fully covered by the
 * trainer's selection. Comparison is case-insensitive (the library stores
 * "Dumbbells", "dumbbell" and "dumbbells" as separate values) and items the
 * library marks "(optional)" don't disqualify an exercise. A selection of
 * just "none" means bodyweight only.
 */
export function filterByEquipment<T extends ExerciseWithEquipment & { name?: string }>(
  exercises: T[],
  availableEquipment: string[]
): T[] {
  if (availableEquipment.length === 0) return exercises
  const available = new Set(
    availableEquipment.map(normalizeEquipmentName).filter(e => !NO_EQUIPMENT_VALUES.has(e))
  )
  return exercises.filter(exercise => {
    const tagged = exercise.equipmentRequired
      .filter(e => e && !NO_EQUIPMENT_VALUES.has(normalizeEquipmentName(e)) && !isOptionalEquipment(e))
      .map(normalizeEquipmentName)
    const implied = exercise.name ? inferEquipmentFromName(exercise.name).map(normalizeEquipmentName) : []
    const required = [...new Set([...tagged, ...implied])]
    if (required.length === 0) return true
    return required.every(req =>
      available.has(req) ||
      // "dumbbell" vs "dumbbells", "light dumbbell", "cable or band"
      [...available].some(a => req.includes(a) || a.includes(req))
    )
  })
}
