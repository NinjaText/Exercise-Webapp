/**
 * Regression tests for the Generate-with-AI code path (a Step-1 week plan is
 * always present). Before the shared prompt module existed this path used a
 * short per-phase prompt with no hard-constraint handling, no Additional
 * Notes, no equipment statement, and an unfiltered backfill pool — so trainer
 * exclusions like "no plyometrics" were ignored in production.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockCreate, mockFindMany, mockFindUnique } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockFindMany: vi.fn(),
  mockFindUnique: vi.fn(),
}))
vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = { completions: { create: mockCreate } }
  },
}))
vi.mock('@/lib/prisma', () => ({
  prisma: { exercise: { findMany: mockFindMany }, user: { findUnique: mockFindUnique } },
}))

import { generateWorkoutPlan, generateProgram } from '../ai.service'
import type { WeekPlan } from '@/lib/ai/types/program-generation'

function ex(id: string, name: string, overrides: Record<string, unknown> = {}) {
  return {
    id, name,
    bodyRegion: ['LOWER_BODY'], difficultyLevel: 'INTERMEDIATE', equipmentRequired: [],
    contraindications: [], description: null, musclesTargeted: ['quads'], exercisePhases: ['STRENGTHENING'],
    commonMistakes: null, defaultSets: 3, defaultReps: 10, defaultHoldSeconds: null,
    cuesThumbnail: null, videoUrl: null, rehabStage: null, indicationTags: [],
    ...overrides,
  }
}

const library = [
  ex('march', 'Standing March in Place', { exercisePhases: ['WARMUP'] }),
  ex('pogo', 'Double-Leg Pogo Hops', { exercisePhases: ['ACTIVATION'] }),
  ex('strides', 'Running Strides Drill', { exercisePhases: ['WARMUP', 'ACTIVATION'] }),
  ex('legswing', 'Leg Swings', { exercisePhases: ['WARMUP'] }),
  ex('goblet', 'Goblet Squat', { difficultyLevel: 'BEGINNER', equipmentRequired: ['Dumbbells'] }),
  ex('rfess', 'Dumbbell Split Squat', { equipmentRequired: ['dumbbells'] }),
  ex('bench', 'Bench Step-Up', { equipmentRequired: ['bench'] }),
  ex('bridge', 'Glute Bridges'),
  ex('lunge', 'Lunges'),
  ex('rdl', 'Single-Leg Romanian Deadlift'),
  ex('bound', 'Lateral Bound with Stick'),
  ex('deep', 'Deep Squat', { exercisePhases: ['STRENGTHENING', 'MOBILITY'] }),
  ex('9090', '90/90 Hip Stretch', { exercisePhases: ['MOBILITY'] }),
  ex('hamstretch', 'Standing Hamstring Stretch', { exercisePhases: ['COOLDOWN'] }),
  ex('quadstretch', 'Standing Quad Stretch', { exercisePhases: ['COOLDOWN'] }),
  ex('calf', 'Calf Raises', { exercisePhases: ['STRENGTHENING'] }),
  ex('lunge2', 'Lunges', { exercisePhases: ['STRENGTHENING'] }),
  ex('mcgill1', 'McGill Curl-Up', { bodyRegion: ['CORE'] }),
  ex('mcgill2', 'Curl-Ups (McGill)', { bodyRegion: ['CORE'] }),
]

const circuits = [
  { name: 'Warm Up', focusType: 'WARMUP', exerciseCount: 2, rounds: 1, restBetweenRounds: null },
  { name: 'Lower Body', focusType: 'LOWER_BODY', exerciseCount: 3, rounds: 3, restBetweenRounds: 60 },
  { name: 'Cool Down', focusType: 'COOLDOWN', exerciseCount: 1, rounds: 1, restBetweenRounds: null },
]

const weekPlan: WeekPlan[] = [1, 2].map(week => ({
  week, title: `Week ${week}`, rehabStage: 'BASE_BUILD', programMode: 'PERFORMANCE',
  focusAreas: ['LOWER_BODY'], difficultyLevel: 'INTERMEDIATE',
  clinicalGuidance: 'Build base strength', contraindicationsThisWeek: [], progressionGoal: 'Consistency',
  derivedIndicationTags: [],
}))

function modelReturns(dayTemplates: unknown[]) {
  mockCreate.mockResolvedValue({
    choices: [{ message: { content: JSON.stringify({ title: 'T', description: 'D', dayTemplates }) } }],
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFindMany.mockResolvedValue(library)
  mockFindUnique.mockResolvedValue(null)
})

const baseParams = {
  clientId: null,
  programGoals: ['Athletic Performance'],
  availableEquipment: ['Dumbbells'],
  durationMinutes: 45,
  daysPerWeek: 2,
  durationWeeks: 2,
  circuits,
  preferredWeekdays: ['Monday', 'Thursday'],
  difficultyLevel: 'INTERMEDIATE',
  weekPlan,
  subjective: 'Healthy recreational athlete.',
  trainerPrompt: 'No plyometrics. Strength only. Include Goblet Squat in every lower body session at 4 sets of 6 reps.',
  additionalNotes: 'Do not use any single-leg balance exercises.',
}

describe('generateWorkoutPlan — multi-week (Generate-with-AI) path', () => {
  it('builds the per-phase prompt from the shared Inmotus module with all trainer directives', async () => {
    modelReturns([])
    await generateWorkoutPlan(baseParams).catch(() => undefined)
    expect(mockCreate).toHaveBeenCalledTimes(1)
    const [{ messages }] = mockCreate.mock.calls[0]
    const system = messages[0].content as string
    const user = messages[1].content as string
    expect(system).toContain('INMOTUS EXERCISE PROGRAMMING SYSTEM')
    expect(system).toContain('ONE PHASE OF A MULTI-WEEK PROGRAM')
    expect(system).toContain('POST-GENERATION HARD-CONSTRAINT AUDIT')
    expect(user).toContain('CURRENT TRAINER SUBJECTIVE')
    expect(user).toContain('Do not use any single-leg balance exercises.')
    expect(user).toContain('EQUIPMENT AVAILABLE FOR THIS PROGRAM')
    expect(user).toContain('Dumbbells — use ONLY exercises')
    expect(user).toContain('TRAINER-REQUIRED EXERCISES')
    expect(user).toContain('Goblet Squat (exerciseId: goblet)')
    expect(user).toContain('FINAL CONSTRAINT AUDIT')
    expect(user).toContain('CIRCUIT CANDIDATE INDEX')
    expect(user).toMatch(/Time Budget: 45 min ≈ \d+ exercise slots/)
  })

  it('removes hard-constraint violators and unavailable-equipment exercises from the offered pool, but keeps the trainer-named exercise despite its difficulty', async () => {
    modelReturns([])
    await generateWorkoutPlan(baseParams).catch(() => undefined)
    const user = mockCreate.mock.calls[0][0].messages[1].content as string
    expect(user).not.toContain('ID: pogo ')
    expect(user).not.toContain('ID: strides ')
    expect(user).not.toContain('ID: bound ')
    expect(user).not.toContain('ID: bench ')
    expect(user).toContain('ID: goblet ')
    expect(user).toContain('ID: rfess ')
    expect(user).toContain('ID: quadstretch ')
  })

  it('audits the model output: swaps violators, dedupes within a session, inserts a dropped required exercise, backfills circuits from the filtered pool, and holds prescribed dosage fixed', async () => {
    modelReturns([
      { dayOfWeek: 0, sessionName: 'Lower A', exercises: [
        { exerciseId: 'march', exerciseName: 'Standing March in Place', phase: 'WARMUP', circuitIndex: 0, baseSets: 1, baseReps: 20, trainerPrescribedDosage: false },
        { exerciseId: 'pogo', exerciseName: 'Double-Leg Pogo Hops', phase: 'WARMUP', circuitIndex: 0, baseSets: 1, baseReps: 10, trainerPrescribedDosage: false },
        { exerciseId: 'goblet', exerciseName: 'Goblet Squat', phase: 'STRENGTHENING', circuitIndex: 1, baseSets: 4, baseReps: 6, trainerPrescribedDosage: true },
        { exerciseId: 'lunge', exerciseName: 'Lunges', phase: 'STRENGTHENING', circuitIndex: 1, baseSets: 3, baseReps: 10, trainerPrescribedDosage: false },
        { exerciseId: 'lunge', exerciseName: 'Lunges', phase: 'STRENGTHENING', circuitIndex: 1, baseSets: 3, baseReps: 10, trainerPrescribedDosage: false },
        { exerciseId: 'quadstretch', exerciseName: 'Standing Quad Stretch', phase: 'COOLDOWN', circuitIndex: 2, baseSets: 1, baseDurationSeconds: 30, trainerPrescribedDosage: false },
      ] },
      { dayOfWeek: 3, sessionName: 'Lower B', exercises: [
        { exerciseId: 'legswing', exerciseName: 'Leg Swings', phase: 'WARMUP', circuitIndex: 0, baseSets: 1, baseReps: 12, trainerPrescribedDosage: false },
        { exerciseId: 'march', exerciseName: 'Standing March in Place', phase: 'WARMUP', circuitIndex: 0, baseSets: 1, baseReps: 20, trainerPrescribedDosage: false },
        { exerciseId: 'bridge', exerciseName: 'Glute Bridges', phase: 'STRENGTHENING', circuitIndex: 1, baseSets: 3, baseReps: 12, trainerPrescribedDosage: false },
        { exerciseId: 'rfess', exerciseName: 'Dumbbell Split Squat', phase: 'STRENGTHENING', circuitIndex: 1, baseSets: 3, baseReps: 8, trainerPrescribedDosage: false },
        { exerciseId: 'deep', exerciseName: 'Deep Squat', phase: 'STRENGTHENING', circuitIndex: 1, baseSets: 3, baseReps: 8, trainerPrescribedDosage: false },
        { exerciseId: 'hamstretch', exerciseName: 'Standing Hamstring Stretch', phase: 'COOLDOWN', circuitIndex: 2, baseSets: 1, baseDurationSeconds: 30, trainerPrescribedDosage: false },
      ] },
    ])

    const plan = await generateWorkoutPlan(baseParams)
    const names = plan.exercises.map(e => e.exerciseName)
    expect(names).not.toContain('Double-Leg Pogo Hops')
    expect(names).not.toContain('Running Strides Drill')
    expect(names).not.toContain('Lateral Bound with Stick')

    // 2 weeks × 2 days × 6 exercises, exact circuit counts, no within-session duplicates
    expect(plan.exercises).toHaveLength(24)
    for (const week of [0, 1]) for (const day of [0, 3]) {
      const session = plan.exercises.filter(e => e.weekIndex === week && e.dayOfWeek === day)
      expect(session).toHaveLength(6)
      expect(new Set(session.map(e => e.exerciseId)).size).toBe(6)
      expect(session.filter(e => e.circuitIndex === 0)).toHaveLength(2)
      expect(session.filter(e => e.circuitIndex === 1)).toHaveLength(3)
      expect(session.filter(e => e.circuitIndex === 2)).toHaveLength(1)
    }

    // Goblet Squat 4x6 is prescribed: present in day 0 AND inserted into day 3, fixed across weeks
    const goblets = plan.exercises.filter(e => e.exerciseId === 'goblet')
    expect(goblets).toHaveLength(4)
    for (const g of goblets) {
      expect(g.sets).toBe(4)
      expect(g.reps).toBe(6)
      expect(g.trainerPrescribedDosage).toBe(true)
    }
    expect(plan.warnings?.some(w => w.includes('Goblet Squat'))).toBe(true)

    // A non-prescribed exercise still progresses week over week
    const lungesW1 = plan.exercises.find(e => e.exerciseId === 'lunge' && e.weekIndex === 0)!
    const lungesW2 = plan.exercises.find(e => e.exerciseId === 'lunge' && e.weekIndex === 1)!
    expect(lungesW2.reps!).toBeGreaterThan(lungesW1.reps!)
  })
})

describe('generateProgram — circuit blocks', () => {
  it('keeps trainer-prescribed sets inside circuit blocks instead of collapsing to 1', async () => {
    modelReturns([
      { dayOfWeek: 0, sessionName: 'Lower A', exercises: [
        { exerciseId: 'march', exerciseName: 'Standing March in Place', phase: 'WARMUP', circuitIndex: 0, baseSets: 1, baseReps: 20, trainerPrescribedDosage: false },
        { exerciseId: 'legswing', exerciseName: 'Leg Swings', phase: 'WARMUP', circuitIndex: 0, baseSets: 1, baseReps: 12, trainerPrescribedDosage: false },
        { exerciseId: 'goblet', exerciseName: 'Goblet Squat', phase: 'STRENGTHENING', circuitIndex: 1, baseSets: 4, baseReps: 6, trainerPrescribedDosage: true },
        { exerciseId: 'lunge', exerciseName: 'Lunges', phase: 'STRENGTHENING', circuitIndex: 1, baseSets: 3, baseReps: 10, trainerPrescribedDosage: false },
        { exerciseId: 'bridge', exerciseName: 'Glute Bridges', phase: 'STRENGTHENING', circuitIndex: 1, baseSets: 3, baseReps: 12, trainerPrescribedDosage: false },
        { exerciseId: 'quadstretch', exerciseName: 'Standing Quad Stretch', phase: 'COOLDOWN', circuitIndex: 2, baseSets: 1, baseDurationSeconds: 30, trainerPrescribedDosage: false },
      ] },
    ])
    const program = await generateProgram({ ...baseParams, daysPerWeek: 1, preferredWeekdays: ['Monday'], weekPlan: [weekPlan[0]] })
    const lower = program.workouts[0].blocks.find(b => b.circuitIndex === 1)!
    const goblet = lower.exercises.find(e => e.exerciseId === 'goblet')!
    const lunges = lower.exercises.find(e => e.exerciseId === 'lunge')!
    expect(goblet.sets).toBe(4)
    expect(goblet.reps).toBe('6')
    expect(lunges.sets).toBe(1)
    expect(lower.rounds).toBe(3)
  })
})

describe('generateWorkoutPlan — circuit content and dosage-flag gating', () => {
  it('swaps a stretch out of a strength circuit, dedupes same-named exercises, and ignores a prescribed-dosage flag the trainer never backed with numbers', async () => {
    modelReturns([
      { dayOfWeek: 0, sessionName: 'Lower A', exercises: [
        { exerciseId: 'march', exerciseName: 'Standing March in Place', phase: 'WARMUP', circuitIndex: 0, baseSets: 1, baseReps: 20, trainerPrescribedDosage: false },
        { exerciseId: 'quadstretch', exerciseName: 'Standing Quad Stretch', phase: 'WARMUP', circuitIndex: 0, baseSets: 1, baseDurationSeconds: 30, trainerPrescribedDosage: false },
        { exerciseId: '9090', exerciseName: '90/90 Hip Stretch', phase: 'STRENGTHENING', circuitIndex: 1, baseSets: 3, baseReps: 10, trainerPrescribedDosage: false },
        { exerciseId: 'calf', exerciseName: 'Calf Raises', phase: 'STRENGTHENING', circuitIndex: 1, baseSets: 3, baseReps: 15, trainerPrescribedDosage: true },
        { exerciseId: 'lunge', exerciseName: 'Lunges', phase: 'STRENGTHENING', circuitIndex: 1, baseSets: 3, baseReps: 10, trainerPrescribedDosage: false },
        { exerciseId: 'lunge2', exerciseName: 'Lunges', phase: 'STRENGTHENING', circuitIndex: 1, baseSets: 3, baseReps: 10, trainerPrescribedDosage: false },
        { exerciseId: 'mcgill1', exerciseName: 'McGill Curl-Up', phase: 'STRENGTHENING', circuitIndex: 1, baseSets: 3, baseReps: 8, trainerPrescribedDosage: false },
        { exerciseId: 'mcgill2', exerciseName: 'Curl-Ups (McGill)', phase: 'STRENGTHENING', circuitIndex: 1, baseSets: 3, baseReps: 8, trainerPrescribedDosage: false },
        { exerciseId: 'hamstretch', exerciseName: 'Standing Hamstring Stretch', phase: 'COOLDOWN', circuitIndex: 2, baseSets: 1, baseDurationSeconds: 30, trainerPrescribedDosage: false },
      ] },
    ])
    const plan = await generateWorkoutPlan({
      ...baseParams, daysPerWeek: 1, preferredWeekdays: ['Monday'], weekPlan: [weekPlan[0]],
      trainerPrompt: 'Include Calf Raises every session.', additionalNotes: undefined,
    })
    const names = plan.exercises.map(e => e.exerciseName)
    // stretch swapped out of the LOWER_BODY circuit; a COOLDOWN-only stretch swapped out of the warm-up
    expect(plan.exercises.find(e => e.circuitIndex === 1 && e.exerciseId === '9090')).toBeUndefined()
    expect(plan.exercises.find(e => e.circuitIndex === 0 && e.exerciseId === 'quadstretch')).toBeUndefined()
    // duplicate names removed (plural and word-order variants), then circuit trimmed/backfilled to exactly 3
    expect(names.filter(n => n === 'Lunges')).toHaveLength(1)
    expect(names.filter(n => /mcgill/i.test(n)).length).toBeLessThanOrEqual(1)
    expect(plan.exercises.filter(e => e.circuitIndex === 1)).toHaveLength(3)
    // flag ignored: trainer gave no numbers
    const calf = plan.exercises.find(e => e.exerciseId === 'calf')!
    expect(calf.trainerPrescribedDosage).toBe(false)
  })
})
