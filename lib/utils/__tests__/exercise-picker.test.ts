import { describe, it, expect } from 'vitest'
import { resolvePickerTabs } from '../exercise-picker'

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
