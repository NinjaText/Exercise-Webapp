import { describe, it, expect } from 'vitest'
import {
  buildProgramSystemPrompt,
  buildTrainerDirectivesBlock,
  describeEquipmentSelection,
  formatExercisePoolLine,
  buildCircuitCandidateIndex,
} from '../program-generation'

const circuits = [
  { name: 'Warm Up', focusType: 'WARMUP', exerciseCount: 3 },
  { name: 'Lower', focusType: 'LOWER_BODY', exerciseCount: 4 },
]

describe('buildProgramSystemPrompt', () => {
  it('carries the full hard-constraint rule set into a PHASE-scoped call', () => {
    const prompt = buildProgramSystemPrompt({
      programMode: 'PERFORMANCE',
      scope: { kind: 'PHASE', phaseIndex: 0, phaseLabel: 'BASE_BUILD', startWeek: 1, endWeek: 2, totalWeeks: 4 },
      daysPerWeek: 3,
      dayIndices: [0, 2, 4],
      totalExercisesPerSession: 7,
      circuits,
    })
    expect(prompt).toContain('ONE PHASE OF A MULTI-WEEK PROGRAM')
    expect(prompt).toContain('weeks 1-2 of a 4-week program')
    expect(prompt).toContain('A. INSTRUCTION & SAFETY PRIORITY')
    expect(prompt).toContain('POST-GENERATION HARD-CONSTRAINT AUDIT')
    expect(prompt).toContain('trainerPrescribedDosage')
    expect(prompt).toContain('EXACTLY 7 exercises')
    expect(prompt).toContain('Circuit 1 "Lower" (LOWER_BODY focus): EXACTLY 4 exercises PER SESSION/DAY, performed for 3 rounds')
    expect(prompt).toContain('one dayTemplate per weekday index in: 0, 2, 4')
  })

  it('uses a PROGRAM scope block when no week plan exists', () => {
    const prompt = buildProgramSystemPrompt({
      programMode: 'CLINICAL',
      scope: { kind: 'PROGRAM' },
      daysPerWeek: 2,
      dayIndices: [1, 3],
      totalExercisesPerSession: 6,
      circuits: [],
    })
    expect(prompt).toContain('THE WHOLE PROGRAM')
    expect(prompt).toContain('DPT/rehab persona')
    expect(prompt).toContain('No circuit structure was configured')
  })
})

describe('buildTrainerDirectivesBlock', () => {
  it('includes subjective, instructions, additional notes, equipment and required exercises', () => {
    const block = buildTrainerDirectivesBlock({
      subjective: 'No plyometrics.',
      trainerPrompt: 'Strength only.',
      additionalNotes: 'No single-leg balance work.',
      availableEquipment: ['Dumbbells'],
      requiredExercises: [{ id: 'g1', name: 'Goblet Squat' }],
    })
    expect(block).toContain('No plyometrics.')
    expect(block).toContain('Strength only.')
    expect(block).toContain('No single-leg balance work.')
    expect(block).toContain('Dumbbells — use ONLY exercises')
    expect(block).toContain('Goblet Squat (exerciseId: g1)')
  })

  it('states bodyweight-only when no equipment list is given', () => {
    expect(describeEquipmentSelection([])).toMatch(/bodyweight exercises only/i)
    expect(describeEquipmentSelection(['none'])).toMatch(/Bodyweight only/)
    expect(buildTrainerDirectivesBlock({})).toContain('None provided.')
  })
})

describe('formatExercisePoolLine', () => {
  it('renders equipment, difficulty and default Rx', () => {
    const line = formatExercisePoolLine({
      id: 'x1', name: 'Goblet Squat', bodyRegion: ['LOWER_BODY'], difficultyLevel: 'BEGINNER',
      equipmentRequired: ['Dumbbells'], musclesTargeted: ['quads'], exercisePhases: ['STRENGTHENING'],
      defaultSets: 3, defaultReps: 10, defaultHoldSeconds: null,
    })
    expect(line).toBe('ID: x1 | Goblet Squat | Phase: STRENGTHENING | Region: LOWER_BODY | Difficulty: BEGINNER | Muscles: quads | Equipment: Dumbbells | Default Rx: 3x10')
  })
})

describe('buildCircuitCandidateIndex', () => {
  it('lists fitting exercises under each circuit and returns nothing without circuits', () => {
    const pool = [
      { id: 'a', name: 'Arm Circles', bodyRegion: ['UPPER_BODY'], exercisePhases: ['WARMUP'] },
      { id: 'b', name: 'Bench Press', bodyRegion: ['UPPER_BODY'], exercisePhases: ['STRENGTHENING'] },
    ]
    const fits = (item: typeof pool[number], focus: string) =>
      focus === 'WARMUP' ? item.exercisePhases.includes('WARMUP') : item.exercisePhases.includes('STRENGTHENING')
    const index = buildCircuitCandidateIndex(pool, circuits, fits)
    expect(index).toContain('Circuit 0 "Warm Up" (WARMUP) — choose its 3 exercises ONLY from:\n  Arm Circles [a]')
    expect(index).toContain('Circuit 1 "Lower" (LOWER_BODY) — choose its 4 exercises ONLY from:\n  Bench Press [b]')
    expect(buildCircuitCandidateIndex(pool, [], fits)).toBe('')
  })
})
