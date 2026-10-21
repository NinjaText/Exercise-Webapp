import { writeFileSync } from "fs";
import { createClerkClient } from "@clerk/nextjs/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { ORG_MEMBER_LIMIT } from "@/lib/clerk-org-limits";
import {
  migrateClerk,
  migrateStripe,
  type ClerkOrgLike,
  type ClerkUserLike,
  type MigrationDb,
  type PriceInfo,
  type SourceClerk,
  type StripeSide,
  type TargetClerk,
  type TargetStripe,
} from "./live-keys-migration";

/**
 * One-shot move from Clerk dev + Stripe test to Clerk production + Stripe live,
 * keeping every program, client and log. See live-keys-migration.ts for what
 * it does. Dry run by default: it only READS (both Clerk instances, both Stripe
 * modes, the DB) and prints what it would do.
 *
 * BEFORE --apply:
 *   1. Back up the DB (mongodump).
 *   2. Do NOT add the live Clerk webhook endpoint yet — it would race the DB
 *      rewrite for every user/membership this creates. Add it right after.
 *   3. In the live Clerk instance: enable Organizations and add publicMetadata
 *      to the session token ({"publicMetadata": "{{user.public_metadata}}"}),
 *      same as dev — super admin and house coach checks read it.
 *   4. Put the site in a maintenance window: once the DB is rewritten, the app
 *      only works with the LIVE keys.
 *
 * Keys (env or .env; the normal CLERK_SECRET_KEY / STRIPE_SECRET_KEY are ignored):
 *   MIGRATION_SOURCE_CLERK_SECRET_KEY=sk_test_...   Clerk dev instance
 *   MIGRATION_TARGET_CLERK_SECRET_KEY=sk_live_...   Clerk production instance
 *   MIGRATION_SOURCE_STRIPE_SECRET_KEY=sk_test_...  Stripe test mode
 *   MIGRATION_TARGET_STRIPE_SECRET_KEY=sk_live_...  Stripe live mode
 *
 *   npm run db:migrate-to-live-keys                      # dry run
 *   npm run db:migrate-to-live-keys -- --apply           # do it
 *   Options: --only=clerk | --only=stripe   --grace-days=14
 *
 * Safe to re-run: everything already migrated is found again and skipped.
 * --apply writes the old→new id map to live-keys-migration-map.<time>.json.
 */

const PAGE = 100;

function requireKey(name: string, prefixes: string[]): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set`);
  if (!prefixes.some((p) => value.startsWith(p))) {
    throw new Error(`${name} must start with ${prefixes.join(" or ")} — check you didn't swap source and target`);
  }
  return value;
}

/** Retries Clerk 429s (honouring Retry-After) and dropped connections (no HTTP status). */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const e = err as { status?: number; retryAfter?: number; clerkError?: boolean };
      const retryable = e.status === 429 || (e.clerkError === true && e.status === undefined);
      if (!retryable || attempt >= 5) throw err;
      await new Promise((r) => setTimeout(r, (e.retryAfter ?? 2 ** attempt) * 1000));
    }
  }
}

async function allPages<T>(fetch: (page: { limit: number; offset: number }) => Promise<{ data: T[]; totalCount: number }>) {
  const out: T[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, totalCount } = await withRetry(() => fetch({ limit: PAGE, offset }));
    out.push(...data);
    if (data.length < PAGE || out.length >= totalCount) return out;
  }
}

function isNotFound(err: unknown): boolean {
  return (err as { status?: number }).status === 404;
}

function sourceClerk(secretKey: string): SourceClerk {
  const clerk = createClerkClient({ secretKey });
  return {
    listAllUsers: () => allPages((p) => clerk.users.getUserList(p)) as Promise<ClerkUserLike[]>,
    async getOrg(organizationId) {
      try {
        return (await withRetry(() => clerk.organizations.getOrganization({ organizationId }))) as ClerkOrgLike;
      } catch (err) {
        if (isNotFound(err)) return null;
        throw err;
      }
    },
    async listMemberships(organizationId) {
      const rows = await allPages((p) => clerk.organizations.getOrganizationMembershipList({ organizationId, ...p }));
      return rows.map((m) => ({ role: m.role, userId: m.publicUserData?.userId ?? null }));
    },
    async countPendingInvitations(organizationId) {
      const res = await withRetry(() =>
        clerk.organizations.getOrganizationInvitationList({ organizationId, status: ["pending"], limit: 1 })
      );
      return res.totalCount;
    },
  };
}

function targetClerk(secretKey: string): TargetClerk {
  const clerk = createClerkClient({ secretKey });
  const first = async (params: { externalId?: string[]; emailAddress?: string[] }) =>
    ((await withRetry(() => clerk.users.getUserList({ ...params, limit: 1 }))).data[0] as ClerkUserLike | undefined) ??
    null;
  return {
    findUserByExternalId: (externalId) => first({ externalId: [externalId] }),
    findUserByEmail: (email) => first({ emailAddress: [email] }),
    createUser: (input) =>
      withRetry(() =>
        clerk.users.createUser({
          externalId: input.externalId,
          emailAddress: [input.email],
          firstName: input.firstName || undefined,
          lastName: input.lastName || undefined,
          skipPasswordRequirement: true,
          publicMetadata: input.publicMetadata,
          privateMetadata: input.privateMetadata,
          unsafeMetadata: input.unsafeMetadata,
        })
      ) as Promise<ClerkUserLike>,
    async listMigratedOrgs() {
      const orgs = (await allPages((p) => clerk.organizations.getOrganizationList(p))) as ClerkOrgLike[];
      const byOldId = new Map<string, ClerkOrgLike>();
      for (const org of orgs) {
        const from = org.privateMetadata?.migratedFromOrgId;
        if (typeof from === "string") byOldId.set(from, org);
      }
      return byOldId;
    },
    createOrg: (input) =>
      withRetry(() =>
        clerk.organizations.createOrganization({
          name: input.name,
          maxAllowedMemberships: input.maxAllowedMemberships,
          publicMetadata: input.publicMetadata,
          privateMetadata: input.privateMetadata,
        })
      ) as Promise<ClerkOrgLike>,
    async listMemberUserIds(organizationId) {
      const rows = await allPages((p) => clerk.organizations.getOrganizationMembershipList({ organizationId, ...p }));
      return new Set(rows.map((m) => m.publicUserData?.userId).filter((id): id is string => Boolean(id)));
    },
    async createMembership(organizationId, userId, role) {
      await withRetry(() => clerk.organizations.createOrganizationMembership({ organizationId, userId, role }));
    },
  };
}

function isMissing(err: unknown): boolean {
  return (err as { code?: string }).code === "resource_missing";
}

async function orNull<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    if (isMissing(err)) return null;
    throw err;
  }
}

function stripeSide(stripe: Stripe): StripeSide {
  return {
    async getPrice(priceId) {
      const price = await orNull(() => stripe.prices.retrieve(priceId));
      if (!price) return null;
      if (price.unit_amount == null || !price.recurring) {
        throw new Error(`price ${priceId} is not a fixed recurring price`);
      }
      return {
        unitAmount: price.unit_amount,
        currency: price.currency,
        interval: price.recurring.interval,
        intervalCount: price.recurring.interval_count ?? 1,
      };
    },
    async customerExists(customerId) {
      const customer = await orNull(() => stripe.customers.retrieve(customerId));
      return customer !== null && !("deleted" in customer && customer.deleted);
    },
    async subscriptionExists(subscriptionId) {
      return (await orNull(() => stripe.subscriptions.retrieve(subscriptionId))) !== null;
    },
  };
}

function targetStripe(stripe: Stripe): TargetStripe {
  return {
    ...stripeSide(stripe),
    async createClubPrice({ productName, metadata, price, idempotencyKey }: {
      productName: string;
      metadata: Record<string, string>;
      price: PriceInfo;
      idempotencyKey: string;
    }) {
      const product = await stripe.products.create(
        { name: productName, metadata },
        { idempotencyKey: `${idempotencyKey}:product` }
      );
      const created = await stripe.prices.create(
        {
          product: product.id,
          unit_amount: price.unitAmount,
          currency: price.currency,
          recurring: { interval: price.interval, interval_count: price.intervalCount },
          metadata: { clerkOrgId: metadata.clerkOrgId, kind: metadata.kind },
        },
        { idempotencyKey: `${idempotencyKey}:price` }
      );
      return created.id;
    },
    async createCustomer({ email, name, metadata, idempotencyKey }) {
      const customer = await stripe.customers.create({ email, name: name || undefined, metadata }, { idempotencyKey });
      return customer.id;
    },
  };
}

function printFailures(failures: { step: string; id: string; error: string }[]) {
  if (failures.length === 0) return;
  console.log(`\n  ${failures.length} FAILED:`);
  for (const f of failures) console.log(`    [${f.step}] ${f.id}: ${f.error}`);
}

async function main() {
  // tsx doesn't load .env; Node's loader never overrides already-set vars.
  try {
    process.loadEnvFile(".env");
  } catch {
    // No .env file — rely on the environment.
  }
  const apply = process.argv.includes("--apply");
  const only = process.argv.find((a) => a.startsWith("--only="))?.slice("--only=".length);
  if (only && only !== "clerk" && only !== "stripe") throw new Error("--only must be clerk or stripe");
  const graceArg = process.argv.find((a) => a.startsWith("--grace-days="))?.slice("--grace-days=".length);
  const graceDays = graceArg ? Number(graceArg) : 14;
  if (!Number.isInteger(graceDays) || graceDays < 0) throw new Error("--grace-days must be a whole number");

  const dbHost = /@([^/?]+)/.exec(process.env.DATABASE_URL ?? "")?.[1] ?? "(unknown)";
  console.log(`${apply ? "APPLY" : "DRY RUN — nothing is written (pass --apply)"} · database ${dbHost}\n`);

  const db = prisma as unknown as MigrationDb;
  const log = (line: string) => console.log(line);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  if (only !== "stripe") {
    const source = sourceClerk(requireKey("MIGRATION_SOURCE_CLERK_SECRET_KEY", ["sk_test_"]));
    const target = targetClerk(requireKey("MIGRATION_TARGET_CLERK_SECRET_KEY", ["sk_live_"]));
    console.log("Clerk:");
    const r = await migrateClerk({ db, source, target, apply, orgMemberLimit: ORG_MEMBER_LIMIT, log });
    const verb = apply ? "created" : "to create";
    console.log(`  orgs:        ${r.orgs.created} ${verb}, ${r.orgs.existing} already in live`);
    console.log(
      `  users:       ${r.users.created} ${verb}, ${r.users.existing} already in live, ${r.users.linkedByEmail} linked by email`
    );
    console.log(`  memberships: ${r.memberships.created} ${verb}, ${r.memberships.existing} already in live`);
    if (r.users.skippedNoDbRow) console.log(`  skipped ${r.users.skippedNoDbRow} Clerk users with no DB row (never onboarded)`);
    if (r.memberships.skippedUnmappedUser) {
      console.log(`  skipped ${r.memberships.skippedUnmappedUser} memberships whose user isn't migrated`);
    }
    if (r.users.missingInSource.length) {
      console.log(
        `  ${r.users.missingInSource.length} DB users have no dev Clerk account (left as-is; after a completed --apply ` +
          "these are simply users already moved to live):"
      );
      for (const email of r.users.missingInSource) console.log(`    ${email}`);
    }
    if (r.orgs.missingInSource.length) {
      console.log(`  ${r.orgs.missingInSource.length} DB orgs have no dev Clerk org (left as-is): ${r.orgs.missingInSource.join(", ")}`);
    }
    if (r.pendingInvitations) {
      console.log(`  ${r.pendingInvitations} pending invitations are NOT copied — trainers must re-send them`);
    }
    printFailures(r.failures);
    if (r.dbRewriteSkipped && apply) {
      console.log("\n  DB NOT rewritten because of the failures above. Fix them and re-run.");
    } else {
      console.log(`\n  DB rows ${apply ? "rewritten" : "to rewrite"} (old Clerk id → new):`);
      for (const [label, n] of Object.entries(r.dbRewrites)) console.log(`    ${label.padEnd(30)} ${n}`);
    }
    if (apply) {
      const file = `live-keys-migration-map.${stamp}.json`;
      writeFileSync(file, JSON.stringify({ users: r.userMap, orgs: r.orgMap }, null, 2));
      console.log(`\n  id map written to ${file}`);
    }
    if (apply && r.failures.length > 0) process.exit(1);
  }

  if (only !== "clerk") {
    const source = stripeSide(new Stripe(requireKey("MIGRATION_SOURCE_STRIPE_SECRET_KEY", ["sk_test_", "rk_test_"])));
    const target = targetStripe(new Stripe(requireKey("MIGRATION_TARGET_STRIPE_SECRET_KEY", ["sk_live_", "rk_live_"])));
    console.log(`\nStripe (grace trial: ${graceDays} days):`);
    const r = await migrateStripe({ db, source, target, apply, graceDays, log });
    const verb = apply ? "" : "to ";
    console.log(`  club prices:  ${r.clubPrices.recreated} ${verb}recreate, ${r.clubPrices.alreadyLive} already live`);
    console.log(`  trainers:     ${r.trainers.migrated} ${verb}move to a live customer + grace trial, ${r.trainers.alreadyLive} already live`);
    console.log(`  club members: ${r.members.migrated} ${verb}clear test billing + grace trial, ${r.members.alreadyLive} already live`);
    console.log(`  coaching:     ${r.coaching.migrated} ${verb}reset to "accepted, awaiting payment", ${r.coaching.alreadyLive} already live`);
    if (r.clubPrices.missing.length) {
      console.log(`  ${r.clubPrices.missing.length} club prices not found in test mode either — set them in the club form:`);
      for (const m of r.clubPrices.missing) console.log(`    ${m}`);
    }
    printFailures(r.failures);
    if (apply && r.failures.length > 0) process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Live-keys migration failed:", error);
    process.exit(1);
  });
