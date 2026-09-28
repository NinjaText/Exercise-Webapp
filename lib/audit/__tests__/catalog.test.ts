import { describe, it, expect } from 'vitest'
import {
  AUDIT_ACTIONS,
  actionsInCategory,
  auditActionMeta,
  auditFiltersToQuery,
  parseAuditFilters,
} from '../catalog'

describe('parseAuditFilters', () => {
  it('keeps valid values and drops unknown ones', () => {
    expect(
      parseAuditFilters({
        q: '  jane ',
        role: 'CLIENT',
        category: 'WORKOUTS',
        range: '7d',
        actor: '64b7f0c2a1b2c3d4e5f60718',
        page: '3',
      })
    ).toEqual({
      q: 'jane',
      role: 'CLIENT',
      category: 'WORKOUTS',
      action: undefined,
      org: undefined,
      actor: '64b7f0c2a1b2c3d4e5f60718',
      range: '7d',
      page: 3,
    })
  })

  it('rejects bad role, category, range, non-ObjectId actor and bad page', () => {
    const f = parseAuditFilters({ role: 'ROOT', category: 'X', range: '1y', actor: 'nope', page: '-2' })
    expect(f).toMatchObject({ role: undefined, category: undefined, range: undefined, actor: undefined, page: 1 })
  })

  it('round-trips through auditFiltersToQuery, omitting page 1', () => {
    const f = parseAuditFilters({ role: 'TRAINER', q: 'shoulder', page: '1' })
    expect(auditFiltersToQuery(f)).toBe('q=shoulder&role=TRAINER')
    expect(auditFiltersToQuery({ ...f, page: 2 })).toBe('q=shoulder&role=TRAINER&page=2')
  })
})

describe('catalog', () => {
  it('groups client workout events under WORKOUTS', () => {
    expect(actionsInCategory('WORKOUTS')).toEqual([AUDIT_ACTIONS.WORKOUT_STARTED, AUDIT_ACTIONS.WORKOUT_COMPLETED])
  })

  it('humanizes uncatalogued legacy actions', () => {
    expect(auditActionMeta('SOMETHING_OLD').label).toBe('Something old')
  })
})
