import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * One-time backfill: wraps every existing Exercise document's scalar
 * bodyRegion value into a one-element array, matching the new
 * BodyRegion[] schema field. Idempotent — the query filter uses $expr to
 * check the BSON type of the bodyRegion *field itself* (via the
 * aggregation $type operator), so it only matches documents where
 * bodyRegion is still a plain string. Re-running this script after it has
 * already succeeded is a no-op.
 *
 * NOTE: a query-language `{ bodyRegion: { $type: "string" } }` filter does
 * NOT work here — MongoDB matches query-language $type against an array
 * field's *elements*, so it would keep matching (and re-wrapping) documents
 * that were already migrated to `["REGION"]`, producing double-nested
 * arrays like `[["REGION"]]` on a second run. The $expr form below checks
 * the field's own type and avoids that trap.
 */
async function migrateBodyRegionToArray() {
  const result = await prisma.$runCommandRaw({
    update: "Exercise",
    updates: [
      {
        q: { $expr: { $eq: [{ $type: "$bodyRegion" }, "string"] } },
        u: [{ $set: { bodyRegion: ["$bodyRegion"] } }],
        multi: true,
      },
    ],
  });
  return result;
}

migrateBodyRegionToArray()
  .then((result) => {
    console.log("bodyRegion migration result:", JSON.stringify(result, null, 2));
  })
  .catch((e) => {
    console.error("bodyRegion migration failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
