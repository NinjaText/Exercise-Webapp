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
  it('marks exactly the types a CLIENT can receive as clientFacing (org-branded mail)', () => {
    const clientFacing = allTypes.filter((t) => NOTIFICATION_REGISTRY[t].clientFacing).sort()
    expect(clientFacing).toEqual(
      [
        NOTIFICATION_TYPES.SESSION_REMINDER,
        NOTIFICATION_TYPES.CHECK_IN_DUE,
        NOTIFICATION_TYPES.NEW_MESSAGE,
        NOTIFICATION_TYPES.VOICE_MEMO,
        NOTIFICATION_TYPES.FEEDBACK_RESPONSE,
        NOTIFICATION_TYPES.NUTRITION_COMMENT,
        NOTIFICATION_TYPES.NUTRITION_NUDGE_MEALS,
        NOTIFICATION_TYPES.NUTRITION_NUDGE_PROTEIN,
        NOTIFICATION_TYPES.NUTRITION_NUDGE_WATER,
        NOTIFICATION_TYPES.COACHING_ACCEPTED,
        NOTIFICATION_TYPES.COACHING_DECLINED,
      ].sort()
    )
  })

  it('never brands billing (transactional) mail', () => {
    for (const type of allTypes) {
      const entry = NOTIFICATION_REGISTRY[type]
      if (entry.transactional) expect(entry.clientFacing, `${type}`).toBe(false)
    }
  })

  it('emails every coaching type under the messages preference, with no cooldown', () => {
    for (const type of [
      NOTIFICATION_TYPES.COACHING_REQUESTED,
      NOTIFICATION_TYPES.COACHING_ACCEPTED,
      NOTIFICATION_TYPES.COACHING_DECLINED,
    ]) {
      const entry = NOTIFICATION_REGISTRY[type]
      expect(entry.category, type).toBe('messages')
      expect(entry.transactional, type).toBe(false)
      expect(entry.template, type).not.toBeNull()
      expect(entry.cooldownMinutes, type).toBeNull()
    }
    // Trainer-recipient mail stays product-branded.
    expect(NOTIFICATION_REGISTRY[NOTIFICATION_TYPES.COACHING_REQUESTED].clientFacing).toBe(false)
    expect(NOTIFICATION_REGISTRY[NOTIFICATION_TYPES.COACHING_REQUESTED].subject({ memberName: 'Sam Lee' })).toBe(
      'Sam Lee requested coaching'
    )
  })
})
