import { prisma } from "@/lib/prisma";

/**
 * One-time backfill: stamps schedulingType: "SCHEDULED" on every Program that
 * predates the field. Idempotent — only matches programs where schedulingType
 * is still null or absent from the document.
 */
async function backfillProgramSchedulingType() {
  const programs = await prisma.program.findMany({
    where: {
      OR: [{ schedulingType: null }, { schedulingType: { isSet: false } }],
    },
    select: { id: true },
  });

  let updated = 0;
  for (const program of programs) {
    await prisma.program.update({
      where: { id: program.id },
      data: { schedulingType: "SCHEDULED" },
    });
    updated++;
  }

  console.log(`Backfilled schedulingType on ${updated} program(s).`);
}

backfillProgramSchedulingType()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Backfill failed:", error);
    process.exit(1);
  });
