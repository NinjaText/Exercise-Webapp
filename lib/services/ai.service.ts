import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import type { BodyRegion, Exercise } from "@prisma/client";
import type { ClinicalPlan, ClinicalPlanParams, WeekPlan } from '@/lib/ai/types/program-generation'
import { filterByEquipment } from '@/lib/ai/utils/exercise-pool'

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
  sessionBlueprint?: {
    dayIndex: number;
    weekIndex?: number;
    title: string;
    blocks: {
      name: string;
      exercises: { name: string; sets?: number; reps?: number; durationSeconds?: number; notes?: string }[];
    }[];
  }[];
  weekPlan?: WeekPlan[]
  durationWeeks?: number
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

function scoreNameSimilarity(a: string, b: string) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.9;
  const aTokens = new Set(a.split(" "));
  const bTokens = new Set(b.split(" "));
  let overlap = 0;
  for (const t of aTokens) if (bTokens.has(t)) overlap += 1;
  return overlap / Math.max(1, Math.max(aTokens.size, bTokens.size));
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

const EXERCISE_POOL_SELECT = {
  id: true, name: true, bodyRegion: true, difficultyLevel: true,
  equipmentRequired: true, contraindications: true, description: true,
  musclesTargeted: true, exercisePhases: true, commonMistakes: true,
  defaultSets: true, defaultReps: true, defaultHoldSeconds: true,
  cuesThumbnail: true, videoUrl: true,
}

const VALID_BODY_REGIONS = new Set(['LOWER_BODY', 'UPPER_BODY', 'CORE', 'FULL_BODY', 'BALANCE', 'FLEXIBILITY'])

async function buildExercisePoolForWeek(
  weekPlan: WeekPlan,
  usedIds: Set<string>,
  clientLimitations: string[],
  availableEquipment?: string[]
): Promise<ExercisePoolItem[]> {
  const validRegions = weekPlan.focusAreas.filter(r => VALID_BODY_REGIONS.has(r))
  const regionsForQuery = validRegions.length > 0 ? validRegions : [...VALID_BODY_REGIONS]

  const baseWhere = {
    isActive: true,
    bodyRegion: { hasSome: regionsForQuery },
    ...(usedIds.size > 0 ? { id: { notIn: [...usedIds] } } : {}),
  }

  // Primary query: indication tags + rehab stage filtered
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pool = (await (prisma.exercise.findMany as any)({
    where: {
      ...baseWhere,
      rehabStage: weekPlan.rehabStage,
      ...(weekPlan.derivedIndicationTags.length > 0
        ? { indicationTags: { hasSome: weekPlan.derivedIndicationTags } }
        : {}),
    },
    select: EXERCISE_POOL_SELECT,
    take: 60,
  })) as ExercisePoolItem[]

  // Fallback: if primary pool too small, use body-region-only filter
  if (pool.length < 20) {
    pool = (await (prisma.exercise.findMany as any)({
      where: baseWhere,
      select: EXERCISE_POOL_SELECT,
      take: 60,
    })) as ExercisePoolItem[]
  }

  // Apply client contraindication filter
  const afterContraFilter = clientLimitations.length === 0
    ? pool
    : pool.filter(exercise => {
        const contraLower = exercise.contraindications.map((c: string) => c.toLowerCase())
        return !clientLimitations.some((limitation: string) =>
          contraLower.some(
            (contra: string) =>
              contra.includes(limitation.toLowerCase()) ||
              limitation.toLowerCase().includes(contra)
          )
        )
      })

  // Apply equipment filter
  return filterByEquipment(afterContraFilter, availableEquipment ?? [])
}

async function pickClosestExerciseNameAI(
  target: string,
  candidates: string[]
) {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 400,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Select the single closest exercise name from the candidate list. Return JSON: { \"bestName\": string }. No extra text.",
      },
      {
        role: "user",
        content: `Target: ${target}\nCandidates:\n${candidates.join("\n")}`,
      },
    ],
  });

  const payload = response.choices[0].message.content ?? "{}";
  const parsed = JSON.parse(payload) as { bestName?: string };
  return parsed.bestName || "";
}

export async function resolveExerciseByName(
  name: string,
  candidates: Exercise[]
): Promise<{ exercise: Exercise | null; matchType: "exact" | "fuzzy" | "none" }> {
  const normalizedTarget = normalizeExerciseName(name);
  const exact = candidates.find(
    (e) => normalizeExerciseName(e.name) === normalizedTarget
  );
  if (exact) return { exercise: exact, matchType: "exact" };

  const ranked = candidates
    .map((e) => ({
      exercise: e,
      score: scoreNameSimilarity(normalizeExerciseName(e.name), normalizedTarget),
    }))
    .sort((a, b) => b.score - a.score);

  if (!ranked.length) return { exercise: null, matchType: "none" };

  const top = ranked.slice(0, 20).map((r) => r.exercise.name);
  const aiPick = await pickClosestExerciseNameAI(name, top);
  const best = candidates.find((e) => e.name === aiPick) ?? ranked[0].exercise;
  return { exercise: best, matchType: "fuzzy" };
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const profileExtended = profile as any;

  function calculateWeeksSince(date: Date): number {
    return Math.round((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24 * 7));
  }

  const clientContext = client
    ? `CLIENT PROFILE:
Name: ${client.firstName} ${client.lastName}
Primary Diagnosis / Goal: ${profileExtended?.primaryDiagnosis ?? "Not specified"}
Secondary Conditions: ${profileExtended?.secondaryDiagnoses?.length ? profileExtended.secondaryDiagnoses.join(", ") : "None"}
Current Pain Score: ${profileExtended?.painScore != null ? `${profileExtended.painScore}/10` : "Not assessed"}
Activity Level: ${profileExtended?.activityLevel ?? "Not assessed"}
Physical Limitations: ${profile?.limitations ?? "None documented"}
Comorbidities: ${profile?.comorbidities ?? "None"}
Functional Challenges: ${profile?.functionalChallenges ?? "None"}
History: ${profileExtended?.surgeryHistory ?? "None documented"}
Occupation: ${profileExtended?.occupation ?? "Not specified"}
Time Since Injury/Surgery: ${profileExtended?.injuryDate ? calculateWeeksSince(new Date(profileExtended.injuryDate)) + " weeks ago" : "Not specified"}
Prior Injuries: ${profileExtended?.priorInjuries?.length ? profileExtended.priorInjuries.join(", ") : "None"}
Available Equipment: ${profile?.availableEquipment?.length ? profile.availableEquipment.join(", ") : "Bodyweight only"}
Goals: ${profile?.fitnessGoals?.length ? profile.fitnessGoals.join(", ") : "General fitness"}`
    : "No specific client assigned. Create a general program suitable for the parameters below.";

  // === Multi-week clinical path (Step 1 plan provided) ===
  if (params.weekPlan && params.weekPlan.length > 0) {
    const weekPlans = params.weekPlan
    const globalUsedIds = new Set<string>()

    // Build per-week exercise pools (parallel DB queries)
    const weekPools: ExercisePoolItem[][] = await Promise.all(
      weekPlans.map(wPlan =>
        buildExercisePoolForWeek(wPlan, globalUsedIds, clientLimitations, params.availableEquipment)
      )
    )

    // Track used IDs globally — exercises used in earlier weeks are excluded from later week queries
    // Note: pools are built in parallel so global dedup happens at prompt level (AI instructed not to repeat)
    // Post-generation validation enforces cross-week uniqueness

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

    // Generate one week at a time to stay within the LLM output token limit.
    // A single call for all weeks would require ~500 tokens per exercise × daysPerWeek × weeks × exercisesPerSession,
    // which easily exceeds GPT-4o's 16,384-token output cap for programs with 3+ days and 10+ exercises per session.
    const perWeekSystemPrompt = `You are an expert DPT and strength & conditioning coach. Generate exercises for ONE week of a rehabilitation program following the provided clinical guidance. Use ONLY exercise IDs from the provided pool. Never invent IDs.

RULES:
1. Use ONLY exercise IDs from the provided pool.
2. Every training day must have EXACTLY ${totalExercisesPerSession} exercises.
3. Follow the clinical guidance and contraindications strictly.
4. Write 1-2 specific technique cues per exercise relevant to this week's clinical goals.
5. Distribute sessions using ONLY these weekday indexes: ${uniqueDayIndices.join(', ')}.
6. Session names must reflect the actual week focus — not generic labels.
${hasCircuits ? `7. Each exercise MUST include circuitIndex (0-based). Circuit structure per session:\n${circuitStructureStr}` : ''}

Respond with valid JSON only.`

    // Fire all week calls in parallel — wall-clock time = slowest single week (~15s) not sum of all weeks.
    // Each week uses its own rehab-stage-filtered pool so cross-week exercise overlap is naturally low.
    const weekResults = await Promise.all(
      weekPlans.map(async (wPlan, weekIdx) => {
        const pool = weekPools[weekIdx]
        const poolStr = pool
          .map(
            e =>
              `ID: ${e.id} | ${e.name} | Phase: ${e.exercisePhases.length ? e.exercisePhases.join('/') : 'STRENGTHENING'} | Region: ${e.bodyRegion.join('/')} | Difficulty: ${e.difficultyLevel} | Muscles: ${e.musclesTargeted.join(', ')} | Equipment: ${e.equipmentRequired.join(', ') || 'None'} | Default Rx: ${e.defaultSets ?? 3}x${e.defaultReps ? e.defaultReps : e.defaultHoldSeconds ? e.defaultHoldSeconds + 's hold' : '10'}`
          )
          .join('\n')

        const totalExercisesThisWeek = params.daysPerWeek * totalExercisesPerSession

        const jsonFormat = weekIdx === 0
          ? `{
  "title": "Program title",
  "description": "2-3 sentence clinical program description",
  "sessions": [{ "dayOfWeek": 0, "weekIndex": ${weekIdx}, "name": "Clinical session name" }],
  "exercises": [{
    "exerciseId": "id from pool", "exerciseName": "name", "phase": "ACTIVATION",
    ${hasCircuits ? '"circuitIndex": 0,' : ''}
    "sets": 3, "reps": 15, "durationSeconds": null, "restSeconds": 30,
    "dayOfWeek": 0, "weekIndex": ${weekIdx}, "orderIndex": 0, "notes": "1-2 technique cues"
  }]
}`
          : `{
  "sessions": [{ "dayOfWeek": 0, "weekIndex": ${weekIdx}, "name": "Clinical session name" }],
  "exercises": [{
    "exerciseId": "id from pool", "exerciseName": "name", "phase": "ACTIVATION",
    ${hasCircuits ? '"circuitIndex": 0,' : ''}
    "sets": 3, "reps": 15, "durationSeconds": null, "restSeconds": 30,
    "dayOfWeek": 0, "weekIndex": ${weekIdx}, "orderIndex": 0, "notes": "1-2 technique cues"
  }]
}`

        const weekUserPrompt = `${clientContext}

Week ${wPlan.week} of ${totalWeeks}: ${wPlan.title} (${wPlan.rehabStage})
Clinical Guidance: ${wPlan.clinicalGuidance}
Progression Goal: ${wPlan.progressionGoal}
Contraindicated This Week: ${wPlan.contraindicationsThisWeek.join(', ') || 'None'}

Program: ${params.daysPerWeek} sessions this week, ~${params.durationMinutes} min/session, weekIndex=${weekIdx}
Total exercises in output: EXACTLY ${totalExercisesThisWeek} (${totalExercisesPerSession} per session × ${params.daysPerWeek} days)
${params.subjective ? `Trainer Subjective: ${params.subjective}` : ''}
${params.trainerPrompt ? `Trainer Instructions: ${params.trainerPrompt}` : ''}

Available Exercises (use ONLY these IDs):
${poolStr || 'No tagged exercises found — use general bodyweight exercises appropriate for this rehab stage.'}

Respond with this exact JSON:
${jsonFormat}`

        const weekResponse = await openai.chat.completions.create({
          model: 'gpt-4o',
          max_tokens: 8000,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: perWeekSystemPrompt },
            { role: 'user', content: weekUserPrompt },
          ],
        })

        const weekParsed = JSON.parse(weekResponse.choices[0].message.content ?? '{}') as Partial<GeneratedPlan>
        const weekPoolIds = new Set(pool.map(e => e.id))
        const validExercises = (weekParsed.exercises ?? []).filter(e => weekPoolIds.has(e.exerciseId))

        // Force correct weekIndex in case AI drifted
        for (const ex of validExercises) ex.weekIndex = weekIdx
        const sessions = (weekParsed.sessions ?? []).map(s => ({ ...s, weekIndex: weekIdx }))

        return { weekIdx, sessions, exercises: validExercises, title: weekParsed.title, description: weekParsed.description }
      })
    )

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

    return {
      title: programTitle || 'AI Generated Program',
      description: programDescription,
      sessions: allCollectedSessions,
      exercises: sorted,
    }
  }
  // === END multi-week path ===

  if (params.sessionBlueprint?.length) {
    const circuits = params.circuits || [];
    const circuitNameMap = new Map(
      circuits.map((c, idx) => [normalizeExerciseName(c.name), idx])
    );

    const allBriefExercises = await prisma.exercise.findMany({
      where: { isActive: true },
    });

    const warnings: string[] = [];

    // Map per-week dayIndex (0,1,2) → actual weekday index using preferredWeekdays
    // e.g. ["Monday","Wednesday","Friday"] → [0,2,4], so dayIndex 1 → Wednesday (2) not Tuesday (1)
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

    const exercisesOutput: GeneratedExercise[] = [];

    for (const session of params.sessionBlueprint) {
      let orderIndex = 0;
      for (let blockIdx = 0; blockIdx < session.blocks.length; blockIdx += 1) {
        const block = session.blocks[blockIdx];
        const blockKey = normalizeExerciseName(block.name);
        const circuitIndex =
          circuitNameMap.get(blockKey) ?? Math.min(blockIdx, Math.max(0, circuits.length - 1));

        for (const exerciseBp of block.exercises) {
          // Only flag exercises with NO library match at all — a document with
          // any real amount of content produces a fuzzy match for nearly every
          // exercise (different naming conventions are the norm, not the
          // exception), so confirming each one would bury the trainer in noise.
          const { exercise } = await resolveExerciseByName(exerciseBp.name, allBriefExercises);
          if (!exercise) {
            warnings.push(
              `"${exerciseBp.name}" has no matching exercise in the library and was skipped from "${session.title}".`
            );
            continue;
          }

          // Prefer sets/reps from the brief; fall back to library defaults
          const sets = exerciseBp.sets ?? exercise.defaultSets ?? 3;
          const hasDuration =
            exerciseBp.durationSeconds != null ||
            (exerciseBp.reps == null && exercise.defaultHoldSeconds != null);
          const reps = hasDuration ? undefined : (exerciseBp.reps ?? exercise.defaultReps ?? 10);
          const durationSeconds =
            exerciseBp.durationSeconds ??
            (hasDuration ? (exercise.defaultHoldSeconds ?? undefined) : undefined);

          const focusType = circuits[circuitIndex]?.focusType?.toUpperCase();
          const phase =
            focusType === "WARMUP"
              ? "WARMUP"
              : focusType === "COOLDOWN"
                ? "COOLDOWN"
                : focusType === "FLEXIBILITY"
                  ? "MOBILITY"
                  : focusType === "CARDIO"
                    ? "ACTIVATION"
                    : focusType === "BALANCE"
                      ? "ACTIVATION"
                      : "STRENGTHENING";

          exercisesOutput.push({
            exerciseId: exercise.id,
            exerciseName: exercise.name,
            phase,
            circuitIndex,
            sets,
            reps,
            durationSeconds,
            restSeconds: undefined,
            weekIndex: session.weekIndex ?? 0,
            dayOfWeek: toActualDayOfWeek(session.dayIndex),
            orderIndex: orderIndex++,
            notes: exerciseBp.notes ?? undefined,
          });
        }
      }
    }

    const programTitle =
      params.programTitle ||
      params.trainerPrompt?.split("\n")?.[0]?.replace(/^Program title:\s*/i, "").trim() ||
      "Athletic Program";

    return {
      title: programTitle,
      description: "Generated from uploaded brief",
      sessions,
      exercises: exercisesOutput,
      warnings,
    };
  }

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

  const systemPrompt = `You are an expert exercise professional with deep knowledge in physical therapy, strength & conditioning, athletic performance, and general fitness. Create structured exercise programs that adapt to any program context — rehabilitation, athletic development, sports performance, or general fitness.

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

  // Post-processing: sort exercises per day by phase order
  const sortedExercises = [...validExercises].sort((a, b) => {
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

  // Detect cross-day duplicates (log but allow)
  const allUsedIds = sortedExercises.map((e) => e.exerciseId);
  const duplicateIds = allUsedIds.filter(
    (id, i) => allUsedIds.indexOf(id) !== i
  );
  if (duplicateIds.length > 0) {
    console.warn(
      `[AI] Cross-day duplicate exercises detected: ${[...new Set(duplicateIds)].join(", ")}`
    );
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

export async function generateClinicalPlan(
  params: ClinicalPlanParams
): Promise<ClinicalPlan> {
  const client = params.clientId
    ? await prisma.user.findUnique({
        where: { id: params.clientId },
        include: { clientProfile: true },
      })
    : null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const profile = client?.clientProfile as any ?? null

  const clientContext = client
    ? `Client: ${client.firstName} ${client.lastName}
Primary Diagnosis: ${profile?.primaryDiagnosis ?? 'Not specified'}
Secondary Conditions: ${profile?.secondaryDiagnoses?.length ? profile.secondaryDiagnoses.join(', ') : 'None'}
Pain Score: ${profile?.painScore != null ? `${profile.painScore}/10` : 'Not assessed'}
Activity Level: ${profile?.activityLevel ?? 'Not assessed'}
Physical Limitations: ${profile?.limitations ?? 'None documented'}
Comorbidities: ${profile?.comorbidities ?? 'None'}
Functional Challenges: ${profile?.functionalChallenges ?? 'None'}
Surgery/Injury History: ${profile?.surgeryHistory ?? 'None documented'}
Time Since Injury/Surgery: ${profile?.injuryDate ? Math.round((Date.now() - new Date(profile.injuryDate).getTime()) / (1000 * 60 * 60 * 24 * 7)) + ' weeks ago' : 'Not specified'}
Goals: ${profile?.fitnessGoals?.length ? profile.fitnessGoals.join(', ') : 'General fitness'}`
    : 'No specific client — create a general program.'

  const circuitSummary = params.circuits
    .map(c => `  - ${c.name} (${c.focusType}): ${c.exerciseCount} exercises, ${c.rounds} sets`)
    .join('\n')

  const systemPrompt = `You are an expert Doctor of Physical Therapy (DPT). Analyze the client profile and program parameters, then produce a week-by-week clinical rehabilitation plan as JSON.

Think step-by-step:
1. Identify the client's current rehabilitation phase based on diagnosis, time post-injury, pain score, and limitations.
2. Plan each week as a clinically distinct, progressive stage toward the client's goals.
3. Assign an appropriate rehabStage to each week: EARLY_REHAB (pain control, ROM, gentle activation), MID_REHAB (progressive strengthening, neuromuscular control), LATE_REHAB (functional loading, activity-specific), or MAINTENANCE (general fitness, prevention).
4. For each week, specify what is contraindicated THIS specific week — this may differ from the global contraindications.
5. Derive indication tags (lowercase, hyphenated clinical keywords) that should be used to find appropriate exercises for each week.

Respond with valid JSON only. No markdown, no explanation.`

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
  "clinicalAssessment": "2-3 sentence clinical assessment of this client's current state and appropriate rehabilitation approach",
  "weeklyPlan": [
    {
      "week": 1,
      "title": "Short descriptive week title",
      "rehabStage": "EARLY_REHAB",
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

  return parsed
}
