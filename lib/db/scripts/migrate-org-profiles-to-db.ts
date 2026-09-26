import { createClerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { migrateOrgProfiles, type FetchOrgsPage } from "./migrate-org-profiles";

/**
 * One-shot, idempotent migration: copies each Clerk organization's name and
 * former `publicMetadata` profile (tagline, phone, email, website, address,
 * exerciseSourcePreference, logoUrl) into the DB `Organization` record.
 * Safe to re-run (upsert by clerkOrgId). Reads from Clerk only — never writes
 * to or deletes anything in Clerk. `brandingEnabled` is never touched.
 *
 * Run after `npx prisma db push`:  npm run db:migrate-org-profiles
 * Single org (e.g. to test on one org first):
 *   npm run db:migrate-org-profiles -- --org=org_123
 *
 * NOTE: `logoUrl` is carried to `brandLogoOnLightUrl` only when it is an https
 * URL. Those carried-over values are EXTERNAL URLs (not our R2 bucket), so
 * `isOwnAssetUrl` IGNORES them everywhere it gates a logo — including the PDF
 * routes, which only ever fetch their own `branding/` URLs. A legacy logo
 * never renders again; trainers re-upload it under Branding.
 */
async function migrateOrgProfilesToDb() {
  // tsx doesn't load .env; Node's loader never overrides already-set vars.
  try {
    process.loadEnvFile(".env");
  } catch {
    // No .env file — rely on the environment.
  }
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) throw new Error("CLERK_SECRET_KEY is not set");
  const clerk = createClerkClient({ secretKey });

  const onlyOrgId = process.argv.find((arg) => arg.startsWith("--org="))?.slice("--org=".length);
  const fetchOrgs: FetchOrgsPage = onlyOrgId
    ? async () => {
        const org = await clerk.organizations.getOrganization({ organizationId: onlyOrgId });
        return { data: [org], totalCount: 1 };
      }
    : ({ limit, offset }) => clerk.organizations.getOrganizationList({ limit, offset });

  const { created, updated, withLogo } = await migrateOrgProfiles({ fetchOrgs, prisma });

  console.log(`${created} created, ${updated} updated, ${withLogo} carried a logo URL`);
}

migrateOrgProfilesToDb()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Org profile migration failed:", error);
    process.exit(1);
  });
