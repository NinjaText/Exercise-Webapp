import { describe, it, expect } from 'vitest'
import { computeAdherence } from '../nutrition.service'

describe('computeAdherence', () => {
  it('returns null when no targets are set', () => {
    const target = { calories: null, proteinG: null, carbsG: null, fatG: null, waterMl: null }
    const consumed = { calories: 500, proteinG: 20, carbsG: 30, fatG: 10, waterMl: 500 }
    expect(computeAdherence(target, consumed)).toBeNull()
  })

  it('averages hit-rate across only the fields with a target set', () => {
    const target = { calories: 2000, proteinG: 150, carbsG: null, fatG: null, waterMl: null }
    const consumed = { calories: 1000, proteinG: 150, carbsG: 0, fatG: 0, waterMl: 0 }
    // calories: 50%, protein: 100% -> average 75%
    expect(computeAdherence(target, consumed)).toBe(75)
  })

  it('caps a field at 100% when consumption exceeds target', () => {
    const target = { calories: 2000, proteinG: null, carbsG: null, fatG: null, waterMl: null }
    const consumed = { calories: 4000, proteinG: 0, carbsG: 0, fatG: 0, waterMl: 0 }
    expect(computeAdherence(target, consumed)).toBe(100)
  })

  it('computes a full average across all five fields', () => {
    const target = { calories: 2000, proteinG: 100, carbsG: 200, fatG: 50, waterMl: 2000 }
    const consumed = { calories: 2000, proteinG: 100, carbsG: 200, fatG: 50, waterMl: 2000 }
    expect(computeAdherence(target, consumed)).toBe(100)
  })
})
