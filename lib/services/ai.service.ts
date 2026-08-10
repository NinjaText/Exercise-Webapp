import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import type { BodyRegion, Exercise } from "@prisma/client";
import type { ClinicalPlan, ClinicalPlanParams, ProgramPhaseGroup, WeekPlan } from '@/lib/ai/types/program-generation'
import type { ProgramMode } from '@/lib/ai/utils/clinical-context'
import {
  filterByContraindications,
  filterByEquipment,
  buildPhasePoolPrimaryWhereClause,
  buildPhasePoolFallbackWhereClause,
} from '@/lib/ai/utils/exercise-pool'
import { determineProgramMode, buildClientContextBlock } from '@/lib/ai/utils/clinical-context'
import { groupWeeksIntoPhases } from '@/lib/ai/utils/program-phasing'
import { computeProgressedRx, isDeloadWeek, type PhaseTemplateExercise } from '@/lib/ai/utils/progression-rules'
import { dedupeAcrossDays } from '@/lib/ai/utils/exercise-dedup'

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

/**
 * Private scoring function for resolveExerciseMatch.
 * Uses space-gated substring matching (multi-word substrings only) and
 * harmonic-mean-style token overlap to distinguish single-word overlaps
 * from true substring matches.
 */
function scoreExerciseMatchSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if ((a.includes(b) && b.includes(" ")) || (b.includes(a) && a.includes(" "))) return 0.9;
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
  cuesThumbnail: true, videoUrl: true,
}

const VALID_BODY_REGIONS = new Set(['LOWER_BODY', 'UPPER_BODY', 'CORE', 'FULL_BODY', 'BALANCE', 'FLEXIBILITY'])

// Phase labels with no corresponding Exercise.rehabStage data — querying on
// them would always miss and fall straight back to the region-only query, so
// skip the wasted attempt and filter by difficultyLevel instead.
const NON_EXACT_MATCHABLE_STAGES = new Set(['MAINTENANCE', 'BASE_BUILD', 'BUILD', 'PEAK', 'TAPER', 'GENERAL_FITNESS'])

async function buildExercisePoolForPhase(
  phase: ProgramPhaseGroup,
  usedIds: Set<string>,
  clientLimitations: string[],
  availableEquipment?: string[]
): Promise<ExercisePoolItem[]> {
  const allFocusAreas = [...new Set(phase.weeks.flatMap(w => w.focusAreas))]
  const validRegions = allFocusAreas.filter(r => VALID_BODY_REGIONS.has(r))
  const regionsForQuery = validRegions.length > 0 ? validRegions : [...VALID_BODY_REGIONS]
  const allTags = [...new Set(phase.weeks.flatMap(w => w.derivedIndicationTags))]

  let pool: ExercisePoolItem[] = []

  if (!NON_EXACT_MATCHABLE_STAGES.has(phase.label)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pool = (await (prisma.exercise.findMany as any)({
      where: buildPhasePoolPrimaryWhereClause(
        { rehabStage: phase.label, focusAreas: regionsForQuery, derivedIndicationTags: allTags },
        usedIds
      ),
      select: EXERCISE_POOL_SELECT,
      take: 80,
    })) as ExercisePoolItem[]
  }

  if (pool.length < 20) {
    const difficultyLevel = phase.weeks[0]?.difficultyLevel
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pool = (await (prisma.exercise.findMany as any)({
      where: buildPhasePoolFallbackWhereClause(regionsForQuery, usedIds, difficultyLevel),
      select: EXERCISE_POOL_SELECT,
      take: 80,
    })) as ExercisePoolItem[]
  }

  const afterContraFilter = filterByContraindications(pool, clientLimitations)
  return filterByEquipment(afterContraFilter, availableEquipment ?? [])
}

export async function generateWorkoutPlan(
  params: GenerateWorkoutParams
): Promise<GeneratedPlan> {
  const weekdayToIndex: Record<string, number> = {
    monday: 0,
    tuesday: 1,
    wednesday: 2,
    thursday: 3,
    friday: 4,
    saturday: 5,
    sunday: 6,
  };
  const indexToWeekday = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];

  const preferredWeekdayIndices =
    params.preferredWeekdays
      ?.map((d) => weekdayToIndex[d.toLowerCase().trim()])
      .filter((d): d is number => Number.isInteger(d)) ?? [];

  const effectiveWeekdayIndices =
    preferredWeekdayIndices.length > 0
      ? preferredWeekdayIndices
      : Array.from(
          { length: Math.max(1, Math.min(params.daysPerWeek, 7)) },
          (_, idx) => idx
        );

  const uniqueWeekdayIndices = Array.from(new Set(effectiveWeekdayIndices)).sort(
    (a, b) => a - b
  );

  const scheduleLabel = uniqueWeekdayIndices
    .map((i) => indexToWeekday[i])
    .join(", ");

  // Fetch client profile for context
  const client = params.clientId
    ? await prisma.user.findUnique({
        where: { id: params.clientId },
        include: { clientProfile: true },
      })
    : null;

  const profile = client?.clientProfile ?? null;

  // Map focus areas to body regions for pre-filtering
  const targetRegions = mapFocusAreasToBodyRegions(params.focusAreas ?? []);

  // Parse client limitations for contraindication filtering
  const clientLimitations = profile?.limitations
    ? profile.limitations
        .toLowerCase()
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  const clientContext = buildClientContextBlock(client, profile);
  const programMode: ProgramMode = params.weekPlan?.[0]?.programMode ?? determineProgramMode(profile);

  // === Multi-week clinical path (Step 1 plan provided) ===
  if (params.weekPlan && params.weekPlan.length > 0) {
    const weekPlans = params.weekPlan
    const phases = groupWeeksIntoPhases(weekPlans)

    // Build per-phase exercise pools (parallel DB queries — phases don't
    // exclude each other's exercise IDs since pools are fetched concurrently,
    // but each phase's pool is already narrowed by its own stage/tags, so
    // cross-phase overlap is naturally low).
    const phasePools: ExercisePoolItem[][] = await Promise.all(
      phases.map(phase =>
        buildExercisePoolForPhase(phase, new Set<string>(), clientLimitations, params.availableEquipment)
      )
    )

    const hasCircuits = params.circuits && params.circuits.length > 0
    const circuits = params.circuits ?? []
    const totalExercisesPerSession = hasCircuits
      ? circuits.reduce((sum, c) => sum + c.exerciseCount, 0)
      : (params.exercisesPerSession ?? 6)

    const weekdayToIndex: Record<string, number> = {
      monday: 0, tuesday: 1, wednesday: 2, thursday: 3,
      friday: 4, saturday: 5, sunday: 6,
    }
    const preferredDayIndices = (params.preferredWeekdays ?? [])
      .map(d => weekdayToIndex[d.toLowerCase().trim()])
      .filter((d): d is number => Number.isInteger(d))
    const effectiveDayIndices = preferredDayIndices.length > 0
      ? preferredDayIndices
      : Array.from({ length: Math.max(1, Math.min(params.daysPerWeek, 7)) }, (_, i) => i)
    const uniqueDayIndices = Array.from(new Set(effectiveDayIndices)).sort((a, b) => a - b)

    const totalWeeks = weekPlans.length

    const circuitStructureStr = hasCircuits
      ? circuits
          .map((c, i) => `  Circuit ${i} "${c.name}" (${c.focusType}): EXACTLY ${c.exerciseCount} exercises per session/day`)
          .join('\n')
      : null

    const personaLine = programMode === 'CLINICAL'
      ? 'You are an expert DPT and strength & conditioning coach. Design the exercise selection for ONE PHASE of a multi-week rehabilitation program — this phase spans one or more weeks that share the same clinical stage.'
      : 'You are an expert strength & conditioning coach. Design the exercise selection for ONE PHASE of a periodized training program spanning one or more weeks. This is not a rehabilitation program — do not use clinical/DPT language.'
    const guidanceLabel = programMode === 'CLINICAL' ? 'clinical guidance' : 'coaching guidance'

    // One call per PHASE (a contiguous run of weeks sharing a stage/label),
    // not per week — fewer, larger calls than before, still fired in
    // parallel so wall-clock time doesn't increase. Each call fixes the
    // "same exercises every day" bug via an explicit variety rule (4) and
    // hands back WEEK-1-of-phase baseline Rx only; computeProgressedRx below
    // deterministically ramps sets/reps/duration for the phase's later weeks
    // instead of relying on the LLM to do that arithmetic.
    const phaseResults = await Promise.all(
      phases.map(async (phase, phaseIdx) => {
        const pool = phasePools[phaseIdx]
        const poolStr = pool
          .map(
            e =>
              `ID: ${e.id} | ${e.name} | Phase: ${e.exercisePhases.length ? e.exercisePhases.join('/') : 'STRENGTHENING'} | Region: ${e.bodyRegion.join('/')} | Difficulty: ${e.difficultyLevel} | Muscles: ${e.musclesTargeted.join(', ')} | Equipment: ${e.equipmentRequired.join(', ') || 'None'} | Default Rx: ${e.defaultSets ?? 3}x${e.defaultReps ? e.defaultReps : e.defaultHoldSeconds ? e.defaultHoldSeconds + 's hold' : '10'}`
          )
          .join('\n')

        const phaseSystemPrompt = `${personaLine} Use ONLY exercise IDs from the provided pool. Never invent IDs.

RULES:
1. Produce EXACTLY one dayTemplate per weekday index in: ${uniqueDayIndices.join(', ')}.
2. Each day template must have EXACTLY ${totalExercisesPerSession} exercises.
3. VARIETY (CRITICAL): No exerciseId may appear in more than one day template. Every day template must use a COMPLETELY DIFFERENT set of exercises from every other day template — treat each day as a fully independent workout.
4. Follow the ${guidanceLabel} and cautions for this phase strictly.
5. baseSets/baseReps/baseDurationSeconds represent WEEK 1 of THIS PHASE ONLY — realistic, conservative starting values. The calling system progresses them automatically in this phase's later weeks; do not try to encode week-over-week progression yourself.
6. Write 1-2 specific technique cues per exercise relevant to this phase's goals.
${hasCircuits ? `7. Each exercise MUST include circuitIndex (0-based). Circuit structure per session:\n${circuitStructureStr}` : ''}

Respond with valid JSON only.`

        const guidanceLines = phase.weeks
          .map(w => `  Week ${w.week}: ${w.clinicalGuidance} (Goal: ${w.progressionGoal})`)
          .join('\n')
        const cautions = [...new Set(phase.weeks.flatMap(w => w.contraindicationsThisWeek))].join(', ') || 'None'
        const isFirstPhase = phaseIdx === 0
        const titleDescriptionFields = isFirstPhase
          ? `"title": "Program title",\n  "description": "2-3 sentence program description",\n  `
          : ''

        const phaseUserPrompt = `${clientContext}

Phase ${phase.phaseIndex + 1}: ${phase.label} (Weeks ${phase.startWeek}-${phase.endWeek} of ${totalWeeks})
Guidance across this phase's weeks:
${guidanceLines}
Cautions this phase: ${cautions}

Program: ${params.daysPerWeek} sessions/week, ~${params.durationMinutes} min/session
Total exercises per day template: EXACTLY ${totalExercisesPerSession}
${params.subjective ? `Trainer Subjective: ${params.subjective}` : ''}
${params.trainerPrompt ? `Trainer Instructions: ${params.trainerPrompt}` : ''}

Available Exercises (use ONLY these IDs):
${poolStr || 'No tagged exercises found — use general bodyweight exercises appropriate for this phase.'}

Respond with this exact JSON:
{
  ${titleDescriptionFields}"phaseTitle": "Short phase title",
  "dayTemplates": [
    { "dayOfWeek": 0, "sessionName": "Session name", "exercises": [
      { "exerciseId": "id from pool", "exerciseName": "name", "phase": "ACTIVATION",
        ${hasCircuits ? '"circuitIndex": 0,' : ''}
        "baseSets": 3, "baseReps": 12, "baseDurationSeconds": null, "restSeconds": 30,
        "notes": "1-2 technique cues" } ] }
  ]
}
Produce exactly one dayTemplates entry per weekday index in [${uniqueDayIndices.join(', ')}].`

        const phaseResponse = await openai.chat.completions.create({
          model: 'gpt-4o',
          max_tokens: 8000,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: phaseSystemPrompt },
            { role: 'user', content: phaseUserPrompt },
          ],
        })

        const parsed = JSON.parse(phaseResponse.choices[0].message.content ?? '{}') as {
          title?: string
          description?: string
          dayTemplates?: { dayOfWeek: number; sessionName: string; exercises: PhaseTemplateExercise[] }[]
        }

        const poolIds = new Set(pool.map(e => e.id))
        const cleanedTemplates = (parsed.dayTemplates ?? []).map(t => ({
          ...t,
          exercises: (t.exercises ?? []).filter(e => poolIds.has(e.exerciseId)),
        }))
        const dayTemplates = dedupeAcrossDays(cleanedTemplates, pool)

        return { phase, dayTemplates, title: parsed.title, description: parsed.description }
      })
    )

    if (phaseResults.every(r => r.dayTemplates.every(t => t.exercises.length === 0))) {
      throw new Error('AI generated no valid exercises for the multi-week program. Please try again.')
    }

    // Expand each phase's day templates into concrete per-week exercises,
    // applying deterministic sets/reps/duration progression (and periodic
    // deload) for every week within the phase.
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

    // Sort by week, then day, then phase, then original orderIndex
    const sorted = [...allCollectedExercises].sort((a, b) => {
      const weekDiff = (a.weekIndex ?? 0) - (b.weekIndex ?? 0)
      if (weekDiff !== 0) return weekDiff
      const dayDiff = (a.dayOfWeek ?? 0) - (b.dayOfWeek ?? 0)
      if (dayDiff !== 0) return dayDiff
      const phaseA = PHASE_ORDER[a.phase] ?? 2
      const phaseB = PHASE_ORDER[b.phase] ?? 2
      if (phaseA !== phaseB) return phaseA - phaseB
      return a.orderIndex - b.orderIndex
    })

    // Reassign orderIndex per day
    let lastKey = ''
    let dayOrder = 0
    for (const ex of sorted) {
      const key = `${ex.weekIndex ?? 0}_${ex.dayOfWeek ?? 0}`
      if (key !== lastKey) { lastKey = key; dayOrder = 0 }
      ex.orderIndex = dayOrder++
    }

    const fallbackDescription = `${totalWeeks}-week ${programMode === 'CLINICAL' ? 'rehabilitation' : 'training'} program across ${phases.length} progressive phase${phases.length > 1 ? 's' : ''}.`

    return {
      title: programTitle || 'AI Generated Program',
      description: programDescription || params.clinicalAssessment || fallbackDescription,
      sessions: allCollectedSessions,
      exercises: sorted,
    }
  }
  // === END multi-week path ===

  // Fetch exercises with enriched fields
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allExercises = (await (prisma.exercise.findMany as any)({
    where: {
      isActive: true,
      bodyRegion: { hasSome: targetRegions },
    },
    select: {
      id: true,
      name: true,
      bodyRegion: true,
      difficultyLevel: true,
      equipmentRequired: true,
      contraindications: true,
      description: true,
      musclesTargeted: true,
      exercisePhases: true,
      commonMistakes: true,
      defaultSets: true,
      defaultReps: true,
      defaultHoldSeconds: true,
      cuesThumbnail: true,
      videoUrl: true,
    },
  })) as Array<{
    id: string;
    name: string;
    bodyRegion: string[];
    difficultyLevel: string;
    equipmentRequired: string[];
    contraindications: string[];
    description: string | null;
    musclesTargeted: string[];
    exercisePhases: string[];
    commonMistakes: string | null;
    defaultSets: number | null;
    defaultReps: number | null;
    defaultHoldSeconds: number | null;
    cuesThumbnail: string | null;
    videoUrl: string | null;
  }>;

  // Filter out exercises with contraindication overlap
  const filtered = allExercises.filter((exercise) => {
    if (clientLimitations.length === 0) return true;
    const contraLower = exercise.contraindications.map((c) => c.toLowerCase());
    return !clientLimitations.some((limitation) =>
      contraLower.some(
        (contra) =>
          contra.includes(limitation) || limitation.includes(contra)
      )
    );
  });

  // Pool must be large enough so the AI can pick unique exercises across all days
  const exercisesPerSession = params.circuits?.length
    ? params.circuits.reduce((sum, c) => sum + c.exerciseCount, 0)
    : (params.exercisesPerSession ?? 15);
  const exercisePoolLimit = Math.max(80, params.daysPerWeek * exercisesPerSession);
  const exercises = filtered.slice(0, exercisePoolLimit);

  if (exercises.length === 0) {
    throw new Error("No suitable exercises found for the given focus areas and client profile.");
  }

  const clientModeHint = programMode === 'CLINICAL'
    ? 'This client has documented clinical/rehab needs — use a DPT/rehab persona and framing.'
    : 'This client has no documented clinical/rehab need — use a strength & conditioning / general-fitness persona, not a rehab persona, unless the trainer instructions explicitly describe an injury or diagnosis.'

  const systemPrompt = `You are an expert exercise professional with deep knowledge in physical therapy, strength & conditioning, athletic performance, and general fitness. Create structured exercise programs that adapt to any program context — rehabilitation, athletic development, sports performance, or general fitness.

CLIENT CONTEXT MODE: ${clientModeHint}

PROGRAM DESIGN RULES:
1. STRUCTURE each session with phases appropriate to the program type. For rehab: Warm-up → Activation → Therapeutic work → Mobility → Cool-down. For athletic/performance: Dynamic warm-up → Power/Plyometrics → Strength work → Conditioning → Recovery. For general fitness: Warm-up → Main work → Cool-down.
2. SELECT exercises that match the stated focus areas, difficulty level, and any documented limitations or contraindications. Never prescribe an exercise that directly conflicts with listed contraindications.
3. EQUIPMENT: Use only exercises matching available equipment; default to bodyweight if none stated.
4. VOLUME: Scale to difficulty — BEGINNER: 2-3 sets; INTERMEDIATE: 3-4 sets; ADVANCED: 4-5 sets. Follow any explicit set/rep prescriptions in the trainer instructions.
5. VARIETY: Every training day MUST use a COMPLETELY DIFFERENT set of exercise IDs. Never use the same exerciseId on more than one day. Each session should feel like a fresh workout with its own exercise selection drawn from the provided pool.
6. SESSION NAMES: Use concise, descriptive names that reflect the actual training focus (e.g. "Lower Body Power", "Upper Body Pull", "Plyometric Development", "Mobility & Recovery") — not generic labels.
7. NOTES: Write 1-2 specific technique cues per exercise relevant to the program goal and client profile.
8. TIME: Total session time within 5 minutes of the requested duration.
9. GENERATE exercises for ALL ${params.daysPerWeek} days — do not stop after the first day.
10. CONTEXT-DRIVEN: If a diagnosis or subjective is provided, let it guide exercise selection and cue language. If athletic performance context is implied (plyometrics, power, sport-specific), adopt strength & conditioning principles rather than clinical rehab rules.

Respond with valid JSON only. No markdown, no explanation.`;

  const exerciseListStr = exercises
    .map(
      (e) =>
        `ID: ${e.id} | ${e.name} | Phase: ${e.exercisePhases.length ? e.exercisePhases.join("/") : "STRENGTHENING"} | Region: ${e.bodyRegion.join("/")} | Difficulty: ${e.difficultyLevel} | Muscles: ${e.musclesTargeted.join(", ")} | Equipment: ${e.equipmentRequired.join(", ") || "None"} | Video: ${e.videoUrl ? "Yes" : "No"} | Default Rx: ${e.defaultSets ?? 3}x${e.defaultReps ? e.defaultReps : e.defaultHoldSeconds ? e.defaultHoldSeconds + "s hold" : "10"} | Mistakes: ${e.commonMistakes || "N/A"} | Cues: ${e.cuesThumbnail || "N/A"}`
    )
    .join("\n");

  const circuits = params.circuits;
  const hasCircuits = circuits && circuits.length > 0;

  const totalExercisesPerSession = hasCircuits
    ? circuits.reduce((sum, c) => sum + c.exerciseCount, 0)
    : (params.exercisesPerSession ?? 6);

  const circuitStructureStr = hasCircuits
    ? circuits
        .map(
          (c, i) =>
            `  Circuit ${i} "${c.name}" (${c.focusType} focus): EXACTLY ${c.exerciseCount} exercise${c.exerciseCount !== 1 ? "s" : ""} PER SESSION/DAY`
        )
        .join("\n")
    : null;

  const userPrompt = `Create an exercise program with the following details:

${clientContext}

Program Parameters:
- Program Goals: ${(params.programGoals ?? params.focusAreas ?? []).join(", ")}
- Duration: ~${params.durationMinutes} minutes per session
- Days per Week: ${params.daysPerWeek}
- Difficulty Level: ${params.difficultyLevel}
- Allowed Weekdays: ${scheduleLabel} (${uniqueWeekdayIndices.join(", ")})
- Total Exercises Per Session: EXACTLY ${totalExercisesPerSession}
${hasCircuits ? `- Circuit Structure (EXACT — follow precisely):\n${circuitStructureStr}` : `- Circuits / Supersets: ${(params.circuitsPerSession ?? 0) === 0 ? "None — use straight sets only" : `${params.circuitsPerSession} circuit block(s) per session`}`}
${params.subjective ? `- Trainer Subjective: ${params.subjective}` : ""}
${params.trainerPrompt ? `- Trainer Instructions: ${params.trainerPrompt}` : ""}
${params.additionalNotes ? `- Additional Notes: ${params.additionalNotes}` : ""}

${hasCircuits ? `CIRCUIT ASSIGNMENT RULES (CRITICAL):
- Each exercise MUST include "circuitIndex" set to its 0-based circuit number (0, 1, 2, ...).
- Each circuit count is PER SESSION — every training day must have the FULL circuit exercise count, not a fraction of it.
- Example: if Circuit 0 requires 4 exercises and there are ${params.daysPerWeek} days, you must output 4 exercises with circuitIndex=0 for EACH day (${params.daysPerWeek * (circuits?.[0]?.exerciseCount ?? 0)} total for that circuit across all days).
- Total exercises in the "exercises" array must be EXACTLY ${totalExercisesPerSession * params.daysPerWeek} (${totalExercisesPerSession} per session × ${params.daysPerWeek} days).
- VARIETY (CRITICAL): Each day MUST use COMPLETELY DIFFERENT exercise IDs from every other day. NEVER repeat the same exerciseId across different dayOfWeek values. Treat each day as a fully independent workout and select a fresh set of exercises from the pool for each one. Do NOT copy Day 1's exercises to Day 2 or Day 3.
- Circuit focus guidelines for exercise selection:
  WARMUP → lightweight warm-up, joint mobility, gentle activation (prefer exercisePhases: WARMUP or ACTIVATION)
  LOWER_BODY → lower limb strength — quad, hamstring, glute, calf focus (bodyRegion: LOWER_BODY)
  UPPER_BODY → shoulder, arm, chest, upper back exercises (bodyRegion: UPPER_BODY)
  CORE → core stability, lumbar, abdominal (bodyRegion: CORE)
  FULL_BODY → compound multi-joint or functional movement exercises
  BALANCE → proprioception, single-leg stability, vestibular
  FLEXIBILITY → static stretch, PNF, foam rolling (prefer exercisePhases: MOBILITY)
  COOLDOWN → gentle cooldown, static stretch, breathing (prefer exercisePhases: COOLDOWN or MOBILITY)
  CARDIO → cardiovascular conditioning, sustained effort exercises` : `CRITICAL VOLUME RULE: Each day must have EXACTLY ${totalExercisesPerSession} exercises — no more, no less. Distribute them across the required phases (WARMUP → ACTIVATION → STRENGTHENING → MOBILITY → COOLDOWN).
VARIETY (CRITICAL): Each day MUST use COMPLETELY DIFFERENT exercise IDs from every other day. NEVER repeat the same exerciseId across different dayOfWeek values. Treat each day as a fully independent workout.`}

Available Exercises (use ONLY these exercise IDs):
${exerciseListStr}

Respond with this exact JSON structure:
{
  "title": "Program title",
  "description": "2-3 sentence clinical program description",
  "sessions": [
    { "dayOfWeek": 0, "name": "A short clinical session name, e.g. 'Hip Activation & Mobility' or 'Posterior Chain Strengthening'" }
  ],
  "exercises": [
    {
      "exerciseId": "the exercise ID from the list above",
      "exerciseName": "exercise name",
      "phase": "ACTIVATION",
      ${hasCircuits ? `"circuitIndex": 0,` : ""}
      "sets": 3,
      "reps": 15,
      "durationSeconds": null,
      "restSeconds": 30,
      "dayOfWeek": 0,
      "orderIndex": 2,
      "notes": "2-3 clinical form cues specific to this client"
    }
  ]
}

Each entry in "sessions" must have one entry per unique dayOfWeek used in exercises. The session name should reflect the actual focus of that day's exercises (e.g. body region, dominant phase, clinical goal) — not a generic label.

Rules:
1. ONLY use exercise IDs from the list provided
2. Respect client limitations and contraindications
3. Match the difficulty level requested
4. Distribute exercises across ${params.daysPerWeek} days using ONLY these weekday indexes: ${uniqueWeekdayIndices.join(", ")}
5. Keep total session time around ${params.durationMinutes} minutes
6. Use either reps OR durationSeconds per exercise, not both (set unused to null)
${hasCircuits ? `7. Assign "circuitIndex" to every exercise — it MUST match one of the circuit indexes (0 through ${circuits.length - 1})
8. Every day must have EXACTLY ${totalExercisesPerSession} exercises total, with EXACTLY the specified count per circuit — DO NOT split or distribute a circuit's count across days; repeat the full circuit on each day
9. Let the trainer instructions and subjective guide exercise selection, cue language, and loading strategy` : `7. Follow the phase ordering appropriate to the program type
8. Let the trainer instructions and subjective guide exercise selection, cue language, and loading strategy`}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 16000,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const responseText = response.choices[0].message.content ?? "";
  const parsed = JSON.parse(responseText) as GeneratedPlan;

  // Validate that all exercise IDs exist
  const exerciseIds = new Set(exercises.map((e) => e.id));
  const validExercises = parsed.exercises.filter((e) =>
    exerciseIds.has(e.exerciseId)
  );

  if (validExercises.length === 0) {
    throw new Error("AI generated no valid exercises. Please try again.");
  }

  // Group into day templates and deterministically swap out any exerciseId
  // that repeats across days, instead of only logging a warning about it.
  const dayGroups = new Map<number, GeneratedExercise[]>();
  for (const ex of validExercises) {
    const day = ex.dayOfWeek ?? 0;
    if (!dayGroups.has(day)) dayGroups.set(day, []);
    dayGroups.get(day)!.push(ex);
  }
  const dedupedTemplates = dedupeAcrossDays(
    Array.from(dayGroups.entries()).map(([dayOfWeek, dayExercises]) => ({
      dayOfWeek,
      exercises: dayExercises,
    })),
    exercises
  );
  const dedupedExercises = dedupedTemplates.flatMap((t) => t.exercises);

  // Post-processing: sort exercises per day by phase order
  const sortedExercises = [...dedupedExercises].sort((a, b) => {
    // First sort by day
    const dayA = a.dayOfWeek ?? 0;
    const dayB = b.dayOfWeek ?? 0;
    if (dayA !== dayB) return dayA - dayB;

    // Then by phase order
    const phaseA = PHASE_ORDER[a.phase] ?? 2;
    const phaseB = PHASE_ORDER[b.phase] ?? 2;
    if (phaseA !== phaseB) return phaseA - phaseB;

    // Then by original orderIndex
    return a.orderIndex - b.orderIndex;
  });

  // Reassign orderIndex after sorting
  let currentDay = -1;
  let dayOrder = 0;
  for (const exercise of sortedExercises) {
    const day = exercise.dayOfWeek ?? 0;
    if (day !== currentDay) {
      currentDay = day;
      dayOrder = 0;
    }
    exercise.orderIndex = dayOrder++;
  }

  return {
    ...parsed,
    exercises: sortedExercises,
  };
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
        sets: 1, // circuits: 1 set per exercise; block.rounds controls repetition
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
  sets?: number;
  reps?: number;
  durationSeconds?: number;
  notes?: string;
  traceableInDocument?: boolean;
};
type BlueprintBlock = { name: string; exercises: BlueprintExercise[] };
type BlueprintSession = { dayIndex: number; weekIndex?: number; title: string; blocks: BlueprintBlock[] };

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
        sets: 1,
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

  const allBriefExercises = await prisma.exercise.findMany({ where: { isActive: true } });

  const preferredDayIndices = (params.preferredWeekdays ?? [])
    .map((d) => weekdayToIndex[d.toLowerCase().trim()])
    .filter((d): d is number => Number.isInteger(d));

  function toActualDayOfWeek(dayIndex: number): number {
    if (preferredDayIndices.length === 0) return dayIndex;
    return preferredDayIndices[dayIndex % preferredDayIndices.length];
  }

  const sessions = params.sessionBlueprint.map((s) => ({
    dayOfWeek: toActualDayOfWeek(s.dayIndex),
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
          restSeconds: undefined,
          weekIndex: session.weekIndex ?? 0,
          dayOfWeek: toActualDayOfWeek(session.dayIndex),
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

  const clientContext = buildClientContextBlock(client, profile)

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
      "focusAreas": ["LOWER_BODY"],
      "difficultyLevel": "BEGINNER",
      "clinicalGuidance": "What to prioritize this week, specific technique or loading guidance",
      "contraindicationsThisWeek": ["loaded knee flexion >60°"],
      "progressionGoal": "What should the client achieve or improve by end of this week",
      "derivedIndicationTags": ["ACL", "knee", "quad-strengthening", "VMO"]
    }
  ]
}

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
