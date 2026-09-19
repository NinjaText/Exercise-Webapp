import { describe, it, expect } from 'vitest'
import { affirmativeClauses, findTrainerNamedExercises, findTrainerNamedExerciseRequirements, normalizeForNameMatch, textPrescribesDosage } from '../trainer-named-exercises'

const library = [
  { id: 'g1', name: 'Goblet Squat' },
  { id: 'b1', name: 'Bulgarian Split Squat' },
  { id: 'r1', name: 'Run' },
  { id: 'l1', name: 'Lunges' },
  { id: 'd1', name: 'Barbell Romanian Deadlift' },
]

describe('normalizeForNameMatch', () => {
  it('lowercases, strips punctuation, and singularizes plural tokens', () => {
    expect(normalizeForNameMatch('Goblet Squats!')).toBe(' goblet squat ')
    expect(normalizeForNameMatch('Wall Press')).toBe(' wall press ')
  })
})

describe('affirmativeClauses', () => {
  it('drops clauses that carry a negation', () => {
    expect(affirmativeClauses('No plyometrics. Include Goblet Squat every session; avoid Bulgarian split squats')).toEqual([
      'Include Goblet Squat every session',
    ])
  })
})

describe('findTrainerNamedExercises', () => {
  it('finds a named exercise in an affirmative clause, tolerating plurals', () => {
    const found = findTrainerNamedExercises(['Include Goblet Squats in every lower body session at 4x6.'], library)
    expect(found.map(e => e.id)).toEqual(['g1'])
  })

  it('ignores exercises named only inside a negated clause', () => {
    const found = findTrainerNamedExercises(['Avoid Bulgarian split squats, no running.'], library)
    expect(found).toEqual([])
  })

  it('skips very short single-word names that match casual words', () => {
    const found = findTrainerNamedExercises(['She likes to run on weekends and do lunges.'], library)
    expect(found.map(e => e.id)).toEqual([])
  })

  it('searches every supplied text field and returns each exercise once', () => {
    const found = findTrainerNamedExercises(
      ['Goblet squat is the anchor.', null, 'Add Barbell Romanian Deadlift on Fridays. Goblet Squat too.'],
      library
    )
    expect(found.map(e => e.id).sort()).toEqual(['d1', 'g1'])
  })
})

describe('findTrainerNamedExerciseRequirements', () => {
  it('marks an exercise as every-session when its clause says every/each/all', () => {
    const reqs = findTrainerNamedExerciseRequirements(
      ['Include Goblet Squat in every lower body session. Add Barbell Romanian Deadlift on Friday.'],
      library
    )
    expect(reqs.map(r => [r.exercise.id, r.everySession])).toEqual([['g1', true], ['d1', false]])
  })
})

describe('dosage detection', () => {
  it('detects real numbers and ignores wording without numbers', () => {
    expect(textPrescribesDosage('Goblet Squat 4x6')).toBe(true)
    expect(textPrescribesDosage('3 sets of 8 reps')).toBe(true)
    expect(textPrescribesDosage('hold 30 sec')).toBe(true)
    expect(textPrescribesDosage('Include calf raises every session')).toBe(false)
  })
  it('marks per-requirement whether its clause carried a dosage', () => {
    const reqs = findTrainerNamedExerciseRequirements(
      ['Include Goblet Squat every session at 4 sets of 6. Add Barbell Romanian Deadlift too.'],
      library
    )
    expect(reqs.map(r => [r.exercise.id, r.prescribesDosage])).toEqual([['g1', true], ['d1', false]])
  })
})
