/**
 * LIVE acceptance tests (Inmotus spec section 8) — calls the real
 * generateWorkoutPlan() against the real DB and a real OpenAI (gpt-4o) API
 * call to verify the Layer 1/2/3 hard-constraint prompts are actually
 * obeyed, not just present in the prompt text.
 *
 * SKIPPED BY DEFAULT — costs real API tokens per run (~5 calls, ~$0.01-0.05
 * total on gpt-4o). Run explicitly with:
 *   RUN_LIVE_AI_TESTS=1 npx vitest run lib/services/__tests__/ai.service.hard-constraints.acceptance.test.ts
 */
import 'dotenv/config'
import { describe, it, expect } from 'vitest'
import { generateWorkoutPlan } from '@/lib/services/ai.service'
import { exerciseViolatesHardConstraints, extractHardConstraints } from '@/lib/ai/utils/hard-constraints'

const describeLive = process.env.RUN_LIVE_AI_TESTS ? describe : describe.skip

// focusAreas: ['full body'] targets the FULL_BODY pool specifically (64
// exercises total) rather than the broader "all regions, first 80 by
// insertion order" pool — confirmed via a direct DB check that the
// FULL_BODY pool actually contains 6 jump/broad-jump/bound exercises and
// 5 overhead-named exercises, so this test genuinely exercises the
// constraint logic instead of vacuously passing because no violating
// exercise was ever a candidate.
const baseParams = {
  clientId: null,
  programGoals: ['General fitness'],
  focusAreas: ['full body'],
  durationMinutes: 30,
  daysPerWeek: 2,
  exercisesPerSession: 8,
  difficultyLevel: 'INTERMEDIATE',
}

function reportViolations(label: string, exercises: { exerciseId: string; exerciseName: string }[], categories: ReturnType<typeof extractHardConstraints>) {
  const violators = exercises.filter((e) => exerciseViolatesHardConstraints(e.exerciseName, categories))
  console.log(`\n=== ${label} ===`)
  console.log(`Generated ${exercises.length} exercises:`)
  for (const e of exercises) console.log(`  - ${e.exerciseName}`)
  console.log(`Violations in FINAL output: ${violators.length}`, violators.map((v) => v.exerciseName))
  return violators
}

describeLive('LIVE acceptance tests — Inmotus hard-constraint prompts', () => {
  it(
    'Test 1: Subjective "No plyometrics." -> zero jump/hop/bound/plyo exercises',
    async () => {
      const result = await generateWorkoutPlan({
        ...baseParams,
        subjective: 'No plyometrics.',
      })
      const categories = extractHardConstraints('No plyometrics.')
      const violators = reportViolations('Test 1: No plyometrics', result.exercises, categories)
      expect(violators.length).toBe(0)
    },
    120_000
  )

  it(
    'Test 2: Subjective "No jumping." -> same exclusion as no plyometrics',
    async () => {
      const result = await generateWorkoutPlan({
        ...baseParams,
        subjective: 'No jumping.',
      })
      const categories = extractHardConstraints('No jumping.')
      const violators = reportViolations('Test 2: No jumping', result.exercises, categories)
      expect(violators.length).toBe(0)
    },
    120_000
  )

  it(
    'Test 3: Trainer Instructions "Strictly strength training. No plyometrics or running." -> zero cardio/run/jump',
    async () => {
      const result = await generateWorkoutPlan({
        ...baseParams,
        trainerPrompt: 'Strictly strength training. No plyometrics or running.',
      })
      const categories = extractHardConstraints('Strictly strength training. No plyometrics or running.')
      const violators = reportViolations('Test 3: Strength only', result.exercises, categories)
      expect(violators.length).toBe(0)
    },
    120_000
  )

  it(
    'Test 4: Subjective "No overhead exercises." -> zero loaded overhead press/carry',
    async () => {
      const result = await generateWorkoutPlan({
        ...baseParams,
        subjective: 'No overhead exercises.',
      })
      const categories = extractHardConstraints('No overhead exercises.')
      const violators = reportViolations('Test 4: No overhead', result.exercises, categories)
      expect(violators.length).toBe(0)
    },
    120_000
  )

  it(
    'Test 6: Generate-with-AI path (week plan present) obeys "No plyometrics. Strength only." and includes a trainer-named exercise in every session',
    async () => {
      const circuits = [
        { name: 'Warm Up', focusType: 'WARMUP', exerciseCount: 3 },
        { name: 'Lower Body', focusType: 'LOWER_BODY', exerciseCount: 4 },
        { name: 'Cool Down', focusType: 'COOLDOWN', exerciseCount: 2 },
      ]
      const trainerPrompt = 'No plyometrics. Strength only. Include Goblet Squat in every lower body session at 4 sets of 6 reps.'
      const weekPlan = [1, 2].map(week => ({
        week, title: `Week ${week}`, rehabStage: 'BASE_BUILD' as const, programMode: 'PERFORMANCE' as const,
        focusAreas: ['LOWER_BODY'], difficultyLevel: 'INTERMEDIATE' as const,
        clinicalGuidance: 'Build lower-body strength with controlled tempo.', contraindicationsThisWeek: ['no plyometrics', 'strength only'],
        progressionGoal: 'Add load while keeping form.', derivedIndicationTags: [],
      }))
      const result = await generateWorkoutPlan({
        clientId: null, programGoals: ['Athletic Performance'], availableEquipment: ['Dumbbells'],
        durationMinutes: 40, daysPerWeek: 2, durationWeeks: 2, circuits, preferredWeekdays: ['Monday', 'Thursday'],
        difficultyLevel: 'INTERMEDIATE', weekPlan, trainerPrompt,
      })
      const categories = extractHardConstraints(trainerPrompt)
      const violators = reportViolations('Test 6: multi-week path', result.exercises, categories)
      expect(violators.length).toBe(0)
      const sessions = new Set(result.exercises.map(e => `${e.weekIndex}_${e.dayOfWeek}`))
      expect(sessions.size).toBe(4)
      for (const key of sessions) {
        const goblet = result.exercises.find(e => `${e.weekIndex}_${e.dayOfWeek}` === key && /goblet squat/i.test(e.exerciseName))
        expect(goblet, `Goblet Squat missing in session ${key}`).toBeDefined()
        expect(goblet!.sets).toBe(4)
        expect(goblet!.reps).toBe(6)
      }
    },
    180_000
  )

  it(
    'Test 5 (sanity): no constraints -> still generates a full, valid program',
    async () => {
      const result = await generateWorkoutPlan({ ...baseParams })
      console.log('\n=== Test 5: baseline (no constraints) ===')
      console.log(`Title: ${result.title}`)
      console.log(`Sessions: ${result.sessions.length}, Exercises: ${result.exercises.length}`)
      expect(result.exercises.length).toBeGreaterThan(0)
      expect(result.sessions.length).toBe(baseParams.daysPerWeek)
    },
    120_000
  )
})
