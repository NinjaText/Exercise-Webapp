import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import type { BodyRegion, Exercise } from "@prisma/client";
import type { ClinicalPlan, ClinicalPlanParams, WeekPlan } from '@/lib/ai/types/program-generation'
import type { ProgramMode } from '@/lib/ai/utils/clinical-context'
import {
  filterByContraindications,
  filterByEquipment,
  orderPoolByDifficultyPreference,
  poolItemMatchesCircuitFocus,
  poolItemFitsCircuit,
  isEarlyRehabExercise,
  isPlyometricName,
  isRehabFlavouredName,
  scoreCircuitRelevance,
} from '@/lib/ai/utils/exercise-pool'
import { determineProgramMode, buildClientContextBlock } from '@/lib/ai/utils/clinical-context'
import { groupWeeksIntoPhases } from '@/lib/ai/utils/program-phasing'
import { computeProgressedRx, isDeloadWeek, type PhaseTemplateExercise } from '@/lib/ai/utils/progression-rules'
import { enforceCircuitExerciseCounts, type CircuitCountPoolItem } from '@/lib/ai/utils/circuit-counts'
import { fitDosageToDuration } from '@/lib/ai/utils/session-duration'
import {
  extractHardConstraints,
  filterPoolByHardConstraints,
  auditAndReplaceViolations,
  exerciseViolatesHardConstraints,
  type HardConstraintCategory,
} from '@/lib/ai/utils/hard-constraints'
import { findTrainerNamedExerciseRequirements, textPrescribesDosage, type TrainerExerciseRequirement } from '@/lib/ai/utils/trainer-named-exercises'
import {
  buildProgramSystemPrompt,
  buildTrainerDirectivesBlock,
  buildVarietyBlock,
  buildFinalAuditBlock,
  buildCircuitCandidateIndex,
  formatCircuitStructure,
  formatExercisePoolLine,
} from '@/lib/ai/prompts/program-generation'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type ExercisePoolItem = {
  id: string
  name: string
  bodyRegion: string[]
  difficultyLevel: string
  equipmentRequired: string[]
  contraindications: string[]
  description: string | null
  musclesTargeted: string[]
  exercisePhases: string[]
  commonMistakes: string | null
  defaultSets: number | null
  defaultReps: number | null
  defaultHoldSeconds: number | null
  cuesThumbnail: string | null
  videoUrl: string | null
  rehabStage: string | null
  indicationTags: string[]
}

interface CircuitConfig {
  name: string;
  focusType: string;
  exerciseCount: number;
  rounds?: number;
  restBetweenRounds?: number | null;
}

interface GenerateWorkoutParams {
  clientId?: string | null;
  programGoals?: string[];         // replaces focusAreas at the form level
  focusAreas?: string[];           // keep for backward compat (brief upload flow still uses it)
  availableEquipment?: string[];   // filters exercise pool to matching gear + bodyweight
  durationMinutes: number;
  daysPerWeek: number;
  /** Per-circuit configuration — preferred over exercisesPerSession/circuitsPerSession */
  circuits?: CircuitConfig[];
  /** @deprecated Use circuits instead */
  exercisesPerSession?: number;
  /** @deprecated Use circuits instead */
  circuitsPerSession?: number;
  difficultyLevel: string;
  additionalNotes?: string;
  subjective?: string;
  trainerPrompt?: string;
  programTitle?: string;
  preferredWeekdays?: string[];
  weekPlan?: WeekPlan[]
  durationWeeks?: number
  /** Step 1's clinical/performance assessment text — carried through purely for the program description. */
  clinicalAssessment?: string
}

interface GeneratedExercise {
  exerciseId: string;
  exerciseName: string;
  phase: string;
  circuitIndex?: number;
  sets: number;
  reps?: number;
  durationSeconds?: number;
  restSeconds?: number;
  weekIndex?: number;
  dayOfWeek?: number;
  orderIndex: number;
  notes?: string;
  /** Trainer explicitly stated this exercise's sets/reps/hold; keep them fixed. */
  trainerPrescribedDosage?: boolean;
}

interface GeneratedPlan {
  title: string;
  description: string;
  sessions: { dayOfWeek: number; weekIndex?: number; name: string }[];
  exercises: GeneratedExercise[];
  warnings?: string[];
}

/** Map user-facing focus area strings to BodyRegion enum values */
function mapFocusAreasToBodyRegions(focusAreas: string[]): BodyRegion[] {
  const mapping: Record<string, BodyRegion> = {
    lower: "LOWER_BODY",
    "lower body": "LOWER_BODY",
    lower_body: "LOWER_BODY",
    leg: "LOWER_BODY",
    legs: "LOWER_BODY",
    hip: "LOWER_BODY",
    knee: "LOWER_BODY",
    ankle: "LOWER_BODY",
    upper: "UPPER_BODY",
    "upper body": "UPPER_BODY",
    upper_body: "UPPER_BODY",
    arm: "UPPER_BODY",
    arms: "UPPER_BODY",
    shoulder: "UPPER_BODY",
    wrist: "UPPER_BODY",
    core: "CORE",
    abdominal: "CORE",
    back: "CORE",
    "lower back": "CORE",
    balance: "BALANCE",
    flexibility: "FLEXIBILITY",
    stretch: "FLEXIBILITY",
    stretching: "FLEXIBILITY",
    "full body": "FULL_BODY",
    full_body: "FULL_BODY",
    general: "FULL_BODY",
  };

  const regions = new Set<BodyRegion>();
  for (const area of focusAreas) {
    const lower = area.toLowerCase().trim();
    if (mapping[lower]) {
      regions.add(mapping[lower]);
    }
    // Also check partial matches
    for (const [key, region] of Object.entries(mapping)) {
      if (lower.includes(key) || key.includes(lower)) {
        regions.add(region);
      }
    }
  }

  // If no mapping found, return all regions
  if (regions.size === 0) {
    return [
      "LOWER_BODY",
      "UPPER_BODY",
      "CORE",
      "FULL_BODY",
      "BALANCE",
      "FLEXIBILITY",
    ];
  }

  return Array.from(regions);
}

/** Phase ordering for post-processing */
const PHASE_ORDER: Record<string, number> = {
  WARMUP: 0,
  ACTIVATION: 1,
  STRENGTHENING: 2,
  MOBILITY: 3,
  COOLDOWN: 4,
};

export function normalizeExerciseName(name: string) {
  return name
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export type ExerciseMatchFlag = "needs_review" | "not_in_library" | "not_in_document";

export type ExerciseMatchCandidate = {
  exerciseId: string;
  exerciseName: string;
  score: number;
};

export type ExerciseMatchResult = {
  exerciseId: string | null;
  matchType: "exact" | "needs_review" | "not_in_library";
  candidates: ExerciseMatchCandidate[];
};

const AUTO_ACCEPT_SCORE = 0.9;
const NEEDS_REVIEW_SCORE = 0.5;
const SUBSTRING_MATCH_SCORE = 0.85;

/**
 * Private scoring function for resolveExerciseMatch.
 * Uses space-gated substring matching (multi-word substrings only) and
 * harmonic-mean-style token overlap to distinguish single-word overlaps
 * from true substring matches.
 */
function singularizeTokens(name: string): string {
  return name
    .split(" ")
    .map((t) => (t.length > 3 && t.endsWith("s") && !t.endsWith("ss") ? t.slice(0, -1) : t))
    .join(" ");
}

function scoreExerciseMatchSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  // "Band Pull-Aparts" vs "Band Pull-Apart" is the same exercise.
  if (singularizeTokens(a) === singularizeTokens(b)) return 1;
  // One name contains the other as a multi-word phrase ("Push-Up" inside
  // "Wall Push-Up", "Back Squat" inside "Barbell Back Squat"). The extra
  // words are usually a modifier that changes the exercise (wall, assisted,
  // chair, single-leg), so this scores just below the auto-accept threshold
  // and lands in the trainer's review queue with the candidate pre-selected.
  if ((a.includes(b) && b.includes(" ")) || (b.includes(a) && a.includes(" "))) return SUBSTRING_MATCH_SCORE;
  const aTokens = new Set(a.split(" "));
  const bTokens = new Set(b.split(" "));
  let overlap = 0;
  for (const t of aTokens) if (bTokens.has(t)) overlap += 1;
  return (2 * overlap) / Math.max(1, aTokens.size + bTokens.size);
}

/**
 * Deterministic, LLM-free exercise-name matching against the library.
 * Exact/near-exact matches (score >= AUTO_ACCEPT_SCORE) auto-accept silently.
 * Everything below that is left for the trainer to resolve in the review
 * screen instead of a silent AI best-guess substitution.
 */
export function resolveExerciseMatch(
  name: string,
  candidates: Exercise[]
): ExerciseMatchResult {
  const normalizedTarget = normalizeExerciseName(name);

  const exact = candidates.find(
    (e) => normalizeExerciseName(e.name) === normalizedTarget
  );
  if (exact) {
    return { exerciseId: exact.id, matchType: "exact", candidates: [] };
  }

  const ranked = candidates
    .map((e) => ({
      exercise: e,
      score: scoreExerciseMatchSimilarity(normalizeExerciseName(e.name), normalizedTarget),
    }))
    .sort((a, b) => b.score - a.score);

  if (!ranked.length) {
    return { exerciseId: null, matchType: "not_in_library", candidates: [] };
  }

  const top = ranked.slice(0, 5).map((r) => ({
    exerciseId: r.exercise.id,
    exerciseName: r.exercise.name,
    score: r.score,
  }));

  const best = ranked[0];
  if (best.score >= AUTO_ACCEPT_SCORE) {
    return { exerciseId: best.exercise.id, matchType: "exact", candidates: [] };
  }
  if (best.score >= NEEDS_REVIEW_SCORE) {
    return { exerciseId: best.exercise.id, matchType: "needs_review", candidates: top };
  }
  return { exerciseId: null, matchType: "not_in_library", candidates: top };
}

export type PreviewExercise = {
  exerciseId: string | null;
  exerciseName?: string;
  orderIndex: number;
  sets: number;
  reps: string;
  notes?: string;
  restSeconds?: number;
  flags: ExerciseMatchFlag[];
  matchCandidates: ExerciseMatchCandidate[];
};

export type PreviewBlock = {
  type: string;
  name?: string;
  circuitIndex?: number;
  orderIndex: number;
  rounds?: number;
  restBetweenRounds?: number | null;
  exercises: PreviewExercise[];
};

export type PreviewWorkout = {
  name: string;
  dayIndex: number;
  weekIndex: number;
  blocks: PreviewBlock[];
};

export type PreviewGeneratedProgram = {
  name: string;
  description?: string;
  workouts: PreviewWorkout[];
};

const EXERCISE_POOL_SELECT = {
  id: true, name: true, bodyRegion: true, difficultyLevel: true,
  equipmentRequired: true, contraindications: true, description: true,
  musclesTargeted: true, exercisePhases: true, commonMistakes: true,
  defaultSets: true, defaultReps: true, defaultHoldSeconds: true,
  cuesThumbnail: true, videoUrl: true, rehabStage: true, indicationTags: true,
}

const VALID_BODY_REGIONS = new Set(['LOWER_BODY', 'UPPER_BODY', 'CORE', 'FULL_BODY', 'BALANCE', 'FLEXIBILITY'])

// Phase labels with no corresponding Exercise.rehabStage data — querying on
// them would always miss and fall straight back to the region-only query, so
// skip the wasted attempt and filter by difficultyLevel instead.
const NON_EXACT_MATCHABLE_STAGES = new Set(['MAINTENANCE', 'BASE_BUILD', 'BUILD', 'PEAK', 'TAPER', 'GENERAL_FITNESS'])

// ---------------------------------------------------------------------------
// Exercise pool assembly (shared by both generation paths)
// ---------------------------------------------------------------------------

/** Pool items handed to deterministic backfill — the full pool item is
 *  always passed at runtime; cuesThumbnail gives a backfilled exercise a cue. */
type BackfillPoolItem = CircuitCountPoolItem & { cuesThumbnail?: string | null }

/** Upper bound on pool lines sent to the model per call. */
const POOL_CAP = 120
/** Below this, the keyword hard-constraint pre-filter is skipped (prompt + audit still apply). */
const MIN_ELIGIBLE_POOL_SIZE = 10

async function fetchActiveExerciseLibrary(): Promise<ExercisePoolItem[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (await (prisma.exercise.findMany as any)({
    where: { isActive: true, isAssessment: false },
    select: EXERCISE_POOL_SELECT,
  })) as ExercisePoolItem[]
}

interface PoolAssemblyInput {
  candidates: ExercisePoolItem[]
  /** Candidates that should sort ahead of the rest (e.g. exact rehab-stage matches). */
  priorityIds?: Set<string>
  circuits: CircuitConfig[]
  programMode: ProgramMode
  clientLimitations: string[]
  availableEquipment: string[]
  requestedDifficulty?: string
  hardConstraints: HardConstraintCategory[]
  /** Trainer-named exercises: bypass equipment/difficulty/cap, never safety filters. */
  pinned: ExercisePoolItem[]
  seed?: number
}

interface AssembledPool {
  pool: ExercisePoolItem[]
  hardConstraintFilterApplied: boolean
}

/**
 * Turns a raw candidate set into the pool offered to the model:
 *   1. dedupe → contraindication filter → equipment filter
 *   2. keyword hard-constraint pre-filter (skipped if it would starve the pool)
 *   3. order by difficulty preference (soft), priority tier first, seeded jitter
 *   4. guarantee candidates for every configured circuit focus, then fill to cap
 *   5. prepend trainer-named exercises
 */
function assembleExercisePool(input: PoolAssemblyInput): AssembledPool {
  const byId = new Map<string, ExercisePoolItem>()
  for (const c of input.candidates) byId.set(c.id, c)
  let pool = [...byId.values()]

  pool = filterByContraindications(pool, input.clientLimitations)
  pool = filterByEquipment(pool, input.availableEquipment)

  let hardConstraintFilterApplied = false
  if (input.hardConstraints.length > 0) {
    const filtered = filterPoolByHardConstraints(pool, input.hardConstraints)
    if (filtered.length >= MIN_ELIGIBLE_POOL_SIZE) {
      pool = filtered
      hardConstraintFilterApplied = true
    }
  }

  const ordered = orderPoolByDifficultyPreference(pool, input.requestedDifficulty, input.seed)
  if (input.programMode === 'PERFORMANCE') {
    // Healthy client: early-rehab content (ankle pumps, pelvic tilts…) sorts
    // last so it only reaches the offered pool when nothing else is left.
    ordered.sort((a, b) => Number(isEarlyRehabExercise(a)) - Number(isEarlyRehabExercise(b)))
  }
  if (input.priorityIds && input.priorityIds.size > 0) {
    const priority = input.priorityIds
    ordered.sort((a, b) => Number(priority.has(b.id)) - Number(priority.has(a.id)))
  }

  const selected: ExercisePoolItem[] = []
  const selectedIds = new Set<string>()
  const take = (item: ExercisePoolItem) => {
    if (selectedIds.has(item.id)) return
    selected.push(item)
    selectedIds.add(item.id)
  }
  for (const circuit of input.circuits) {
    const want = Math.max(8, circuit.exerciseCount * 4)
    let taken = 0
    for (const item of ordered) {
      if (taken >= want) break
      if (selectedIds.has(item.id)) continue
      if (poolItemFitsCircuit(item, circuit.focusType)) {
        take(item)
        taken++
      }
    }
  }
  for (const item of ordered) {
    if (selected.length >= POOL_CAP) break
    take(item)
  }

  const pinnedEligible = filterByContraindications(input.pinned, input.clientLimitations).filter(
    p => !exerciseViolatesHardConstraints(p.name, input.hardConstraints)
  )
  const finalPool = [...pinnedEligible.filter(p => !selectedIds.has(p.id)), ...selected]
  return { pool: finalPool, hardConstraintFilterApplied }
}

function regionsOverlap(item: ExercisePoolItem, regions: string[]): boolean {
  return item.bodyRegion.some(r => regions.includes(r))
}

/**
 * Drops repeats within one session, keeping the first occurrence. Matches on
 * exerciseId AND on normalized name — the library holds several entries
 * with identical names (e.g. two "Scapular Retraction" rows).
 */
function dedupeWithinSession<T extends { exerciseId: string }>(
  exercises: T[],
  nameOf: (exerciseId: string) => string | undefined = () => undefined
): T[] {
  const seenIds = new Set<string>()
  const seenNames = new Set<string>()
  return exercises.filter(e => {
    // Word order and plurals don't make a different exercise:
    // "McGill Curl-Up" == "Curl-Ups (McGill)", "Glute Bridges" == "Glute Bridge".
    const raw = nameOf(e.exerciseId)?.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    const name = raw ? singularizeTokens(raw).split(' ').sort().join(' ') : undefined
    if (seenIds.has(e.exerciseId) || (name && seenNames.has(name))) return false
    seenIds.add(e.exerciseId)
    if (name) seenNames.add(name)
    return true
  })
}

/**
 * Deterministic backstop for circuit content: an exercise that does not fit
 * its circuit (a stretch in a strength block, a lower-body move in an
 * UPPER_BODY circuit, a non-balance exercise in a BALANCE block) is swapped
 * for a fitting pool exercise not yet used in that session. Trainer-required
 * exercises are exempt — the trainer placed them deliberately.
 */
/**
 * Program-aware circuit fit, shared by the candidate index the model sees,
 * the post-generation fit pass, and the count backfill — so all three agree
 * on what belongs in a circuit for THIS program:
 *  - base: poolItemFitsCircuit (phase/region rules)
 *  - healthy client: no rehab-flavoured names in working circuits
 *  - clinical or beginner program: no jump/hop/skip drills unless the trainer
 *    asked for power/plyometric work
 *  - warm-up / cool-down: prefer exercises for the regions this session trains,
 *    falling back to the base rule when that leaves too few candidates
 */
function makeCircuitFitPredicate(
  pool: ExercisePoolItem[],
  circuits: CircuitConfig[],
  programMode: ProgramMode,
  requestedDifficulty: string | undefined,
  allowPlyometrics: boolean
): (item: { name: string; bodyRegion: string[]; exercisePhases: string[] }, focusType: string) => boolean {
  const sessionRegions = new Set(circuits.flatMap(c => WORKING_CIRCUIT_REGIONS[c.focusType] ?? []))
  const beginner = requestedDifficulty?.toUpperCase() === 'BEGINNER'
  const restrictPlyo = !allowPlyometrics && (programMode === 'CLINICAL' || beginner)

  const strict = (item: { name: string; bodyRegion: string[]; exercisePhases: string[] }, focusType: string): boolean => {
    if (!poolItemFitsCircuit(item, focusType)) return false
    const focus = focusType.toUpperCase()
    if (restrictPlyo && isPlyometricName(item.name)) return false
    if (programMode === 'PERFORMANCE' && isRehabFlavouredName(item.name)) return false
    if ((focus === 'WARMUP' || focus === 'COOLDOWN') && sessionRegions.size > 0) {
      const relevant = item.bodyRegion.some(r => sessionRegions.has(r) || r === 'FULL_BODY' || (focus === 'COOLDOWN' && r === 'FLEXIBILITY'))
      if (!relevant) return false
    }
    return true
  }
  // Fall back per focus type when the strict rule starves a circuit.
  const enoughStrict = new Map<string, boolean>()
  for (const c of circuits) {
    const strictCount = pool.filter(item => strict(item, c.focusType)).length
    enoughStrict.set(c.focusType.toUpperCase(), strictCount >= Math.max(6, c.exerciseCount * 2))
  }
  return (item, focusType) =>
    enoughStrict.get(focusType.toUpperCase()) === false
      ? poolItemFitsCircuit(item, focusType) && !(restrictPlyo && isPlyometricName(item.name))
      : strict(item, focusType)
}

const WORKING_CIRCUIT_REGIONS: Record<string, string[]> = {
  LOWER_BODY: ['LOWER_BODY'],
  UPPER_BODY: ['UPPER_BODY'],
  CORE: ['CORE'],
  FULL_BODY: ['FULL_BODY', 'LOWER_BODY', 'UPPER_BODY', 'CORE'],
  BALANCE: ['BALANCE', 'LOWER_BODY'],
}

function enforceCircuitFit<T extends { exerciseId: string; circuitIndex?: number }>(
  exercisesByDay: Map<number, T[]>,
  circuits: CircuitConfig[],
  pool: ExercisePoolItem[],
  requiredIds: Set<string>,
  programMode: ProgramMode,
  requestedDifficulty: string | undefined,
  fits: (item: ExercisePoolItem, focusType: string) => boolean,
  createExercise: (poolItem: ExercisePoolItem, circuitIndex: number, orderIndex: number, dayOfWeek: number) => T
): { exercisesByDay: Map<number, T[]>; swapped: string[] } {
  if (circuits.length === 0) return { exercisesByDay, swapped: [] }
  const poolById = new Map(pool.map(p => [p.id, p]))
  const usedAnywhere = new Set([...exercisesByDay.values()].flat().map(e => e.exerciseId))
  const sessionRegions = [...new Set(circuits.flatMap(c => WORKING_CIRCUIT_REGIONS[c.focusType] ?? []))]
  const swapped: string[] = []
  for (const [day, list] of exercisesByDay) {
    const sessionIds = new Set(list.map(e => e.exerciseId))
    list.forEach((ex, idx) => {
      if (ex.circuitIndex == null || requiredIds.has(ex.exerciseId)) return
      const focus = circuits[ex.circuitIndex]?.focusType
      const item = poolById.get(ex.exerciseId)
      if (!focus || !item || fits(item, focus)) return
      // Best-scoring fitting candidate; prefer one not yet used anywhere in
      // the program, fall back to one merely unused in this session.
      const rank = (p: ExercisePoolItem) =>
        scoreCircuitRelevance(p, focus, sessionRegions, programMode, requestedDifficulty) + (usedAnywhere.has(p.id) ? -1 : 0)
      const replacement = pool
        .filter(p => !sessionIds.has(p.id) && fits(p, focus))
        .sort((a, b) => rank(b) - rank(a))[0]
      if (!replacement) return
      swapped.push(`${item.name} → ${replacement.name} [${focus}]`)
      sessionIds.add(replacement.id)
      usedAnywhere.add(replacement.id)
      list[idx] = createExercise(replacement, ex.circuitIndex, idx, day)
    })
  }
  return { exercisesByDay, swapped }
}

/**
 * Deterministic backstop for trainer-named exercises. An exercise the trainer
 * asked for in "every"/"each" session is inserted into every session that
 * lacks it; any other named exercise is inserted into every session only if
 * the model dropped it entirely (its wording may have been day-specific).
 * Insertion replaces the last non-required exercise of the circuit whose
 * focus best fits the exercise, so circuit counts stay exact.
 */
function enforceRequiredExercises<T extends { exerciseId: string; exerciseName?: string; circuitIndex?: number }>(
  exercisesByDay: Map<number, T[]>,
  requirements: TrainerExerciseRequirement<ExercisePoolItem>[],
  circuits: CircuitConfig[],
  createExercise: (poolItem: ExercisePoolItem, circuitIndex: number | undefined, dayOfWeek: number, existing: T | undefined) => T
): { exercisesByDay: Map<number, T[]>; inserted: string[] } {
  const inserted: string[] = []
  const requiredIds = new Set(requirements.map(r => r.exercise.id))
  const allExercises = [...exercisesByDay.values()].flat()
  const allIds = new Set(allExercises.map(e => e.exerciseId))

  for (const { exercise: req, everySession } of requirements) {
    if (!everySession && allIds.has(req.id)) continue
    // Reuse the model's own instance (cues, trainer-prescribed dosage) when
    // it placed the exercise in at least one session.
    const existing = allExercises.find(e => e.exerciseId === req.id)
    let insertedSomewhere = false
    for (const [day, dayExercises] of exercisesByDay) {
      if (dayExercises.some(e => e.exerciseId === req.id)) continue
      let targetCircuit: number | undefined
      if (circuits.length > 0) {
        const fits = circuits
          .map((c, i) => ({ c, i }))
          .filter(({ c }) => c.focusType !== 'WARMUP' && c.focusType !== 'COOLDOWN' && poolItemMatchesCircuitFocus(req, c.focusType))
        targetCircuit = fits[0]?.i ?? circuits.findIndex(c => c.focusType !== 'WARMUP' && c.focusType !== 'COOLDOWN')
        if (targetCircuit < 0) targetCircuit = 0
      }
      const inTarget = dayExercises
        .map((e, idx) => ({ e, idx }))
        .filter(({ e }) => (targetCircuit === undefined || e.circuitIndex === targetCircuit) && !requiredIds.has(e.exerciseId))
      const victim = inTarget[inTarget.length - 1]
      const replacement = createExercise(req, targetCircuit, day, existing)
      if (victim) dayExercises[victim.idx] = replacement
      else dayExercises.push(replacement)
      insertedSomewhere = true
    }
    if (insertedSomewhere) inserted.push(req.name)
  }
  return { exercisesByDay, inserted }
}

const WEEKDAY_TO_INDEX: Record<string, number> = {
  monday: 0, tuesday: 1, wednesday: 2, thursday: 3, friday: 4, saturday: 5, sunday: 6,
}
const INDEX_TO_WEEKDAY = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function resolveTrainingDayIndices(preferredWeekdays: string[] | undefined, daysPerWeek: number): number[] {
  const preferred = (preferredWeekdays ?? [])
    .map(d => WEEKDAY_TO_INDEX[d.toLowerCase().trim()])
    .filter((d): d is number => Number.isInteger(d))
  const effective = preferred.length > 0
    ? preferred
    : Array.from({ length: Math.max(1, Math.min(daysPerWeek, 7)) }, (_, idx) => idx)
  return Array.from(new Set(effective)).sort((a, b) => a - b)
}

/**
 * Tells the model how much time each exercise slot has to fill so the session
 * lands on the requested duration. Circuit counts and rounds are fixed by the
 * trainer, so reps, holds and rest are the only levers.
 */
function buildTimeBudgetLine(durationMinutes: number, circuits: CircuitConfig[], totalExercisesPerSession: number): string {
  const slots = circuits.length > 0
    ? circuits.reduce((sum, c) => sum + c.exerciseCount * (c.rounds ?? (c.focusType === 'WARMUP' || c.focusType === 'COOLDOWN' ? 1 : 3)), 0)
    : totalExercisesPerSession * 3
  const betweenRounds = circuits.reduce((sum, c) => sum + Math.max(0, (c.rounds ?? 1) - 1) * (c.restBetweenRounds ?? 0), 0)
  const available = Math.max(60, durationMinutes * 60 - betweenRounds)
  const perSlot = Math.round(available / Math.max(1, slots))
  return `Time Budget: ${durationMinutes} min ≈ ${slots} exercise slots (exercises × rounds) → about ${perSlot} seconds of work + rest per slot. Size reps (~3 s each), hold times and restSeconds so each slot uses roughly that budget; do not leave the session far under or over the target.`
}

function circuitFocusToExercisePhase(focusType: string): string {
  return focusType === 'WARMUP' ? 'WARMUP'
    : focusType === 'COOLDOWN' ? 'COOLDOWN'
    : focusType === 'FLEXIBILITY' ? 'MOBILITY'
    : focusType === 'CARDIO' || focusType === 'BALANCE' ? 'ACTIVATION'
    : 'STRENGTHENING'
}

function sortAndReindex(exercises: GeneratedExercise[]): GeneratedExercise[] {
  const sorted = [...exercises].sort((a, b) => {
    const weekDiff = (a.weekIndex ?? 0) - (b.weekIndex ?? 0)
    if (weekDiff !== 0) return weekDiff
    const dayDiff = (a.dayOfWeek ?? 0) - (b.dayOfWeek ?? 0)
    if (dayDiff !== 0) return dayDiff
    if (a.circuitIndex != null && b.circuitIndex != null && a.circuitIndex !== b.circuitIndex) {
      return a.circuitIndex - b.circuitIndex
    }
    const phaseA = PHASE_ORDER[a.phase] ?? 2
    const phaseB = PHASE_ORDER[b.phase] ?? 2
    if (phaseA !== phaseB) return phaseA - phaseB
    return a.orderIndex - b.orderIndex
  })
  let lastKey = ''
  let dayOrder = 0
  for (const ex of sorted) {
    const key = `${ex.weekIndex ?? 0}_${ex.dayOfWeek ?? 0}`
    if (key !== lastKey) { lastKey = key; dayOrder = 0 }
    ex.orderIndex = dayOrder++
  }
  return sorted
}

export async function generateWorkoutPlan(
  params: GenerateWorkoutParams
): Promise<GeneratedPlan> {
  const uniqueWeekdayIndices = resolveTrainingDayIndices(params.preferredWeekdays, params.daysPerWeek)
  const scheduleLabel = uniqueWeekdayIndices.map(i => INDEX_TO_WEEKDAY[i]).join(', ')

  const client = params.clientId
    ? await prisma.user.findUnique({
        where: { id: params.clientId },
        include: { clientProfile: true },
      })
    : null
  const profile = client?.clientProfile ?? null

  const clientLimitations = profile?.limitations
    ? profile.limitations.toLowerCase().split(',').map(s => s.trim()).filter(Boolean)
    : []

  const availableEquipment = params.availableEquipment ?? []
  const clientContext = buildClientContextBlock(client, profile, { trainerSelectedEquipment: availableEquipment })
  const programMode: ProgramMode = params.weekPlan?.[0]?.programMode ?? determineProgramMode(profile)

  const circuits = params.circuits ?? []
  const hasCircuits = circuits.length > 0
  const totalExercisesPerSession = hasCircuits
    ? circuits.reduce((sum, c) => sum + c.exerciseCount, 0)
    : (params.exercisesPerSession ?? 6)

  // One library read serves both paths; every pool below is filtered in memory.
  const library = await fetchActiveExerciseLibrary()
  if (library.length === 0) {
    throw new Error('No active exercises found in the library.')
  }

  const hardConstraints = extractHardConstraints(
    params.subjective,
    params.trainerPrompt,
    params.additionalNotes,
    profile?.limitations
  )
  if (hardConstraints.length > 0) {
    console.log(`[AI] Hard constraints detected: ${hardConstraints.map(c => c.id).join(', ')}`)
  }

  const requiredExerciseRequirements = findTrainerNamedExerciseRequirements(
    [params.subjective, params.trainerPrompt, params.additionalNotes],
    library
  ).filter(r => !exerciseViolatesHardConstraints(r.exercise.name, hardConstraints))
  const requiredExercises = requiredExerciseRequirements.map(r => r.exercise)
  if (requiredExercises.length > 0) {
    console.log(`[AI] Trainer-named exercises pinned into pool: ${requiredExercises.map(e => e.name).join(', ')}`)
  }

  // The model may only mark an exercise as trainer-prescribed when the trainer
  // actually wrote numbers. A named exercise whose clause carried no numbers
  // can never be prescribed; if no trainer text carries numbers at all, the
  // flag is ignored everywhere.
  const trainerTextHasDosage = textPrescribesDosage(params.subjective, params.trainerPrompt, params.additionalNotes)
  const namedWithoutDosage = new Set(requiredExerciseRequirements.filter(r => !r.prescribesDosage).map(r => r.exercise.id))
  const dosageFlagAllowed = (exerciseId: string) => trainerTextHasDosage && !namedWithoutDosage.has(exerciseId)
  const requiredIds = new Set(requiredExercises.map(e => e.id))
  const libraryNameById = new Map(library.map(e => [e.id, e.name]))
  const nameOf = (id: string) => libraryNameById.get(id)

  const allowPlyometrics =
    hardConstraints.every(c => c.id !== 'NO_PLYOMETRICS' && c.id !== 'STRENGTH_ONLY') &&
    /\b(plyo\w*|jump\w*|power|explosive|athletic|sprint\w*|agility)\b/i.test(
      [...(params.programGoals ?? []), params.trainerPrompt ?? '', params.subjective ?? '', params.additionalNotes ?? ''].join(' ')
    )

  const trainerDirectives = buildTrainerDirectivesBlock({
    subjective: params.subjective,
    trainerPrompt: params.trainerPrompt,
    additionalNotes: params.additionalNotes,
    availableEquipment,
    requiredExercises,
  })

  const programParametersBlock = `==================================================
PROGRAM PARAMETERS
==================================================
Program Goals: ${(params.programGoals ?? params.focusAreas ?? []).join(', ') || 'Not specified'}
Duration: Approximately ${params.durationMinutes} minutes per session
Days Per Week: ${params.daysPerWeek}
Difficulty Level: ${params.difficultyLevel}
Allowed Weekdays: ${scheduleLabel} (${uniqueWeekdayIndices.join(', ')})
Total Exercises Per Session: EXACTLY ${totalExercisesPerSession}
${hasCircuits ? `Circuit Structure (EXACT — follow precisely):\n${formatCircuitStructure(circuits)}` : 'Circuits: none configured — use straight sets and sensible phase ordering'}
${buildTimeBudgetLine(params.durationMinutes, circuits, totalExercisesPerSession)}`

  const warnings: string[] = []
  const seed = Date.now()

  // === Multi-week path (Step 1 plan provided) — this is what the Generate-with-AI UI always uses ===
  if (params.weekPlan && params.weekPlan.length > 0) {
    const weekPlans = params.weekPlan
    const phases = groupWeeksIntoPhases(weekPlans)
    const totalWeeks = weekPlans.length

    const phaseResults = await Promise.all(
      phases.map(async (phase, phaseIdx) => {
        const allFocusAreas = [...new Set(phase.weeks.flatMap(w => w.focusAreas))]
        const validRegions = allFocusAreas.filter(r => VALID_BODY_REGIONS.has(r))
        const regionsForQuery = validRegions.length > 0 ? validRegions : [...VALID_BODY_REGIONS]
        const allTags = [...new Set(phase.weeks.flatMap(w => w.derivedIndicationTags))]
        const requestedDifficulty = phase.weeks[0]?.difficultyLevel ?? params.difficultyLevel

        // Exact rehab-stage matches get priority ordering (never exclusivity).
        const stageMatches = NON_EXACT_MATCHABLE_STAGES.has(phase.label)
          ? []
          : library.filter(
              e =>
                e.rehabStage === phase.label &&
                regionsOverlap(e, regionsForQuery) &&
                (allTags.length === 0 || e.indicationTags.some(t => allTags.includes(t)))
            )
        const regionMatches = library.filter(e => regionsOverlap(e, regionsForQuery))
        const circuitMatches = library.filter(e => circuits.some(c => poolItemMatchesCircuitFocus(e, c.focusType)))

        const { pool, hardConstraintFilterApplied } = assembleExercisePool({
          candidates: [...stageMatches, ...regionMatches, ...circuitMatches],
          priorityIds: new Set(stageMatches.map(e => e.id)),
          circuits,
          programMode,
          clientLimitations,
          availableEquipment,
          requestedDifficulty,
          hardConstraints,
          pinned: requiredExercises,
          seed: seed + phaseIdx,
        })
        console.log(`[AI] Phase ${phaseIdx + 1} (${phase.label}) pool: ${pool.length} exercises (stage matches: ${stageMatches.length}, hard-constraint filter ${hardConstraintFilterApplied ? 'applied' : 'skipped'})`)
        const fitsCircuit = makeCircuitFitPredicate(pool, circuits, programMode, requestedDifficulty, allowPlyometrics)
        const sessionRegionsForRank = [...new Set(circuits.flatMap(c => WORKING_CIRCUIT_REGIONS[c.focusType] ?? []))]
        const rankForCircuit = (item: ExercisePoolItem, focusType: string) =>
          scoreCircuitRelevance(item, focusType, sessionRegionsForRank, programMode, requestedDifficulty)

        const systemPrompt = buildProgramSystemPrompt({
          programMode,
          scope: {
            kind: 'PHASE',
            phaseIndex: phase.phaseIndex,
            phaseLabel: phase.label,
            startWeek: phase.startWeek,
            endWeek: phase.endWeek,
            totalWeeks,
          },
          daysPerWeek: params.daysPerWeek,
          dayIndices: uniqueWeekdayIndices,
          totalExercisesPerSession,
          circuits,
        })

        const guidanceLabel = programMode === 'CLINICAL' ? 'Clinical guidance' : 'Coaching guidance'
        const guidanceLines = phase.weeks
          .map(w => `  Week ${w.week}: ${w.clinicalGuidance} (Goal: ${w.progressionGoal})`)
          .join('\n')
        const cautions = [...new Set(phase.weeks.flatMap(w => w.contraindicationsThisWeek))].join(', ') || 'None'
        const isFirstPhase = phaseIdx === 0
        const titleDescriptionFields = isFirstPhase
          ? `"title": "Program title",\n  "description": "2-3 sentence program description",\n  `
          : ''

        const userPrompt = `CURRENT PROGRAM REQUEST — PHASE ${phase.phaseIndex + 1} OF ${phases.length}
Create the exercise selection for this phase using the Inmotus System Programming Rules, Client Context, current trainer information, and supplied exercise library.

${clientContext}

==================================================
PHASE PLAN (approved by the trainer)
==================================================
Phase ${phase.phaseIndex + 1}: ${phase.label} (Weeks ${phase.startWeek}-${phase.endWeek} of ${totalWeeks})
${guidanceLabel} across this phase's weeks:
${guidanceLines}
Cautions this phase: ${cautions}

${programParametersBlock}

${trainerDirectives}
${buildVarietyBlock()}

==================================================
AVAILABLE EXERCISES
==================================================
Use ONLY these exercise IDs (exercises that would violate a hard constraint or need unavailable equipment have already been removed where detectable):
${pool.map(formatExercisePoolLine).join('\n')}

${buildCircuitCandidateIndex(pool, circuits, fitsCircuit)}

${buildFinalAuditBlock()}

==================================================
OUTPUT
==================================================
Respond with this exact JSON structure:
{
  ${titleDescriptionFields}"phaseTitle": "Short phase title",
  "dayTemplates": [
    { "dayOfWeek": ${uniqueWeekdayIndices[0] ?? 0}, "sessionName": "Descriptive session name", "exercises": [
      { "exerciseId": "id from pool", "exerciseName": "name", "phase": "ACTIVATION",
        ${hasCircuits ? '"circuitIndex": 0,' : ''}
        "baseSets": 3, "baseReps": 12, "baseDurationSeconds": null, "restSeconds": 30,
        "trainerPrescribedDosage": false,
        "notes": "1-2 technique cues" } ] }
  ]
}
Produce exactly one dayTemplates entry per weekday index in [${uniqueWeekdayIndices.join(', ')}], each with EXACTLY ${totalExercisesPerSession} exercises${hasCircuits ? ' matching the circuit structure' : ''}.`

        const phaseResponse = await openai.chat.completions.create({
          model: 'gpt-4o',
          max_tokens: 8000,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        })

        const parsed = JSON.parse(phaseResponse.choices[0].message.content ?? '{}') as {
          title?: string
          description?: string
          dayTemplates?: { dayOfWeek: number; sessionName: string; exercises: PhaseTemplateExercise[] }[]
        }

        const poolIds = new Set(pool.map(e => e.id))
        let dayTemplates: { dayOfWeek: number; sessionName: string; exercises: PhaseTemplateExercise[] }[] = (parsed.dayTemplates ?? [])
          .filter(t => uniqueWeekdayIndices.includes(Number(t.dayOfWeek)))
          .map(t => ({
            ...t,
            exercises: dedupeWithinSession(
              (t.exercises ?? [])
                .filter(e => poolIds.has(e.exerciseId))
                .map(e => ({ ...e, trainerPrescribedDosage: e.trainerPrescribedDosage === true && dosageFlagAllowed(e.exerciseId) })),
              nameOf
            ),
          }))

        // Post-generation hard-constraint audit — swap violators for a compliant pool exercise.
        if (hardConstraints.length > 0) {
          dayTemplates = dayTemplates.map(t => {
            const { cleaned, violationsFound, unresolvedViolations } = auditAndReplaceViolations(
              t.exercises, hardConstraints, pool
            )
            if (violationsFound.length > 0) {
              console.warn(`[AI] Phase ${phaseIdx + 1} day ${t.dayOfWeek}: replaced ${violationsFound.length} hard-constraint violation(s): ${violationsFound.map(v => v.exerciseName).join(', ')}`)
            }
            for (const v of unresolvedViolations) {
              warnings.push(`Could not find a compliant replacement for "${v.exerciseName}" (${v.categoryId}) — please review.`)
            }
            return { ...t, exercises: dedupeWithinSession(cleaned, nameOf) }
          })
        }

        const toTemplateExercise = (poolItem: BackfillPoolItem, circuitIndex: number | undefined, orderIndex: number): PhaseTemplateExercise & { orderIndex: number } => {
          const hasReps = poolItem.defaultReps != null || poolItem.defaultHoldSeconds == null
          return {
            notes: poolItem.cuesThumbnail ?? undefined,
            exerciseId: poolItem.id,
            exerciseName: poolItem.name,
            phase: circuitIndex != null ? circuitFocusToExercisePhase(circuits[circuitIndex].focusType) : 'STRENGTHENING',
            circuitIndex,
            baseSets: poolItem.defaultSets ?? 3,
            baseReps: hasReps ? (poolItem.defaultReps ?? 10) : undefined,
            baseDurationSeconds: hasReps ? undefined : (poolItem.defaultHoldSeconds ?? undefined),
            restSeconds: 30,
            orderIndex,
          }
        }

        // Required-exercise backstop, then per-circuit count correction from
        // the SAME filtered pool (so backfill can't reintroduce a violator).
        let exercisesByDay = new Map<number, (PhaseTemplateExercise & { orderIndex: number })[]>(
          dayTemplates.map(t => [t.dayOfWeek, t.exercises.map((e, i) => ({ ...e, orderIndex: i }))])
        )
        if (requiredExercises.length > 0) {
          const result = enforceRequiredExercises(
            exercisesByDay, requiredExerciseRequirements, circuits,
            (poolItem, circuitIndex, _day, existing) =>
              existing ? { ...existing, circuitIndex: existing.circuitIndex ?? circuitIndex } : toTemplateExercise(poolItem, circuitIndex, 0)
          )
          exercisesByDay = result.exercisesByDay
          for (const name of result.inserted) {
            warnings.push(`"${name}" was requested by the trainer but missing from some AI-generated sessions in phase ${phaseIdx + 1}; it was inserted where absent.`)
          }
        }
        if (hasCircuits) {
          const fit = enforceCircuitFit(
            exercisesByDay, circuits, pool, requiredIds, programMode, requestedDifficulty, fitsCircuit,
            (poolItem, circuitIndex, orderIndex) => toTemplateExercise(poolItem, circuitIndex, orderIndex)
          )
          exercisesByDay = fit.exercisesByDay
          if (fit.swapped.length) console.warn(`[AI] Phase ${phaseIdx + 1}: swapped ${fit.swapped.length} exercise(s) that did not fit their circuit: ${fit.swapped.join('; ')}`)
          exercisesByDay = enforceCircuitExerciseCounts(
            exercisesByDay, circuits, pool,
            (poolItem, circuitIndex, orderIndex) => toTemplateExercise(poolItem, circuitIndex, orderIndex),
            {
              fits: (item, focusType) => fitsCircuit(item as ExercisePoolItem, focusType),
              rank: (item, focusType) => rankForCircuit(item as ExercisePoolItem, focusType),
            }
          )
        }
        dayTemplates = dayTemplates.map(t => ({
          ...t,
          exercises: exercisesByDay.get(t.dayOfWeek) ?? t.exercises,
        }))

        // Fit rest/holds to the requested session length (trainer-prescribed
        // dosage is left exactly as written).
        const durationNotes = new Set<string>()
        dayTemplates = dayTemplates.map(t => {
          const fit = fitDosageToDuration(
            t.exercises, circuits, params.durationMinutes,
            // In circuit blocks each exercise is performed once per round
            // (sets collapse to 1 unless trainer-prescribed), so estimate
            // with the effective set count, not the model's raw baseSets.
            e => ({
              sets: hasCircuits && !e.trainerPrescribedDosage ? 1 : e.baseSets,
              reps: e.baseReps, durationSeconds: e.baseDurationSeconds, restSeconds: e.restSeconds, circuitIndex: e.circuitIndex,
            }),
            (e, d) => e.trainerPrescribedDosage ? e : { ...e, restSeconds: d.restSeconds ?? e.restSeconds, baseDurationSeconds: d.durationSeconds ?? e.baseDurationSeconds }
          )
          if (fit.note) durationNotes.add(fit.note)
          return { ...t, exercises: fit.exercises }
        })
        for (const note of durationNotes) warnings.push(`Phase ${phaseIdx + 1}: ${note}`)

        return { phase, dayTemplates, title: parsed.title, description: parsed.description }
      })
    )

    if (phaseResults.every(r => r.dayTemplates.every(t => t.exercises.length === 0))) {
      throw new Error('AI generated no valid exercises for the multi-week program. Please try again.')
    }

    // Expand each phase's day templates into concrete per-week exercises,
    // applying deterministic progression (and periodic deload) for every week
    // within the phase. Trainer-prescribed dosage is held fixed.
    const weekResults = phaseResults.flatMap(({ phase, dayTemplates, title, description }) => {
      const isFirstPhase = phase.phaseIndex === 0
      return phase.weeks.map((wp, weekIdxInPhase) => {
        const weekIdx = wp.week - 1
        const isLastWeekOfProgram = wp.week === totalWeeks
        const deload = isDeloadWeek(weekIdxInPhase, phase.weeks.length, isLastWeekOfProgram)

        const exercises: GeneratedExercise[] = dayTemplates.flatMap(t =>
          t.exercises.map((e, orderIdx) => {
            const rx = computeProgressedRx(e, weekIdxInPhase, deload, wp.difficultyLevel)
            return {
              exerciseId: e.exerciseId,
              exerciseName: e.exerciseName || e.exerciseId,
              phase: e.phase,
              circuitIndex: e.circuitIndex,
              sets: rx.sets,
              reps: rx.reps,
              durationSeconds: rx.durationSeconds,
              restSeconds: e.restSeconds,
              weekIndex: weekIdx,
              dayOfWeek: t.dayOfWeek,
              orderIndex: orderIdx,
              notes: e.notes,
              trainerPrescribedDosage: e.trainerPrescribedDosage === true,
            }
          })
        )

        const sessions = dayTemplates.map(t => ({
          dayOfWeek: t.dayOfWeek,
          weekIndex: weekIdx,
          name: t.sessionName || `Week ${wp.week} Session`,
        }))

        return {
          weekIdx,
          sessions,
          exercises,
          title: isFirstPhase && weekIdxInPhase === 0 ? title : undefined,
          description: isFirstPhase && weekIdxInPhase === 0 ? description : undefined,
        }
      })
    })

    const allCollectedSessions: GeneratedPlan['sessions'] = []
    const allCollectedExercises: GeneratedExercise[] = []
    let programTitle = ''
    let programDescription = ''

    for (const result of weekResults) {
      if (result.exercises.length === 0) {
        console.warn(`[AI] Week ${result.weekIdx + 1} returned no valid exercises — skipping`)
        continue
      }
      if (result.weekIdx === 0) {
        programTitle = result.title ?? ''
        programDescription = result.description ?? ''
      }
      allCollectedSessions.push(...result.sessions)
      allCollectedExercises.push(...result.exercises)
    }

    if (allCollectedExercises.length === 0) {
      throw new Error('AI generated no valid exercises for the multi-week program. Please try again.')
    }

    const fallbackDescription = `${totalWeeks}-week ${programMode === 'CLINICAL' ? 'rehabilitation' : 'training'} program across ${phases.length} progressive phase${phases.length > 1 ? 's' : ''}.`

    return {
      title: programTitle || 'AI Generated Program',
      description: programDescription || params.clinicalAssessment || fallbackDescription,
      sessions: allCollectedSessions,
      exercises: sortAndReindex(allCollectedExercises),
      warnings: warnings.length ? warnings : undefined,
    }
  }
  // === END multi-week path ===

  // === Whole-program path (no Step 1 plan) ===
  const targetRegions = mapFocusAreasToBodyRegions(params.focusAreas ?? [])
  const regionMatches = library.filter(e => regionsOverlap(e, targetRegions))
  const circuitMatches = library.filter(e => circuits.some(c => poolItemMatchesCircuitFocus(e, c.focusType)))

  const { pool: eligibleExercises, hardConstraintFilterApplied } = assembleExercisePool({
    candidates: [...regionMatches, ...circuitMatches],
    circuits,
    programMode,
    clientLimitations,
    availableEquipment,
    requestedDifficulty: params.difficultyLevel,
    hardConstraints,
    pinned: requiredExercises,
    seed,
  })
  if (eligibleExercises.length === 0) {
    throw new Error('No suitable exercises found for the given focus areas, equipment, and client profile.')
  }
  console.log(`[AI] Program pool: ${eligibleExercises.length} exercises (hard-constraint filter ${hardConstraintFilterApplied ? 'applied' : 'skipped'})`)
  const fitsCircuit = makeCircuitFitPredicate(eligibleExercises, circuits, programMode, params.difficultyLevel, allowPlyometrics)
  const sessionRegionsForRank = [...new Set(circuits.flatMap(c => WORKING_CIRCUIT_REGIONS[c.focusType] ?? []))]
  const rankForCircuit = (item: ExercisePoolItem, focusType: string) =>
    scoreCircuitRelevance(item, focusType, sessionRegionsForRank, programMode, params.difficultyLevel)

  const systemPrompt = buildProgramSystemPrompt({
    programMode,
    scope: { kind: 'PROGRAM' },
    daysPerWeek: params.daysPerWeek,
    dayIndices: uniqueWeekdayIndices,
    totalExercisesPerSession,
    circuits,
  })

  const userPrompt = `CURRENT PROGRAM REQUEST
Create the complete exercise program using the Inmotus System Programming Rules, Client Context, current trainer information, and supplied exercise library.

${clientContext}

${programParametersBlock}

${trainerDirectives}
${hasCircuits ? `==================================================
CIRCUIT ASSIGNMENT RULES
==================================================
- Each exercise MUST include "circuitIndex" set to its 0-based circuit number (0 through ${circuits.length - 1}).
- Each circuit count is PER SESSION — every training day must have the FULL circuit exercise count, not a fraction of it.
- Total exercises in the "exercises" array must be EXACTLY ${totalExercisesPerSession * uniqueWeekdayIndices.length} (${totalExercisesPerSession} per session × ${uniqueWeekdayIndices.length} days).
- A circuit's normal focus NEVER overrides a hard constraint.` : `==================================================
VOLUME RULE
==================================================
Each day must have EXACTLY ${totalExercisesPerSession} exercises — no more, no less. Distribute them across the required phases (WARMUP → ACTIVATION → STRENGTHENING → MOBILITY → COOLDOWN).`}

${buildVarietyBlock()}

==================================================
AVAILABLE EXERCISES
==================================================
Use ONLY these exercise IDs (exercises that would violate a hard constraint or need unavailable equipment have already been removed where detectable):
${eligibleExercises.map(formatExercisePoolLine).join('\n')}

${buildCircuitCandidateIndex(eligibleExercises, circuits, fitsCircuit)}

${buildFinalAuditBlock()}

==================================================
OUTPUT
==================================================
Respond with this exact JSON structure:
{
  "title": "Program title",
  "description": "2-3 sentence program description",
  "sessions": [
    { "dayOfWeek": ${uniqueWeekdayIndices[0] ?? 0}, "name": "A short descriptive session name, e.g. 'Hip Activation & Mobility' or 'Posterior Chain Strength'" }
  ],
  "exercises": [
    {
      "exerciseId": "the exercise ID from the list above",
      "exerciseName": "exercise name",
      "phase": "ACTIVATION",
      ${hasCircuits ? '"circuitIndex": 0,' : ''}
      "sets": 3,
      "reps": 15,
      "durationSeconds": null,
      "restSeconds": 30,
      "trainerPrescribedDosage": false,
      "dayOfWeek": ${uniqueWeekdayIndices[0] ?? 0},
      "orderIndex": 2,
      "notes": "1-2 technique cues specific to this client"
    }
  ]
}

"sessions" must have one entry per weekday index in [${uniqueWeekdayIndices.join(', ')}]. Use either reps OR durationSeconds per exercise, not both (set the unused one to null). Generate ALL requested sessions; do not stop after the first day. Return valid JSON only.`

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 16000,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  })

  const parsed = JSON.parse(response.choices[0].message.content ?? '{}') as GeneratedPlan

  const exerciseIds = new Set(eligibleExercises.map(e => e.id))
  const validExercises = (parsed.exercises ?? []).filter(
    e => exerciseIds.has(e.exerciseId) && uniqueWeekdayIndices.includes(Number(e.dayOfWeek ?? uniqueWeekdayIndices[0]))
  )
  if (validExercises.length === 0) {
    throw new Error('AI generated no valid exercises. Please try again.')
  }

  const { cleaned: auditedExercises, violationsFound, unresolvedViolations } =
    auditAndReplaceViolations(validExercises, hardConstraints, eligibleExercises)
  if (violationsFound.length > 0) {
    console.warn(`[AI] Post-generation audit replaced ${violationsFound.length} exercise(s) violating hard constraints: ${violationsFound.map(v => `${v.exerciseName} (${v.categoryId})`).join(', ')}`)
  }
  for (const v of unresolvedViolations) {
    warnings.push(`Could not find a compliant replacement for "${v.exerciseName}" (${v.categoryId}) — please review.`)
  }

  const toGeneratedExercise = (poolItem: BackfillPoolItem, circuitIndex: number | undefined, orderIndex: number, dayOfWeek: number): GeneratedExercise => {
    const hasReps = poolItem.defaultReps != null || poolItem.defaultHoldSeconds == null
    return {
      exerciseId: poolItem.id,
      exerciseName: poolItem.name,
      phase: circuitIndex != null ? circuitFocusToExercisePhase(circuits[circuitIndex].focusType) : 'STRENGTHENING',
      circuitIndex,
      sets: poolItem.defaultSets ?? 3,
      reps: hasReps ? (poolItem.defaultReps ?? 10) : undefined,
      durationSeconds: hasReps ? undefined : (poolItem.defaultHoldSeconds ?? undefined),
      restSeconds: 30,
      dayOfWeek,
      orderIndex,
      notes: poolItem.cuesThumbnail ?? undefined,
    }
  }

  let exercisesByDay = new Map<number, GeneratedExercise[]>()
  for (const ex of auditedExercises) {
    const day = ex.dayOfWeek ?? uniqueWeekdayIndices[0] ?? 0
    if (!exercisesByDay.has(day)) exercisesByDay.set(day, [])
    exercisesByDay.get(day)!.push({ ...ex, trainerPrescribedDosage: ex.trainerPrescribedDosage === true && dosageFlagAllowed(ex.exerciseId) })
  }
  for (const [day, list] of exercisesByDay) exercisesByDay.set(day, dedupeWithinSession(list, nameOf))

  if (requiredExercises.length > 0) {
    const result = enforceRequiredExercises(
      exercisesByDay, requiredExerciseRequirements, circuits,
      (poolItem, circuitIndex, dayOfWeek, existing) =>
        existing
          ? { ...existing, dayOfWeek, circuitIndex: existing.circuitIndex ?? circuitIndex }
          : toGeneratedExercise(poolItem, circuitIndex, 0, dayOfWeek)
    )
    exercisesByDay = result.exercisesByDay
    for (const name of result.inserted) {
      warnings.push(`"${name}" was requested by the trainer but missing from some AI-generated sessions; it was inserted where absent.`)
    }
  }
  if (hasCircuits) {
    const fit = enforceCircuitFit(exercisesByDay, circuits, eligibleExercises, requiredIds, programMode, params.difficultyLevel, fitsCircuit, toGeneratedExercise)
    exercisesByDay = fit.exercisesByDay
    if (fit.swapped.length) console.warn(`[AI] Swapped ${fit.swapped.length} exercise(s) that did not fit their circuit: ${fit.swapped.join('; ')}`)
    exercisesByDay = enforceCircuitExerciseCounts<GeneratedExercise>(
      exercisesByDay, circuits, eligibleExercises, toGeneratedExercise,
      {
        fits: (item, focusType) => fitsCircuit(item as ExercisePoolItem, focusType),
        rank: (item, focusType) => rankForCircuit(item as ExercisePoolItem, focusType),
      }
    )
  }

  const durationNotes = new Set<string>()
  for (const [day, list] of exercisesByDay) {
    const fit = fitDosageToDuration(
      list, circuits, params.durationMinutes,
      e => ({
        sets: hasCircuits && !e.trainerPrescribedDosage ? 1 : e.sets,
        reps: e.reps, durationSeconds: e.durationSeconds, restSeconds: e.restSeconds, circuitIndex: e.circuitIndex,
      }),
      (e, d) => e.trainerPrescribedDosage ? e : { ...e, restSeconds: d.restSeconds ?? e.restSeconds, durationSeconds: d.durationSeconds ?? e.durationSeconds }
    )
    if (fit.note) durationNotes.add(fit.note)
    exercisesByDay.set(day, fit.exercises)
  }
  warnings.push(...durationNotes)

  const finalExercises = sortAndReindex(Array.from(exercisesByDay.values()).flat())
  const sessionDays = new Set(finalExercises.map(e => e.dayOfWeek ?? 0))
  const sessions = (parsed.sessions ?? []).filter(s => sessionDays.has(s.dayOfWeek))

  return {
    title: parsed.title || 'AI Generated Program',
    description: parsed.description || '',
    sessions,
    exercises: finalExercises,
    warnings: warnings.length ? warnings : undefined,
  }
}


export interface GeneratedProgramWorkoutBlock {
  type: string;
  name?: string;
  circuitIndex?: number;
  orderIndex: number;
  rounds?: number;
  restBetweenRounds?: number | null;
  exercises: {
    exerciseId: string;
    exerciseName?: string;
    orderIndex: number;
    sets: number;
    reps: string;
    notes?: string;
    restSeconds?: number;
  }[];
}

export interface GeneratedProgramWorkout {
  name: string;
  dayIndex: number;
  weekIndex: number;
  blocks: GeneratedProgramWorkoutBlock[];
}

export interface GeneratedProgram {
  name: string;
  description?: string;
  workouts: GeneratedProgramWorkout[];
  warnings?: string[];
}

function circuitFocusToBlockType(focusType: string): string {
  if (focusType === "WARMUP") return "WARMUP";
  if (focusType === "COOLDOWN") return "COOLDOWN";
  return "CIRCUIT";
}

function defaultRoundsForFocusType(focusType: string): number {
  if (focusType === "WARMUP" || focusType === "COOLDOWN") return 1;
  return 3;
}

export async function generateProgram(
  params: GenerateWorkoutParams
): Promise<GeneratedProgram> {
  const generatedPlan = await generateWorkoutPlan(params);

  const circuits = params.circuits;
  const hasCircuits = circuits && circuits.length > 0;

  const sessionNameMap = new Map<string, string>(
    (generatedPlan.sessions ?? []).map((s) => [`${s.weekIndex ?? 0}_${s.dayOfWeek}`, s.name])
  );

  const workoutsMap = new Map<string, GeneratedProgramWorkout>();

  generatedPlan.exercises.forEach((ex) => {
    const day = ex.dayOfWeek ?? 0;
    const week = ex.weekIndex ?? 0;
    const key = `${week}_${day}`;
    if (!workoutsMap.has(key)) {
      const sessionNum = workoutsMap.size;
      const name = sessionNameMap.get(key);
      if (!name) {
        console.warn(`[AI] No session name returned for week ${week} day ${day} — using fallback`);
      }
      workoutsMap.set(key, {
        name: name ?? `Session ${sessionNum + 1}`,
        dayIndex: day,
        weekIndex: week,
        blocks: [],
      });
    }
    const workout = workoutsMap.get(key)!;

    if (hasCircuits) {
      // Group by circuitIndex from the AI output
      const circuitIdx = Math.max(
        0,
        Math.min(ex.circuitIndex ?? 0, circuits.length - 1)
      );
      const circuitConfig = circuits[circuitIdx];

      let block = workout.blocks.find((b) => b.circuitIndex === circuitIdx);
      if (!block) {
        block = {
          type: circuitFocusToBlockType(circuitConfig.focusType),
          name: circuitConfig.name,
          circuitIndex: circuitIdx,
          orderIndex: circuitIdx,
          rounds: circuitConfig.rounds ?? defaultRoundsForFocusType(circuitConfig.focusType),
          restBetweenRounds: circuitConfig.restBetweenRounds ?? null,
          exercises: [],
        };
        workout.blocks.push(block);
      }

      block.exercises.push({
        exerciseId: ex.exerciseId,
        exerciseName: ex.exerciseName,
        orderIndex: block.exercises.length,
        // Circuits: block.rounds controls repetition, so each exercise is 1
        // set — unless the trainer explicitly prescribed a set count, which
        // is reproduced exactly.
        sets: ex.trainerPrescribedDosage && ex.sets > 0 ? ex.sets : 1,
        reps: ex.reps != null
          ? ex.reps.toString()
          : ex.durationSeconds != null
            ? `${ex.durationSeconds}s`
            : "10",
        notes: ex.notes,
        restSeconds: ex.restSeconds,
      });
    } else {
      // Legacy: group by phase
      let targetType = ex.phase.toUpperCase();
      if (["ACTIVATION", "STRENGTHENING", "MOBILITY"].includes(targetType)) {
        targetType = "NORMAL";
      }

      let block = workout.blocks.find((b) => b.type === targetType && b.circuitIndex === undefined);
      if (!block) {
        block = {
          type: ["WARMUP", "COOLDOWN", "SUPERSET", "CIRCUIT", "AMRAP", "EMOM"].includes(targetType) ? targetType : "NORMAL",
          orderIndex: workout.blocks.length,
          exercises: [],
        };
        workout.blocks.push(block);
      }

      block.exercises.push({
        exerciseId: ex.exerciseId,
        exerciseName: ex.exerciseName,
        orderIndex: block.exercises.length,
        sets: ex.sets || 3,
        reps: ex.reps?.toString() || "10",
        notes: ex.notes,
        restSeconds: ex.restSeconds,
      });
    }
  });

  // Ensure blocks are sorted by orderIndex within each workout
  for (const workout of workoutsMap.values()) {
    workout.blocks.sort((a, b) => a.orderIndex - b.orderIndex);
  }

  const workouts = Array.from(workoutsMap.values()).sort((a, b) => {
    if (a.weekIndex !== b.weekIndex) return a.weekIndex - b.weekIndex;
    return a.dayIndex - b.dayIndex;
  });

  return {
    name: generatedPlan.title || "AI Generated Program",
    description: generatedPlan.description,
    workouts,
    warnings: generatedPlan.warnings,
  };
}

type BlueprintExercise = {
  name: string;
  sets?: number | null;
  reps?: number | null;
  durationSeconds?: number | null;
  restSeconds?: number | null;
  notes?: string | null;
  traceableInDocument?: boolean;
};
type BlueprintBlock = { name: string; exercises: BlueprintExercise[] };
type BlueprintSession = { dayIndex: number; weekIndex?: number; title: string; blocks: BlueprintBlock[]; dayLabel?: string | null };

const WEEKDAY_NAME_TO_INDEX: Record<string, number> = {
  monday: 0, mon: 0,
  tuesday: 1, tue: 1, tues: 1,
  wednesday: 2, wed: 2,
  thursday: 3, thu: 3, thur: 3, thurs: 3,
  friday: 4, fri: 4,
  saturday: 5, sat: 5,
  sunday: 6, sun: 6,
};

// Resolves a verbatim dayLabel (e.g. "Monday") to an absolute weekday index
// (0=Monday..6=Sunday), or null if it doesn't name a real weekday (e.g. "Day 1").
function parseWeekdayFromLabel(label: string | null | undefined): number | null {
  if (!label) return null;
  const normalized = label.toLowerCase().trim().replace(/[^a-z]/g, "");
  return WEEKDAY_NAME_TO_INDEX[normalized] ?? null;
}

function assemblePreviewWorkouts(
  sessions: { dayOfWeek: number; weekIndex: number; name: string }[],
  exercises: (PreviewExercise & { dayOfWeek: number; weekIndex: number; circuitIndex: number; phase: string })[],
  circuits: CircuitConfig[]
): PreviewWorkout[] {
  const hasCircuits = circuits.length > 0;
  const sessionNameMap = new Map<string, string>(sessions.map((s) => [`${s.weekIndex}_${s.dayOfWeek}`, s.name]));
  const workoutsMap = new Map<string, PreviewWorkout>();

  exercises.forEach((ex) => {
    const key = `${ex.weekIndex}_${ex.dayOfWeek}`;
    if (!workoutsMap.has(key)) {
      const sessionNum = workoutsMap.size;
      workoutsMap.set(key, {
        name: sessionNameMap.get(key) ?? `Session ${sessionNum + 1}`,
        dayIndex: ex.dayOfWeek,
        weekIndex: ex.weekIndex,
        blocks: [],
      });
    }
    const workout = workoutsMap.get(key)!;

    if (hasCircuits) {
      const circuitIdx = Math.max(0, Math.min(ex.circuitIndex, circuits.length - 1));
      const circuitConfig = circuits[circuitIdx];

      let block = workout.blocks.find((b) => b.circuitIndex === circuitIdx);
      if (!block) {
        block = {
          type: circuitFocusToBlockType(circuitConfig.focusType),
          name: circuitConfig.name,
          circuitIndex: circuitIdx,
          orderIndex: circuitIdx,
          rounds: circuitConfig.rounds ?? defaultRoundsForFocusType(circuitConfig.focusType),
          restBetweenRounds: circuitConfig.restBetweenRounds ?? null,
          exercises: [],
        };
        workout.blocks.push(block);
      }

      block.exercises.push({
        exerciseId: ex.exerciseId,
        exerciseName: ex.exerciseName,
        orderIndex: block.exercises.length,
        // The document's own set count is authoritative — never collapse it
        // to 1 just because the block was classified as a circuit.
        sets: ex.sets,
        reps: ex.reps,
        notes: ex.notes,
        restSeconds: ex.restSeconds,
        flags: ex.flags,
        matchCandidates: ex.matchCandidates,
      });
    } else {
      let targetType = ex.phase.toUpperCase();
      if (["ACTIVATION", "STRENGTHENING", "MOBILITY"].includes(targetType)) targetType = "NORMAL";

      let block = workout.blocks.find((b) => b.type === targetType && b.circuitIndex === undefined);
      if (!block) {
        block = {
          type: ["WARMUP", "COOLDOWN", "SUPERSET", "CIRCUIT", "AMRAP", "EMOM"].includes(targetType) ? targetType : "NORMAL",
          orderIndex: workout.blocks.length,
          exercises: [],
        };
        workout.blocks.push(block);
      }

      block.exercises.push({
        exerciseId: ex.exerciseId,
        exerciseName: ex.exerciseName,
        orderIndex: block.exercises.length,
        sets: ex.sets,
        reps: ex.reps,
        notes: ex.notes,
        restSeconds: ex.restSeconds,
        flags: ex.flags,
        matchCandidates: ex.matchCandidates,
      });
    }
  });

  for (const workout of workoutsMap.values()) {
    workout.blocks.sort((a, b) => a.orderIndex - b.orderIndex);
  }
  return Array.from(workoutsMap.values()).sort((a, b) =>
    a.weekIndex !== b.weekIndex ? a.weekIndex - b.weekIndex : a.dayIndex - b.dayIndex
  );
}

/**
 * Builds a program preview directly from a parsed brief's session blueprint,
 * using deterministic exercise matching (no LLM calls). Unmatched or
 * low-confidence exercises are kept in the output with `flags` set instead of
 * being silently substituted or dropped — the trainer resolves them in the
 * review screen before the program can be saved. Returns `PreviewGeneratedProgram`
 * (nullable `exerciseId`, always-present `flags`), a deliberately separate type
 * from `GeneratedProgram` (non-null `exerciseId`, the "ready to save" contract) —
 * a later task (client-side, after the trainer resolves every flag) converts a
 * resolved preview into a plain `GeneratedProgram` before calling the save action.
 */
export async function buildProgramPreviewFromBlueprint(params: {
  sessionBlueprint: BlueprintSession[];
  circuits?: CircuitConfig[];
  preferredWeekdays?: string[];
  programTitle?: string;
}): Promise<PreviewGeneratedProgram> {
  const weekdayToIndex: Record<string, number> = {
    monday: 0, tuesday: 1, wednesday: 2, thursday: 3, friday: 4, saturday: 5, sunday: 6,
  };

  const circuits = params.circuits || [];
  const circuitNameMap = new Map(circuits.map((c, idx) => [normalizeExerciseName(c.name), idx]));

  const allBriefExercises = await prisma.exercise.findMany({ where: { isActive: true, isAssessment: false } });

  const preferredDayIndices = (params.preferredWeekdays ?? [])
    .map((d) => weekdayToIndex[d.toLowerCase().trim()])
    .filter((d): d is number => Number.isInteger(d));

  function toActualDayOfWeek(dayIndex: number): number {
    if (preferredDayIndices.length === 0) return dayIndex;
    return preferredDayIndices[dayIndex % preferredDayIndices.length];
  }

  // Prefer the document's own stated weekday (e.g. "Monday") over counting
  // position within the week — position drifts as soon as any session in the
  // middle of the week gets dropped (e.g. an unresolvable "same exercises as
  // Week 1" reference shifts every later session's position down by one).
  function resolveDayOfWeek(session: BlueprintSession): number {
    return parseWeekdayFromLabel(session.dayLabel) ?? toActualDayOfWeek(session.dayIndex);
  }

  const sessions = params.sessionBlueprint.map((s) => ({
    dayOfWeek: resolveDayOfWeek(s),
    weekIndex: s.weekIndex ?? 0,
    name: s.title,
  }));

  const exercisesOutput: (PreviewExercise & { dayOfWeek: number; weekIndex: number; circuitIndex: number; phase: string })[] = [];

  for (const session of params.sessionBlueprint) {
    let orderIndex = 0;
    for (let blockIdx = 0; blockIdx < session.blocks.length; blockIdx += 1) {
      const block = session.blocks[blockIdx];
      const blockKey = normalizeExerciseName(block.name);
      const circuitIndex = circuitNameMap.get(blockKey) ?? Math.min(blockIdx, Math.max(0, circuits.length - 1));

      for (const exerciseBp of block.exercises) {
        const match = resolveExerciseMatch(exerciseBp.name, allBriefExercises);
        const flags: ExerciseMatchFlag[] = [];
        if (match.matchType === "needs_review") flags.push("needs_review");
        if (match.matchType === "not_in_library") flags.push("not_in_library");
        if (exerciseBp.traceableInDocument === false) flags.push("not_in_document");

        const matchedExercise = match.exerciseId
          ? (allBriefExercises.find((e) => e.id === match.exerciseId) ?? null)
          : null;

        const sets = exerciseBp.sets ?? matchedExercise?.defaultSets ?? 3;
        const hasDuration =
          exerciseBp.durationSeconds != null ||
          (exerciseBp.reps == null && matchedExercise?.defaultHoldSeconds != null);
        const repsValue = hasDuration ? undefined : (exerciseBp.reps ?? matchedExercise?.defaultReps ?? 10);
        const durationSeconds =
          exerciseBp.durationSeconds ??
          (hasDuration ? (matchedExercise?.defaultHoldSeconds ?? undefined) : undefined);
        const reps = repsValue != null ? repsValue.toString() : durationSeconds != null ? `${durationSeconds}s` : "10";

        const focusType = circuits[circuitIndex]?.focusType?.toUpperCase();
        const phase =
          focusType === "WARMUP" ? "WARMUP" :
          focusType === "COOLDOWN" ? "COOLDOWN" :
          focusType === "FLEXIBILITY" ? "MOBILITY" :
          focusType === "CARDIO" ? "ACTIVATION" :
          focusType === "BALANCE" ? "ACTIVATION" : "STRENGTHENING";

        exercisesOutput.push({
          exerciseId: match.exerciseId,
          exerciseName: matchedExercise?.name ?? exerciseBp.name,
          phase,
          circuitIndex,
          sets,
          reps,
          restSeconds: exerciseBp.restSeconds ?? undefined,
          weekIndex: session.weekIndex ?? 0,
          dayOfWeek: resolveDayOfWeek(session),
          orderIndex: orderIndex++,
          notes: exerciseBp.notes ?? undefined,
          flags,
          matchCandidates: match.candidates,
        });
      }
    }
  }

  const programTitle = params.programTitle || "Athletic Program";
  const description = "Generated from uploaded brief";
  const workouts = assemblePreviewWorkouts(sessions, exercisesOutput, circuits);

  return { name: programTitle, description, workouts };
}

const CLINICAL_PLAN_SYSTEM_PROMPT = `You are an expert Doctor of Physical Therapy (DPT). Analyze the client profile and program parameters, then produce a week-by-week clinical rehabilitation plan as JSON.

Think step-by-step:
1. Identify the client's current rehabilitation phase based on diagnosis, time post-injury, pain score, and limitations.
2. Plan each week as a clinically distinct, progressive stage toward the client's goals.
3. Assign an appropriate rehabStage to each week: EARLY_REHAB (pain control, ROM, gentle activation), MID_REHAB (progressive strengthening, neuromuscular control), LATE_REHAB (functional loading, activity-specific), or MAINTENANCE (general fitness, prevention).
4. For each week, specify what is contraindicated THIS specific week — this may differ from the global contraindications.
5. Derive indication tags (lowercase, hyphenated clinical keywords) that should be used to find appropriate exercises for each week.
6. Prefer runs of 2-4 contiguous weeks per rehabStage; only advance to the next stage when the client's needs genuinely shift — do not assign a different stage to every single week just for variety.

Respond with valid JSON only. No markdown, no explanation.`

const PERFORMANCE_PLAN_SYSTEM_PROMPT = `You are an expert strength & conditioning coach and performance program designer. Analyze the client's stated goals and program parameters, then produce a week-by-week periodized training plan as JSON. This client has no documented injury, diagnosis, pain, or physical limitation — do not frame this as rehabilitation or use clinical/DPT language anywhere in your output.

Think step-by-step:
1. Identify the training goal (event prep such as a race or competition, general strength/hypertrophy, endurance, fat loss, athletic performance) from the stated program goals and any trainer notes.
2. Plan each week as a periodized, progressive training block using standard periodization: BASE_BUILD (aerobic/movement-quality foundation, higher volume/lower intensity), BUILD (progressive overload, increasing intensity), PEAK (highest intensity/specificity, lower volume), TAPER (volume reduction before an event/deadline), or GENERAL_FITNESS (steady-state, well-rounded training with no specific event).
3. Assign the single most appropriate one of those five labels to each week as "rehabStage" (field name retained for schema compatibility — treat it as this week's periodization phase).
4. For each week, note any form/technique cautions relevant to that week's training focus as "contraindicationsThisWeek" — general safety cues, not clinical contraindications.
5. Derive indication tags (lowercase, hyphenated keywords describing this week's training focus, e.g. "aerobic-base", "power-development", "race-specific") to help select appropriate exercises for each week.
6. Prefer runs of 2-4 contiguous weeks per phase label; only advance to the next phase when the training focus genuinely shifts — do not assign a different label to every single week just for variety.

If the goals imply a specific event with a deadline (e.g. "marathon in 4 weeks", "competition on [date]"), structure the phases so PEAK/TAPER land in the final week(s) before that deadline.

Exception: if the trainer's explicit instructions or subjective notes describe a specific diagnosis, injury, or rehabilitation context, treat this as a clinical program instead and use appropriate clinical framing despite the absence of a linked client profile.

Respond with valid JSON only. No markdown, no explanation.`

export async function generateClinicalPlan(
  params: ClinicalPlanParams
): Promise<ClinicalPlan> {
  const client = params.clientId
    ? await prisma.user.findUnique({
        where: { id: params.clientId },
        include: { clientProfile: true },
      })
    : null

  const profile = client?.clientProfile ?? null
  const programMode = params.programMode ?? determineProgramMode(profile)

  const clientContext = buildClientContextBlock(client, profile, {
    trainerSelectedEquipment: params.availableEquipment ?? [],
  })

  const circuitSummary = params.circuits
    .map(c => `  - ${c.name} (${c.focusType}): ${c.exerciseCount} exercises, ${c.rounds} sets`)
    .join('\n')

  const systemPrompt = programMode === 'CLINICAL' ? CLINICAL_PLAN_SYSTEM_PROMPT : PERFORMANCE_PLAN_SYSTEM_PROMPT
  const phaseExample = programMode === 'CLINICAL' ? 'EARLY_REHAB' : 'BASE_BUILD'
  const assessmentDescription = programMode === 'CLINICAL'
    ? "2-3 sentence clinical assessment of this client's current state and appropriate rehabilitation approach"
    : "2-3 sentence assessment of this client's training goals and the periodization approach for this program"

  const userPrompt = `${clientContext}

Program Parameters:
- Duration: ${params.durationWeeks} weeks
- Days per week: ${params.daysPerWeek}
- Program Goals: ${params.programGoals.join(', ')}
${params.availableEquipment?.length ? `- Available Equipment: ${params.availableEquipment.join(', ')}` : '- Available Equipment: Any (no restriction)'}
- Difficulty level: ${params.difficultyLevel}
- Circuits per session:
${circuitSummary}
${params.subjective ? `\nTrainer Subjective:\n${params.subjective}` : ''}
${params.trainerPrompt ? `\nTrainer Instructions:\n${params.trainerPrompt}` : ''}
${params.additionalNotes ? `\nAdditional Notes:\n${params.additionalNotes}` : ''}

Produce this exact JSON structure:
{
  "clinicalAssessment": "${assessmentDescription}",
  "weeklyPlan": [
    {
      "week": 1,
      "title": "Short descriptive week title",
      "rehabStage": "${phaseExample}",
      "focusAreas": ["<one or more of LOWER_BODY, UPPER_BODY, CORE, FULL_BODY, BALANCE, FLEXIBILITY — cover every body region the circuits and goals require>"],
      "difficultyLevel": "<BEGINNER | INTERMEDIATE | ADVANCED — normally the requested difficulty level>",
      "clinicalGuidance": "<what to prioritize this week, specific technique or loading guidance>",
      "contraindicationsThisWeek": ["<only restrictions that come from the client profile, Trainer Subjective, Trainer Instructions, or Additional Notes — an EMPTY array when none were stated; never invent one>"],
      "progressionGoal": "<what the client should achieve or improve by the end of this week>",
      "derivedIndicationTags": ["<lowercase hyphenated keywords describing this week's focus>"]
    }
  ]
}

The angle-bracket text above describes each field — replace it with real values, never copy it literally.
Every trainer restriction (e.g. "no plyometrics", "no overhead", "strength only") MUST be carried into contraindicationsThisWeek for every week so the exercise-selection step sees it.
Generate exactly ${params.durationWeeks} entries in weeklyPlan (weeks 1 through ${params.durationWeeks}).`

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 4000,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  })

  const raw = response.choices[0].message.content ?? '{}'
  const parsed = JSON.parse(raw) as ClinicalPlan

  if (!parsed.weeklyPlan || parsed.weeklyPlan.length === 0) {
    throw new Error('Clinical plan generation returned no weekly plan. Please try again.')
  }

  // Stamp programMode deterministically — never trust the LLM to self-report it.
  parsed.programMode = programMode
  for (const week of parsed.weeklyPlan) week.programMode = programMode

  return parsed
}
