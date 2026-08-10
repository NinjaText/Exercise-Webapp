import { describe, it, expect } from 'vitest'
import { hasDocumentedClinicalNeed, determineProgramMode, buildClientContextBlock } from '../clinical-context'

describe('hasDocumentedClinicalNeed', () => {
  it('returns false for a null profile', () => {
    expect(hasDocumentedClinicalNeed(null)).toBe(false)
  })

  it('returns false for a profile with only empty/blank fields', () => {
    expect(
      hasDocumentedClinicalNeed({
        primaryDiagnosis: '',
        secondaryDiagnoses: [],
        painScore: null,
        limitations: '   ',
        comorbidities: null,
        functionalChallenges: null,
        surgeryHistory: null,
        injuryDate: null,
        priorInjuries: [],
      })
    ).toBe(false)
  })

  it('treats a pain score of 0 as not documenting pain', () => {
    expect(hasDocumentedClinicalNeed({ painScore: 0 })).toBe(false)
  })

  it('treats a positive pain score as documented clinical need', () => {
    expect(hasDocumentedClinicalNeed({ painScore: 3 })).toBe(true)
  })

  it('treats a populated primaryDiagnosis as documented clinical need', () => {
    expect(hasDocumentedClinicalNeed({ primaryDiagnosis: 'ACL tear' })).toBe(true)
  })

  it('treats a non-empty secondaryDiagnoses array as documented clinical need', () => {
    expect(hasDocumentedClinicalNeed({ secondaryDiagnoses: ['tendinitis'] })).toBe(true)
  })

  it('treats a populated limitations string as documented clinical need', () => {
    expect(hasDocumentedClinicalNeed({ limitations: 'no loaded knee flexion' })).toBe(true)
  })

  it('treats a set injuryDate as documented clinical need', () => {
    expect(hasDocumentedClinicalNeed({ injuryDate: new Date('2026-01-01') })).toBe(true)
  })
})

describe('determineProgramMode', () => {
  it('resolves to PERFORMANCE for a healthy client profile', () => {
    expect(determineProgramMode({ painScore: 0, limitations: '' })).toBe('PERFORMANCE')
  })

  it('resolves to CLINICAL when any clinical signal is present', () => {
    expect(determineProgramMode({ primaryDiagnosis: 'Rotator cuff strain' })).toBe('CLINICAL')
  })

  it('resolves to PERFORMANCE for a null profile (no linked client)', () => {
    expect(determineProgramMode(null)).toBe('PERFORMANCE')
  })
})

describe('buildClientContextBlock', () => {
  it('returns a generic message when there is no client', () => {
    const block = buildClientContextBlock(null, null)
    expect(block).toContain('No specific client assigned')
  })

  it('includes the client name and falls back to defaults for missing fields', () => {
    const block = buildClientContextBlock(
      { firstName: 'Jamie', lastName: 'Rivera' },
      null
    )
    expect(block).toContain('Jamie Rivera')
    expect(block).toContain('Not specified')
    expect(block).toContain('Not assessed')
    expect(block).toContain('None documented')
  })

  it('renders populated fields instead of their fallbacks', () => {
    const block = buildClientContextBlock(
      { firstName: 'Sam', lastName: 'Lee' },
      {
        primaryDiagnosis: 'ACL repair',
        painScore: 4,
        fitnessGoals: ['Marathon'],
        availableEquipment: ['Dumbbells'],
      }
    )
    expect(block).toContain('ACL repair')
    expect(block).toContain('4/10')
    expect(block).toContain('Marathon')
    expect(block).toContain('Dumbbells')
  })
})
