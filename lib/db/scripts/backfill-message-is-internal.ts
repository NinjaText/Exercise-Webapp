import { prisma } from "@/lib/prisma";

/**
 * One-time backfill: sets `isInternal: false` on every Message document that
 * predates the isInternal field. MongoDB doesn't retroactively apply Prisma's
 * `@default(false)` to existing documents, and `{isInternal: false}` does not
 * match documents where the field is absent — so every query that filters on
 * isInternal silently misbehaves for pre-existing messages until this runs.
 */
async function backfillMessageIsInternal() {
  const result = await prisma.$runCommandRaw({
    update: "Message",
    updates: [
      {
        q: { isInternal: { $exists: false } },
        u: { $set: { isInternal: false } },
        multi: true,
      },
    ],
  });

  console.log("Backfill result:", JSON.stringify(result, null, 2));
}

backfillMessageIsInternal()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Backfill failed:", error);
    process.exit(1);
  });
