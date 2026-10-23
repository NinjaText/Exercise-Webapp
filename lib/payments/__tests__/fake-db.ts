/**
 * A tiny in-memory stand-in for the Prisma models trainer payments touch, so
 * service and webhook tests assert the rows actually written (idempotency,
 * conditional transitions) rather than mock call shapes. Supports the
 * filter subset the services use: equality, in / not / lt / lte / gte,
 * OR, `{ isSet: false }`, plus `include: { offer }` and unique constraints.
 */
// Rows are loosely typed on purpose: this fake stands in for several Prisma models.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>

const UNIQUE: Record<string, string[]> = {
  connectedAccount: ['trainerId', 'stripeAccountId'],
  offerPurchase: ['stripeCheckoutSessionId'],
  offerSubscription: ['stripeSubscriptionId'],
}

function matchValue(value: unknown, cond: unknown): boolean {
  if (cond === null) return value === null || value === undefined
  if (cond instanceof Date) return value instanceof Date && value.getTime() === cond.getTime()
  if (typeof cond !== 'object') return value === cond
  const c = cond as Row
  if ('isSet' in c) return c.isSet ? value !== undefined : value === undefined
  if ('in' in c && !(c.in as unknown[]).includes(value)) return false
  if ('not' in c && matchValue(value, c.not)) return false
  if ('lt' in c && !(value != null && (value as number) < (c.lt as number))) return false
  if ('lte' in c && !(value != null && (value as number) <= (c.lte as number))) return false
  if ('gte' in c && !(value != null && (value as number) >= (c.gte as number))) return false
  return true
}

export function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'OR') return (cond as Row[]).some((w) => matches(row, w))
    if (key === 'AND') return (cond as Row[]).every((w) => matches(row, w))
    return matchValue(row[key], cond)
  })
}

let seq = 0
const nextId = () => (++seq).toString(16).padStart(24, '0')

export function createFakeDb() {
  const tables: Record<string, Row[]> = {
    connectedAccount: [],
    paidOffer: [],
    offerPurchase: [],
    offerSubscription: [],
    program: [],
    user: [],
    notification: [],
  }

  function withIncludes(name: string, row: Row, args: Row = {}): Row {
    const out = { ...row }
    if (args.include?.offer && (name === 'offerPurchase' || name === 'offerSubscription')) {
      out.offer = tables.paidOffer.find((o) => o.id === row.offerId) ?? null
    }
    if (args.select?.offer && (name === 'offerPurchase' || name === 'offerSubscription')) {
      out.offer = tables.paidOffer.find((o) => o.id === row.offerId) ?? null
    }
    return out
  }

  function assertUnique(name: string, row: Row, ignoreId?: string) {
    for (const field of UNIQUE[name] ?? []) {
      if (row[field] === undefined || row[field] === null) continue
      if (tables[name].some((r) => r.id !== ignoreId && r[field] === row[field])) {
        throw Object.assign(new Error(`Unique constraint failed on ${field}`), { code: 'P2002' })
      }
    }
  }

  function model(name: string) {
    const rows = () => tables[name]
    const sortRows = (list: Row[], orderBy?: Row | Row[]) => {
      const orders = Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : []
      return [...list].sort((a, b) => {
        for (const o of orders) {
          const [k, dir] = Object.entries(o)[0] as [string, string]
          if (a[k] === b[k]) continue
          const cmp = a[k] > b[k] ? 1 : -1
          return dir === 'desc' ? -cmp : cmp
        }
        return 0
      })
    }
    return {
      findUnique: async (args: Row) => {
        const row = rows().find((r) => matches(r, args.where))
        return row ? withIncludes(name, row, args) : null
      },
      findFirst: async (args: Row = {}) => {
        const row = sortRows(rows().filter((r) => matches(r, args.where)), args.orderBy)[0]
        return row ? withIncludes(name, row, args) : null
      },
      findMany: async (args: Row = {}) => {
        const list = sortRows(rows().filter((r) => matches(r, args.where)), args.orderBy)
        return list.slice(0, args.take ?? list.length).map((r) => withIncludes(name, r, args))
      },
      count: async (args: Row = {}) => rows().filter((r) => matches(r, args.where)).length,
      create: async (args: Row) => {
        const row = { id: nextId(), createdAt: new Date(), updatedAt: new Date(), ...args.data }
        assertUnique(name, row)
        rows().push(row)
        return { ...row }
      },
      update: async (args: Row) => {
        const row = rows().find((r) => matches(r, args.where))
        if (!row) throw Object.assign(new Error('Record not found'), { code: 'P2025' })
        const next = { ...row, ...args.data, updatedAt: new Date() }
        assertUnique(name, next, row.id)
        Object.assign(row, next)
        return { ...row }
      },
      updateMany: async (args: Row) => {
        const list = rows().filter((r) => matches(r, args.where))
        for (const row of list) Object.assign(row, args.data, { updatedAt: new Date() })
        return { count: list.length }
      },
      upsert: async (args: Row) => {
        const row = rows().find((r) => matches(r, args.where))
        if (row) {
          const next = { ...row, ...args.update, updatedAt: new Date() }
          assertUnique(name, next, row.id)
          Object.assign(row, next)
          return { ...row }
        }
        const created = { id: nextId(), createdAt: new Date(), updatedAt: new Date(), ...args.create }
        assertUnique(name, created)
        rows().push(created)
        return { ...created }
      },
      aggregate: async () => ({ _sum: { amountInCents: null } }),
    }
  }

  const prisma = Object.fromEntries(Object.keys(tables).map((name) => [name, model(name)]))

  return {
    tables,
    prisma,
    reset() {
      for (const key of Object.keys(tables)) tables[key].length = 0
    },
    insert(name: string, row: Row): Row {
      const full = { id: nextId(), createdAt: new Date(), updatedAt: new Date(), ...row }
      tables[name].push(full)
      return full
    },
  }
}

export type FakeDb = ReturnType<typeof createFakeDb>
