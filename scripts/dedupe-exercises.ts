/**
 * Merges duplicate exercises so the library satisfies the uniqueness rules in
 * lib/utils/exercise-identity.ts (no two exercises an org can see share a
 * name or a video).
 *
 * Two steps, so a human reviews every merge before anything is written:
 *
 *   1. plan  — reads the DB and writes scripts/exercise-dedupe/plan.json:
 *        merges[]       exact-name duplicates, plus same-video exercises whose
 *                       names only differ by word order / plurals / filler
 *                       words. Each has "approved": set false to skip it.
 *        sharedVideo[]  exercises that will STILL share a video after the
 *                       merges (e.g. internal vs external rotation). Give one
 *                       a new video, or turn the group into a merge.
 *        clearVideo[]   (filled by hand) exercises whose video is removed so
 *                       the one remaining exercise owns it.
 *        delete[]       (filled by hand) junk exercises to delete outright;
 *                       refused if anything still references them.
 *
 *        npx tsx --tsconfig tsconfig.json scripts/dedupe-exercises.ts plan
 *
 *   2. apply — executes the approved merges from plan.json. Writes a full
 *      backup of every touched row to scripts/exercise-dedupe/backup-*.json
 *      first. For each merge: fills the kept exercise's empty fields from the
 *      duplicate, repoints program / block / usage / favorite / progression /
 *      media references to the kept exercise, then deletes the duplicate.
 *      Then clears the videos in clearVideo[] and deletes delete[].
 *
 *        npx tsx --tsconfig tsconfig.json scripts/dedupe-exercises.ts apply
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import type { Exercise, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { exerciseVideoKey, exercisesShareScope, normalizeExerciseName } from '@/lib/utils/exercise-identity'
import { extractYouTubeId } from '@/lib/utils/video'

const OUT_DIR = path.join(process.cwd(), 'scripts/exercise-dedupe')
const PLAN_PATH = path.join(OUT_DIR, 'plan.json')

type Row = Exercise & { refs: number }

interface PlanExercise {
  id: string
  name: string
  library: string
  active: boolean
  refs: number
  video: string | null
}

interface PlanMerge {
  approved: boolean
  reason: 'same name' | 'similar name, same video'
  keep: PlanExercise
  remove: PlanExercise[]
}

interface Plan {
  generatedAt: string
  merges: PlanMerge[]
  sharedVideo: { video: string; exercises: PlanExercise[] }[]
  clearVideo: PlanExercise[]
  delete: PlanExercise[]
  warnings: string[]
}

// ── Loading ──────────────────────────────────────────────────────────────────

async function loadExercises(): Promise<Row[]> {
  const rows = await prisma.exercise.findMany({
    include: {
      _count: {
        select: {
          planExercises: true, blockExercises: true, blockExercisesV2: true, usages: true,
          favoritedBy: true, media: true, progressionsFrom: true, progressionsTo: true,
        },
      },
    },
  })
  return rows.map(({ _count, ...e }) => ({ ...e, refs: Object.values(_count).reduce((a, b) => a + b, 0) }))
}

async function loadOrgNames(): Promise<Map<string, { name: string; pref: string }>> {
  const orgs = await prisma.organization.findMany({ select: { clerkOrgId: true, name: true, exerciseSourcePreference: true } })
  return new Map(orgs.map(o => [o.clerkOrgId, { name: o.name, pref: o.exerciseSourcePreference }]))
}

// ── Similar-name matching (only used for exercises that already share a video) ─

const STOPWORDS = new Set(['a', 'an', 'the', 'and', 'with', 'on', 'over', 'of', 'to', 's', 'for'])
// Words that don't change which exercise it is. Deliberately excludes modifiers
// like single/bilateral, seated/standing, internal/external.
const FILLER = new Set(['exercise', 'resistance', 'gentle', 'bodyweight', 'raise', 'supported', 'mobilization'])
const SYNONYMS: Record<string, string> = {
  quadricep: 'quad', pectoral: 'chest', pec: 'chest', roller: 'roll', stand: 'stance',
}

function nameTokens(name: string): Set<string> {
  const flat = normalizeExerciseName(name).replace(/\bdead lift\b/g, 'deadlift').replace(/\b(stability|exercise) ball\b/g, 'ball')
  const tokens = flat
    .split(' ')
    .filter(t => t && !STOPWORDS.has(t))
    .map(t => (t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t))
    .map(t => SYNONYMS[t] ?? t)
  return new Set(tokens)
}

function namesLookAlike(a: string, b: string): boolean {
  const ta = nameTokens(a)
  const tb = nameTokens(b)
  const [small, big] = ta.size <= tb.size ? [ta, tb] : [tb, ta]
  if (![...small].every(t => big.has(t))) return false
  return [...big].filter(t => !small.has(t)).every(t => FILLER.has(t))
}

// ── Planning ─────────────────────────────────────────────────────────────────

/** Among active rows: UNIVERSAL beats an org copy (the org can still see it); then most used, oldest. */
function pickKeeper(rows: Row[]): Row {
  return [...rows].sort(
    (a, b) =>
      Number(b.source === 'UNIVERSAL') - Number(a.source === 'UNIVERSAL') ||
      b.refs - a.refs ||
      a.createdAt.getTime() - b.createdAt.getTime()
  )[0]
}

/** A universal exercise can absorb anything; an org exercise only copies from its own org. */
function canAbsorb(keeper: Row, dup: Row): boolean {
  return keeper.source === 'UNIVERSAL' || (dup.source === 'ORGANIZATION' && dup.organizationId === keeper.organizationId)
}

/**
 * Splits a set of mutually-duplicate exercises into merge clusters. With an
 * active universal member everything merges into it; without one, each org
 * merges separately (an org exercise must never absorb another org's).
 */
function legalClusters(rows: Row[]): Row[][] {
  if (rows.some(r => r.source === 'UNIVERSAL' && r.isActive)) return [rows]
  const byOrg = new Map<string, Row[]>()
  for (const r of rows) byOrg.set(r.organizationId ?? '', [...(byOrg.get(r.organizationId ?? '') ?? []), r])
  return [...byOrg.values()]
}

class UnionFind {
  private parent = new Map<string, string>()
  find(x: string): string {
    const p = this.parent.get(x) ?? x
    if (p === x) return x
    const root = this.find(p)
    this.parent.set(x, root)
    return root
  }
  union(a: string, b: string) {
    this.parent.set(this.find(a), this.find(b))
  }
}

function groupBy<T>(items: T[], key: (t: T) => string | null): T[][] {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const k = key(item)
    if (k) map.set(k, [...(map.get(k) ?? []), item])
  }
  return [...map.values()].filter(g => g.length > 1)
}

async function plan() {
  const [all, orgs] = await Promise.all([loadExercises(), loadOrgNames()])
  const libraryLabel = (r: Row) => (r.source === 'UNIVERSAL' ? 'Universal' : `Org: ${orgs.get(r.organizationId ?? '')?.name ?? r.organizationId}`)
  const toPlan = (r: Row): PlanExercise => ({
    id: r.id, name: r.name, library: libraryLabel(r), active: r.isActive, refs: r.refs, video: r.videoUrl,
  })

  // Inactive exercises don't count for uniqueness, but an archived copy of an
  // active exercise is still clutter — fold it in when it matches an active one.
  const active = all.filter(r => r.isActive)
  const activeNameKeys = new Set(active.map(r => normalizeExerciseName(r.name)))
  const candidates = all.filter(r => r.isActive || activeNameKeys.has(normalizeExerciseName(r.name)))

  const uf = new UnionFind()
  const mergeReason = new Map<string, PlanMerge['reason']>()

  // 1. Exact (normalized) name duplicates that share a library scope.
  for (const group of groupBy(candidates, r => normalizeExerciseName(r.name))) {
    for (const a of group) for (const b of group) {
      if (a.id < b.id && exercisesShareScope(a, b)) {
        uf.union(a.id, b.id)
        mergeReason.set(a.id, 'same name').set(b.id, 'same name')
      }
    }
  }

  // 2. Same video + look-alike name.
  for (const group of groupBy(candidates, r => exerciseVideoKey(r.videoUrl))) {
    for (const a of group) for (const b of group) {
      if (a.id < b.id && exercisesShareScope(a, b) && namesLookAlike(a.name, b.name)) {
        uf.union(a.id, b.id)
        for (const id of [a.id, b.id]) if (!mergeReason.has(id)) mergeReason.set(id, 'similar name, same video')
      }
    }
  }

  const components = groupBy(candidates, r => (mergeReason.has(r.id) ? uf.find(r.id) : null))
  const merges: PlanMerge[] = []
  const removedIds = new Set<string>()
  const warnings: string[] = []

  for (const component of components) {
    for (const cluster of legalClusters(component)) {
      const activeMembers = cluster.filter(r => r.isActive)
      if (activeMembers.length === 0) continue
      const keeper = pickKeeper(activeMembers)
      const remove = cluster.filter(r => r.id !== keeper.id && canAbsorb(keeper, r))
      if (remove.length === 0) continue
      const reason = remove.every(r => normalizeExerciseName(r.name) === normalizeExerciseName(keeper.name)) ? 'same name' : 'similar name, same video'
      merges.push({ approved: true, reason, keep: toPlan(keeper), remove: remove.map(toPlan) })
      for (const r of remove) {
        removedIds.add(r.id)
        const org = r.organizationId ? orgs.get(r.organizationId) : undefined
        if (keeper.source === 'UNIVERSAL' && r.source === 'ORGANIZATION' && org?.pref === 'ORGANIZATION') {
          warnings.push(`"${r.name}" (${org.name}) merges into the universal copy, but ${org.name} only shows its own library in the picker — it will stop seeing this exercise there.`)
        }
      }
    }
  }
  merges.sort((a, b) => (a.reason === b.reason ? a.keep.name.localeCompare(b.keep.name) : a.reason === 'same name' ? -1 : 1))

  // Whatever still shares a video after the proposed merges.
  const survivors = active.filter(r => !removedIds.has(r.id))
  const sharedVideo = groupBy(survivors, r => exerciseVideoKey(r.videoUrl))
    .filter(g => g.some(a => g.some(b => a.id !== b.id && exercisesShareScope(a, b))))
    .map(g => ({ video: g[0].videoUrl ?? '', exercises: g.map(toPlan) }))

  const leftoverNames = groupBy(survivors, r => normalizeExerciseName(r.name)).filter(g =>
    g.some(a => g.some(b => a.id !== b.id && exercisesShareScope(a, b)))
  )
  for (const g of leftoverNames) warnings.push(`Name still duplicated after merges: ${g.map(r => `"${r.name}" (${libraryLabel(r)})`).join(', ')}`)

  const result: Plan = { generatedAt: new Date().toISOString(), merges, sharedVideo, clearVideo: [], delete: [], warnings }
  mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(PLAN_PATH, JSON.stringify(result, null, 2))

  const removing = merges.reduce((n, m) => n + m.remove.length, 0)
  console.log(`\n${all.length} exercises (${active.length} active)`)
  console.log(`\nProposed merges: ${merges.length} groups, ${removing} duplicates removed`)
  for (const m of merges) {
    console.log(`  [${m.reason}] KEEP "${m.keep.name}" (${m.keep.library}, ${m.keep.refs} refs)`)
    for (const r of m.remove) console.log(`      ← "${r.name}" (${r.library}${r.active ? '' : ', archived'}, ${r.refs} refs)`)
  }
  console.log(`\nStill sharing a video after merges: ${sharedVideo.length} groups`)
  for (const g of sharedVideo) console.log(`  ${g.video}\n      ${g.exercises.map(e => `"${e.name}" (${e.library})`).join('\n      ')}`)
  if (warnings.length) console.log(`\nWarnings:\n  ${warnings.join('\n  ')}`)
  console.log(`\nPlan written to ${path.relative(process.cwd(), PLAN_PATH)} — review it, then run with "apply".`)
}

// ── Applying ─────────────────────────────────────────────────────────────────

const FILLABLE_SCALARS = [
  'description', 'instructions', 'videoUrl', 'videoProvider', 'imageUrl', 'commonMistakes',
  'defaultSets', 'defaultReps', 'defaultHoldSeconds', 'cuesThumbnail', 'rehabStage', 'difficultyLevel',
] as const
const FILLABLE_ARRAYS = [
  'bodyRegion', 'equipmentRequired', 'contraindications', 'musclesTargeted', 'exercisePhases', 'indicationTags',
] as const

/** Copies values the kept exercise is missing from its duplicates, so merging never loses content. */
function fillFromDuplicates(keeper: Exercise, dups: Exercise[]): Prisma.ExerciseUpdateInput {
  const data: Record<string, unknown> = {}
  for (const field of FILLABLE_SCALARS) {
    if (keeper[field] !== null && keeper[field] !== '') continue
    const donor = dups.find(d => d[field] !== null && d[field] !== '')
    if (donor) data[field] = donor[field]
  }
  for (const field of FILLABLE_ARRAYS) {
    if ((keeper[field] as unknown[]).length > 0) continue
    const donor = dups.find(d => (d[field] as unknown[]).length > 0)
    if (donor) data[field] = donor[field]
  }
  if (keeper.isAssessment === false && dups.some(d => d.isAssessment)) data.isAssessment = true
  return data as Prisma.ExerciseUpdateInput
}

async function mergeOne(keeper: Exercise, dups: Exercise[]) {
  const keepId = keeper.id
  const dupIds = dups.map(d => d.id)

  await prisma.$transaction(async tx => {
    const fill = fillFromDuplicates(keeper, dups)
    if (Object.keys(fill).length > 0) await tx.exercise.update({ where: { id: keepId }, data: fill })

    await tx.planExercise.updateMany({ where: { exerciseId: { in: dupIds } }, data: { exerciseId: keepId } })
    await tx.blockExercise.updateMany({ where: { exerciseId: { in: dupIds } }, data: { exerciseId: keepId } })
    await tx.blockExerciseV2.updateMany({ where: { exerciseId: { in: dupIds } }, data: { exerciseId: keepId } })

    // ExerciseUsage is unique per (trainer, exercise): sum counts into the kept row.
    for (const usage of await tx.exerciseUsage.findMany({ where: { exerciseId: { in: dupIds } } })) {
      const existing = await tx.exerciseUsage.findUnique({
        where: { trainerId_exerciseId: { trainerId: usage.trainerId, exerciseId: keepId } },
      })
      if (existing) {
        await tx.exerciseUsage.update({
          where: { id: existing.id },
          data: {
            count: existing.count + usage.count,
            lastUsedAt: usage.lastUsedAt > existing.lastUsedAt ? usage.lastUsedAt : existing.lastUsedAt,
          },
        })
        await tx.exerciseUsage.delete({ where: { id: usage.id } })
      } else {
        await tx.exerciseUsage.update({ where: { id: usage.id }, data: { exerciseId: keepId } })
      }
    }

    // ExerciseFavorite is unique per (user, exercise).
    for (const fav of await tx.exerciseFavorite.findMany({ where: { exerciseId: { in: dupIds } } })) {
      const existing = await tx.exerciseFavorite.findUnique({
        where: { userId_exerciseId: { userId: fav.userId, exerciseId: keepId } },
      })
      if (existing) await tx.exerciseFavorite.delete({ where: { id: fav.id } })
      else await tx.exerciseFavorite.update({ where: { id: fav.id }, data: { exerciseId: keepId } })
    }

    await tx.exerciseProgression.updateMany({ where: { exerciseId: { in: dupIds } }, data: { exerciseId: keepId } })
    await tx.exerciseProgression.updateMany({ where: { nextExerciseId: { in: dupIds } }, data: { nextExerciseId: keepId } })
    const progressions = await tx.exerciseProgression.findMany({
      where: { OR: [{ exerciseId: keepId }, { nextExerciseId: keepId }] },
      orderBy: { orderIndex: 'asc' },
    })
    const seen = new Set<string>()
    for (const p of progressions) {
      const key = `${p.exerciseId}>${p.nextExerciseId}>${p.direction}`
      if (p.exerciseId === p.nextExerciseId || seen.has(key)) await tx.exerciseProgression.delete({ where: { id: p.id } })
      else seen.add(key)
    }

    const keeperMediaUrls = new Set((await tx.exerciseMedia.findMany({ where: { exerciseId: keepId } })).map(m => m.url))
    for (const media of await tx.exerciseMedia.findMany({ where: { exerciseId: { in: dupIds } } })) {
      if (keeperMediaUrls.has(media.url)) await tx.exerciseMedia.delete({ where: { id: media.id } })
      else {
        keeperMediaUrls.add(media.url)
        await tx.exerciseMedia.update({ where: { id: media.id }, data: { exerciseId: keepId } })
      }
    }

    await tx.exercise.deleteMany({ where: { id: { in: dupIds } } })
  }, { maxWait: 10_000, timeout: 120_000 })
}

async function apply() {
  if (!existsSync(PLAN_PATH)) throw new Error(`No plan at ${PLAN_PATH} — run "plan" first.`)
  const { merges, clearVideo = [], delete: toDelete = [] } = JSON.parse(readFileSync(PLAN_PATH, 'utf8')) as Plan
  const approved = merges.filter(m => m.approved)

  // Re-validate against the live DB: the plan may be stale or hand-edited.
  const ids = approved.flatMap(m => [m.keep.id, ...m.remove.map(r => r.id)])
  const rows = new Map((await prisma.exercise.findMany({ where: { id: { in: ids } } })).map(r => [r.id, r]))
  const keepIds = new Set(approved.map(m => m.keep.id))
  const removeIds = new Set<string>()
  for (const m of approved) {
    const keeper = rows.get(m.keep.id)
    if (!keeper) throw new Error(`Kept exercise ${m.keep.id} ("${m.keep.name}") no longer exists — re-run "plan".`)
    for (const r of m.remove) {
      const dup = rows.get(r.id)
      if (!dup) throw new Error(`Duplicate ${r.id} ("${r.name}") no longer exists — re-run "plan".`)
      if (keepIds.has(r.id) || removeIds.has(r.id)) throw new Error(`"${r.name}" (${r.id}) appears in more than one merge.`)
      if (keeper.source === 'ORGANIZATION' && (dup.source === 'UNIVERSAL' || dup.organizationId !== keeper.organizationId)) {
        throw new Error(`Can't merge "${dup.name}" into "${keeper.name}": an org exercise can only absorb exercises from its own org.`)
      }
      removeIds.add(r.id)
    }
  }

  for (const e of [...clearVideo, ...toDelete]) {
    if (removeIds.has(e.id)) throw new Error(`"${e.name}" (${e.id}) is merged away and also listed in clearVideo/delete.`)
  }
  const deleteIds = toDelete.map(e => e.id)
  const referenced = await countReferences(deleteIds)
  for (const e of toDelete) {
    if ((referenced.get(e.id) ?? 0) > 0) throw new Error(`Won't delete "${e.name}" (${e.id}): it is still referenced. Merge it instead.`)
  }

  const dupIds = [...removeIds]
  const backup = {
    takenAt: new Date().toISOString(),
    merges: approved,
    clearVideo,
    delete: toDelete,
    exercises: await prisma.exercise.findMany({
      where: { id: { in: [...keepIds, ...dupIds, ...clearVideo.map(e => e.id), ...deleteIds] } },
    }),
    planExercises: await prisma.planExercise.findMany({ where: { exerciseId: { in: dupIds } }, select: { id: true, exerciseId: true } }),
    blockExercises: await prisma.blockExercise.findMany({ where: { exerciseId: { in: dupIds } }, select: { id: true, exerciseId: true } }),
    blockExercisesV2: await prisma.blockExerciseV2.findMany({ where: { exerciseId: { in: dupIds } }, select: { id: true, exerciseId: true } }),
    usages: await prisma.exerciseUsage.findMany({ where: { exerciseId: { in: [...keepIds, ...dupIds] } } }),
    favorites: await prisma.exerciseFavorite.findMany({ where: { exerciseId: { in: [...keepIds, ...dupIds] } } }),
    progressions: await prisma.exerciseProgression.findMany({
      where: { OR: [{ exerciseId: { in: [...keepIds, ...dupIds] } }, { nextExerciseId: { in: [...keepIds, ...dupIds] } }] },
    }),
    media: await prisma.exerciseMedia.findMany({ where: { exerciseId: { in: [...keepIds, ...dupIds] } } }),
  }
  const backupPath = path.join(OUT_DIR, `backup-${backup.takenAt.replace(/[:.]/g, '-')}.json`)
  writeFileSync(backupPath, JSON.stringify(backup, null, 2))
  console.log(`Backup written to ${path.relative(process.cwd(), backupPath)}`)

  let done = 0
  for (const m of approved) {
    await mergeOne(rows.get(m.keep.id)!, m.remove.map(r => rows.get(r.id)!))
    done++
    console.log(`  ✓ "${m.keep.name}" ← ${m.remove.map(r => `"${r.name}"`).join(', ')}`)
  }
  console.log(`\nMerged ${done} groups, removed ${dupIds.length} duplicate exercises. Skipped ${merges.length - approved.length} unapproved.`)

  for (const e of clearVideo) {
    const row = await prisma.exercise.findUnique({ where: { id: e.id } })
    if (!row) throw new Error(`clearVideo: "${e.name}" (${e.id}) no longer exists.`)
    const ytId = row.videoUrl ? extractYouTubeId(row.videoUrl) : null
    // The thumbnail is derived from the video, so it goes with it.
    const imageFromVideo = !!ytId && !!row.imageUrl?.includes(ytId)
    await prisma.exercise.update({
      where: { id: e.id },
      data: { videoUrl: null, videoProvider: null, ...(imageFromVideo ? { imageUrl: null } : {}) },
    })
    console.log(`  ✓ cleared video on "${row.name}"`)
  }

  if (deleteIds.length > 0) {
    const { count } = await prisma.exercise.deleteMany({ where: { id: { in: deleteIds } } })
    console.log(`  ✓ deleted ${count} junk exercise(s): ${toDelete.map(e => `"${e.name}"`).join(', ')}`)
  }
}

async function countReferences(ids: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  if (ids.length === 0) return counts
  const rows = await prisma.exercise.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      _count: {
        select: {
          planExercises: true, blockExercises: true, blockExercisesV2: true, usages: true,
          favoritedBy: true, media: true, progressionsFrom: true, progressionsTo: true,
        },
      },
    },
  })
  for (const r of rows) counts.set(r.id, Object.values(r._count).reduce((a, b) => a + b, 0))
  return counts
}

const command = process.argv[2]
const run = command === 'plan' ? plan : command === 'apply' ? apply : null
if (!run) {
  console.error('Usage: scripts/dedupe-exercises.ts <plan|apply>')
  process.exit(1)
}
run()
  .catch(err => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
