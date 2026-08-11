import { prisma } from "@/lib/prisma";

/**
 * One-time backfill: sets `isAssessment: false` on every Exercise document
 * that predates the isAssessment field. MongoDB doesn't retroactively apply
 * Prisma's `@default(false)` to existing documents, and `{isAssessment: false}`
 * does not match documents where the field is absent — so every query that
 * filters on isAssessment silently returns nothing for pre-existing exercises
 * until this runs.
 */
async function backfillIsAssessment() {
  const result = await prisma.$runCommandRaw({
    update: "Exercise",
    updates: [
      {
        q: { isAssessment: { $exists: false } },
        u: { $set: { isAssessment: false } },
        multi: true,
      },
    ],
  });

  console.log("Backfill result:", JSON.stringify(result, null, 2));
}

backfillIsAssessment()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Backfill failed:", error);
    process.exit(1);
  });
