import { prisma } from "@/lib/prisma";
import { backfillClubNullFields } from "./club-null-fields";

/**
 * One-shot, idempotent backfill: writes explicit nulls into optional
 * MemberSubscription / MemberCoaching fields that were never written, so
 * `{ field: null }` filters (trial reminders, Stripe sync scoping, coaching
 * adoption, expired-trial sweep) see them. Queries also tolerate unset
 * fields (lib/db/mongo-null.ts); this makes the stored data consistent.
 *
 * Dry run by default (counts only). Run after `npx prisma db push`:
 *   npm run db:backfill-club-null-fields            # dry run
 *   npm run db:backfill-club-null-fields -- --apply # write
 */
async function main() {
  // tsx doesn't load .env; Node's loader never overrides already-set vars.
  try {
    process.loadEnvFile(".env");
  } catch {
    // No .env file — rely on the environment.
  }
  const apply = process.argv.includes("--apply");
  const rows = await backfillClubNullFields({ prisma, apply });

  console.log(apply ? "APPLY — explicit nulls written:" : "DRY RUN — nothing written (pass --apply to write):");
  for (const r of rows) {
    console.log(`  ${r.collection}.${r.field}: ${r.missing} missing${apply ? `, ${r.updated} updated` : ""}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Club null-field backfill failed:", error);
    process.exit(1);
  });
