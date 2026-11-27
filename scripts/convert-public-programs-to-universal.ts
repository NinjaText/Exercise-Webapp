/**
 * One-off: converts programs that were made public in place (trainer-owned,
 * isPublic) into permanent Universal copies — the model "Share to Universal"
 * uses from 2026-11-22. Each live public program gets an ownerless snapshot
 * crediting its trainer; the trainer's original goes back to private with
 * sharedToUniversalAt set. Archived or client-assigned public programs aren't
 * visible in Universal today, so they're only made private, not copied.
 *
 * Idempotent: copies have no trainer and originals end up isPublic: false, so
 * a second run finds nothing.
 *
 *   npx tsx scripts/convert-public-programs-to-universal.ts          # dry run
 *   npx tsx scripts/convert-public-programs-to-universal.ts --apply  # write
 */
import { prisma } from "@/lib/prisma";
import { createUniversalCopy, getProgramById } from "@/lib/services/program.service";

const apply = process.argv.includes("--apply");

async function main() {
  const legacy = (
    await prisma.program.findMany({
      where: { isPublic: true },
      select: { id: true, name: true, trainerId: true, clientId: true, status: true },
    })
  ).filter((p) => p.trainerId);

  console.log(`${legacy.length} trainer-owned public program(s)${apply ? "" : " (dry run — pass --apply to write)"}`);

  for (const p of legacy) {
    const copyIt = !p.clientId && p.status !== "ARCHIVED";
    console.log(`- ${p.name} (${p.id}): ${copyIt ? "copy to Universal + make private" : `make private only (${p.clientId ? "assigned" : "archived"})`}`);
    if (!apply) continue;

    if (copyIt) {
      const source = await getProgramById(p.id);
      if (!source) continue;
      const copy = await createUniversalCopy(source, p.trainerId);
      console.log(`    Universal copy ${copy.id}`);
    }
    await prisma.program.update({
      where: { id: p.id },
      data: { isPublic: false, ...(copyIt && { sharedToUniversalAt: new Date() }) },
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
