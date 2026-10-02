import { describe, it, expect } from 'vitest'
import { canonicalEquipment, canonicalEquipmentList } from '../equipment-vocabulary'
import { mapClientEquipmentToOptions } from '../program-equipment'

describe('canonicalEquipment', () => {
  it('merges case and singular/plural spellings', () => {
    expect(canonicalEquipment('dumbbell')).toEqual(['Dumbbells'])
    expect(canonicalEquipment('Dumbbells')).toEqual(['Dumbbells'])
    expect(canonicalEquipment('resistance band')).toEqual(['Resistance Band'])
    expect(canonicalEquipment('chair')).toEqual(['Chair'])
  })

  it('strips parenthetical notes', () => {
    expect(canonicalEquipment('wall (for balance)')).toEqual(['Wall'])
    expect(canonicalEquipment('light dumbbell (1-2 lb)')).toEqual(['Dumbbells'])
    expect(canonicalEquipment('step or box (15-20cm)')).toEqual(['Step/Stair', 'Box'])
  })

  it('splits "or" and "/" into alternatives', () => {
    expect(canonicalEquipment('cable or band')).toEqual(['Cable', 'Resistance Band'])
    expect(canonicalEquipment('bench or chair')).toEqual(['Bench', 'Chair'])
    expect(canonicalEquipment('Step/Stair')).toEqual(['Step/Stair'])
    expect(canonicalEquipment('step or low stair')).toEqual(['Step/Stair'])
  })

  it('maps "mat" onto the onboarding list spelling', () => {
    expect(canonicalEquipment('mat')).toEqual(['Yoga Mat'])
    expect(canonicalEquipment('Yoga Mat')).toEqual(['Yoga Mat'])
  })

  it('returns nothing for none, optional items and junk', () => {
    expect(canonicalEquipment('None')).toEqual([])
    expect(canonicalEquipment('resistance band (optional)')).toEqual([])
    expect(canonicalEquipment('ee')).toEqual([])
    expect(canonicalEquipment('hill or resistance')).toEqual([])
  })

  it('is idempotent on its own labels', () => {
    for (const label of ['Dumbbells', 'Step/Stair', 'Stick/Cane', 'Pull-Up Bar', 'BOSU Ball', 'TRX', 'Ab Wheel']) {
      expect(canonicalEquipment(label)).toEqual([label])
    }
  })

  it('title-cases unknown equipment', () => {
    expect(canonicalEquipment('lacrosse ball')).toEqual(['Lacrosse Ball'])
  })
})

describe('canonicalEquipmentList', () => {
  it('de-duplicates and sorts', () => {
    expect(
      canonicalEquipmentList(['Chair', 'chair', 'None', 'wall', 'Wall', 'wall (for safety)', 'dumbbell', 'Dumbbells', 'ee'])
    ).toEqual(['Chair', 'Dumbbells', 'Wall'])
  })
})

describe('mapClientEquipmentToOptions', () => {
  const options = ['Chair', 'Dumbbells', 'Resistance Band', 'Step/Stair', 'Yoga Mat']

  it('maps client spellings onto picker options', () => {
    expect(mapClientEquipmentToOptions(['dumbbell', 'Yoga Mat', 'Step/Stair'], options)).toEqual([
      'Dumbbells',
      'Yoga Mat',
      'Step/Stair',
    ])
  })

  it('keeps unmatched items verbatim', () => {
    expect(mapClientEquipmentToOptions(['Foam Roller'], options)).toEqual(['Foam Roller'])
  })

  it('collapses "None" to the bodyweight sentinel', () => {
    expect(mapClientEquipmentToOptions(['None'], options)).toEqual(['none'])
  })
})
