import { describe, it, expect } from 'vitest'
import { resolvePickerTabs, mergeExercisesForPicker } from '../exercise-picker'

describe('resolvePickerTabs', () => {
  it('shows Universal only when the trainer has no organization, regardless of preference', () => {
    expect(resolvePickerTabs('BOTH', false)).toEqual({ showUniversal: true, showOrganization: false })
    expect(resolvePickerTabs('ORGANIZATION', false)).toEqual({ showUniversal: true, showOrganization: false })
    expect(resolvePickerTabs(undefined, false)).toEqual({ showUniversal: true, showOrganization: false })
  })

  it('shows both tabs when preference is BOTH and the trainer has an organization', () => {
    expect(resolvePickerTabs('BOTH', true)).toEqual({ showUniversal: true, showOrganization: true })
  })

  it('defaults to BOTH (both tabs) when preference is undefined and the trainer has an organization', () => {
    expect(resolvePickerTabs(undefined, true)).toEqual({ showUniversal: true, showOrganization: true })
  })

  it('shows Universal only when preference is UNIVERSAL', () => {
    expect(resolvePickerTabs('UNIVERSAL', true)).toEqual({ showUniversal: true, showOrganization: false })
  })

  it('shows My Organization only when preference is ORGANIZATION', () => {
    expect(resolvePickerTabs('ORGANIZATION', true)).toEqual({ showUniversal: false, showOrganization: true })
  })
})

describe('mergeExercisesForPicker', () => {
  const universalOnly = { id: '1', source: 'UNIVERSAL', organizationId: null }
  const myPublicOrgEx = { id: '2', source: 'ORGANIZATION', organizationId: 'org_mine' }
  const myPrivateOrgEx = { id: '3', source: 'ORGANIZATION', organizationId: 'org_mine' }
  const otherOrgPublicEx = { id: '4', source: 'ORGANIZATION', organizationId: 'org_other' }

  it('combines universal and my-organization exercises into one list', () => {
    const result = mergeExercisesForPicker([universalOnly, otherOrgPublicEx], [myPublicOrgEx, myPrivateOrgEx], 'org_mine')
    expect(result.map((e) => e.id).sort()).toEqual(['1', '2', '3', '4'])
  })

  it('dedupes an exercise that appears in both the universal and my-organization lists (own public exercise)', () => {
    // myPublicOrgEx satisfies both the universal filter (public org exercise) and the my-org filter
    const result = mergeExercisesForPicker([universalOnly, myPublicOrgEx], [myPublicOrgEx], 'org_mine')
    expect(result.filter((e) => e.id === '2')).toHaveLength(1)
  })

  it('sorts the caller\'s own organization exercises first, preserving relative order within each group', () => {
    const result = mergeExercisesForPicker(
      [universalOnly, otherOrgPublicEx],
      [myPublicOrgEx, myPrivateOrgEx],
      'org_mine'
    )
    expect(result.map((e) => e.id)).toEqual(['2', '3', '1', '4'])
  })

  it('returns an empty list when both inputs are empty', () => {
    expect(mergeExercisesForPicker([], [], 'org_mine')).toEqual([])
  })
})
