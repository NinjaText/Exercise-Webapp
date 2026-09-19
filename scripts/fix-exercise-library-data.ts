/**
 * One-off exercise-library data cleanup found during the AI program
 * generation review (2026-09-19):
 *
 *  1. Deactivates test exercises literally named "yahya" — two were active
 *     and one was selected into a generated program.
 *  2. Backfills equipmentRequired for exercises whose NAME says they use a
 *     dumbbell / barbell / kettlebell / medicine ball / resistance band but
 *     whose equipment list is empty or "None", so the equipment filter stops
 *     offering them to bodyweight-only programs.
 *
 * Dry-run by default (prints what would change). Pass --apply to write.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/fix-exercise-library-data.ts
 *   npx tsx --tsconfig tsconfig.json scripts/fix-exercise-library-data.ts --apply
 */
import { prisma } from '@/lib/prisma'

const APPLY = process.argv.includes('--apply')

const NAME_TO_EQUIPMENT: { pattern: RegExp; equipment: string }[] = [
  { pattern: /\bdumbbells?\b/i, equipment: 'Dumbbells' },
  { pattern: /\bbarbell\b/i, equipment: 'barbell' },
  { pattern: /\bkettlebell\b/i, equipment: 'kettlebell' },
  { pattern: /\bmed(?:icine)? ball\b/i, equipment: 'medicine ball' },
  // "IT Band Stretch" is anatomy, so require an equipment qualifier or "banded".
  { pattern: /\b(?:resistance|mini|loop)\s+band\b|\bbanded\b/i, equipment: 'resistance band' },
  { pattern: /\bcable\b/i, equipment: 'cable or band' },
  { pattern: /\btrx\b|\bsuspension\b/i, equipment: 'TRX' },
]

function isEffectivelyEmpty(equipment: string[]): boolean {
  return equipment.filter(e => e && e.trim() && e.trim().toLowerCase() !== 'none').length === 0
}

async function main() {
  const testExercises = await prisma.exercise.findMany({
    where: { name: { equals: 'yahya', mode: 'insensitive' }, isActive: true },
    select: { id: true, name: true, bodyRegion: true },
  })
  console.log(`\n[1] Test exercises to deactivate: ${testExercises.length}`)
  for (const e of testExercises) console.log(`    - ${e.id} "${e.name}" ${e.bodyRegion.join('/')}`)

  const active = await prisma.exercise.findMany({
    where: { isActive: true },
    select: { id: true, name: true, equipmentRequired: true },
  })
  const backfills: { id: string; name: string; before: string[]; after: string[] }[] = []
  for (const e of active) {
    if (!isEffectivelyEmpty(e.equipmentRequired)) continue
    const inferred = NAME_TO_EQUIPMENT.filter(m => m.pattern.test(e.name)).map(m => m.equipment)
    if (inferred.length === 0) continue
    backfills.push({ id: e.id, name: e.name, before: e.equipmentRequired, after: [...new Set(inferred)] })
  }
  console.log(`\n[2] Equipment backfills from exercise name: ${backfills.length}`)
  for (const b of backfills) console.log(`    - "${b.name}": ${JSON.stringify(b.before)} -> ${JSON.stringify(b.after)}`)

  if (!APPLY) {
    console.log('\nDry run — nothing written. Re-run with --apply to write these changes.')
    return
  }

  // Rollback record: previous values, so the change can be reverted by hand.
  console.log('\nROLLBACK_RECORD ' + JSON.stringify({
    deactivated: testExercises.map(e => e.id),
    equipment: backfills.map(b => ({ id: b.id, before: b.before })),
  }))

  if (testExercises.length) {
    await prisma.exercise.updateMany({
      where: { id: { in: testExercises.map(e => e.id) } },
      data: { isActive: false },
    })
  }
  for (const b of backfills) {
    await prisma.exercise.update({ where: { id: b.id }, data: { equipmentRequired: b.after } })
  }
  console.log(`\nApplied: deactivated ${testExercises.length}, backfilled equipment on ${backfills.length}.`)
}

main()
  .catch(err => { console.error(err); process.exit(1) })
  .finally(() => prisma.$disconnect())
