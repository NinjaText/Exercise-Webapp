import { describe, it, expect } from 'vitest'
import { NOTIFICATION_TYPES, CATEGORY_LABELS, type NotificationType } from '../types'
import { NOTIFICATION_REGISTRY } from '../registry'

const allTypes = Object.values(NOTIFICATION_TYPES) as NotificationType[]

describe('NOTIFICATION_REGISTRY', () => {
  it('has an entry for every notification type', () => {
    const missing = allTypes.filter((t) => !NOTIFICATION_REGISTRY[t])
    expect(missing).toEqual([])
  })

  it('has no entry for a type that does not exist', () => {
    const extra = Object.keys(NOTIFICATION_REGISTRY).filter(
      (k) => !allTypes.includes(k as NotificationType)
    )
    expect(extra).toEqual([])
  })

  it('gives every emailing type a subject function', () => {
    for (const type of allTypes) {
      const entry = NOTIFICATION_REGISTRY[type]
      if (entry.template) {
        expect(typeof entry.subject, `${type} has a template but no subject`).toBe('function')
      }
    }
  })

  it('marks every billing type transactional and nothing else', () => {
    for (const type of allTypes) {
      const entry = NOTIFICATION_REGISTRY[type]
      expect(entry.transactional, `${type}`).toBe(entry.category === 'billing')
    }
  })

  it('uses a known category with a human label for every type', () => {
    for (const type of allTypes) {
      expect(CATEGORY_LABELS[NOTIFICATION_REGISTRY[type].category], `${type}`).toBeTruthy()
    }
  })

  it('uses a positive cooldown or null, never zero or negative', () => {
    for (const type of allTypes) {
      const cd = NOTIFICATION_REGISTRY[type].cooldownMinutes
      if (cd !== null) expect(cd, `${type}`).toBeGreaterThan(0)
    }
  })

  it('caps the daily nutrition nudges at one per day', () => {
    for (const type of [
      NOTIFICATION_TYPES.NUTRITION_NUDGE_MEALS,
      NOTIFICATION_TYPES.NUTRITION_NUDGE_PROTEIN,
      NOTIFICATION_TYPES.NUTRITION_NUDGE_WATER,
    ]) {
      expect(NOTIFICATION_REGISTRY[type].cooldownMinutes).toBe(1440)
    }
  })

  it('produces the role-specific voice memo subject the old template computed inline', () => {
    const subject = NOTIFICATION_REGISTRY[NOTIFICATION_TYPES.VOICE_MEMO].subject
    expect(subject({ senderName: 'Mike Chen', role: 'client' })).toBe('Mike Chen left you a voice note')
    expect(subject({ senderName: 'Mike Chen', role: 'trainer' })).toBe('Mike Chen left a voice note')
  })
})
