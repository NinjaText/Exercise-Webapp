import { describe, it, expect } from 'vitest'
import { isSessionStartable, isEarlyStart } from '../workout-session-tracker'

describe('isSessionStartable', () => {
  it('is true for SCHEDULED', () => {
    expect(isSessionStartable('SCHEDULED')).toBe(true)
  })

  it('is true for MISSED', () => {
    expect(isSessionStartable('MISSED')).toBe(true)
  })

  it('is false for IN_PROGRESS', () => {
    expect(isSessionStartable('IN_PROGRESS')).toBe(false)
  })

  it('is false for COMPLETED', () => {
    expect(isSessionStartable('COMPLETED')).toBe(false)
  })
})

describe('isEarlyStart', () => {
  it('is true when scheduledDate is a later calendar day than now', () => {
    const scheduledDate = new Date('2026-08-20T00:00:00.000Z')
    const now = new Date('2026-08-18T15:00:00.000Z')
    expect(isEarlyStart(scheduledDate, now)).toBe(true)
  })

  it('is false when scheduledDate is today', () => {
    const scheduledDate = new Date('2026-08-18T00:00:00.000Z')
    const now = new Date('2026-08-18T15:00:00.000Z')
    expect(isEarlyStart(scheduledDate, now)).toBe(false)
  })

  it('is false when scheduledDate is in the past (a missed session)', () => {
    const scheduledDate = new Date('2026-08-10T00:00:00.000Z')
    const now = new Date('2026-08-18T15:00:00.000Z')
    expect(isEarlyStart(scheduledDate, now)).toBe(false)
  })
})
