import { prisma } from "@/lib/prisma";
import { clerkClient } from "@clerk/nextjs/server";
import type { Organization, ExerciseSourcePreference, Prisma } from "@prisma/client";

/** The editable org-profile fields (the former Clerk publicMetadata set + name). */
export const ORG_PROFILE_KEYS = [
  "name", "tagline", "phone", "email", "website", "address", "exerciseSourcePreference",
] as const;

type OrgProfileKey = (typeof ORG_PROFILE_KEYS)[number];

export type OrganizationProfileInput = Pick<Organization, "name"> &
  Partial<Pick<Organization, Exclude<OrgProfileKey, "name">>>;

const OPTIONAL_TEXT_KEYS = ["tagline", "phone", "email", "website", "address"] as const;

const PREFS: ExerciseSourcePreference[] = ["BOTH", "UNIVERSAL", "ORGANIZATION"];
export function normalizePreference(v: unknown): ExerciseSourcePreference {
  return PREFS.includes(v as ExerciseSourcePreference) ? (v as ExerciseSourcePreference) : "BOTH";
}

/** Trimmed string, or null for empty/whitespace/null. */
export function normalizeText(v: string | null): string | null {
  const t = v?.trim();
  return t ? t : null;
}

/** Trimmed https URL, otherwise null. Used by the org-profile migration script. */
export function normalizeHttpsUrl(v: string | null): string | null {
  const t = normalizeText(v);
  if (!t) return null;
  try {
    return new URL(t).protocol === "https:" ? t : null;
  } catch {
    return null;
  }
}

export async function getOrganizationOrNull(clerkOrgId: string): Promise<Organization | null> {
  return prisma.organization.findUnique({ where: { clerkOrgId } });
}

export async function getOrganization(clerkOrgId: string): Promise<Organization> {
  const existing = await getOrganizationOrNull(clerkOrgId);
  if (existing) return existing;
  // Lazy backfill for orgs that predate the Organization model or were created
  // between deploy and the migration script. One Clerk call, then never again.
  const client = await clerkClient();
  const org = await client.organizations.getOrganization({ organizationId: clerkOrgId });
  try {
    return await prisma.organization.upsert({
      where: { clerkOrgId },
      update: {},
      create: { clerkOrgId, name: org.name },
    });
  } catch (err) {
    // The unique index on clerkOrgId means two concurrent lazy-creates race
    // this upsert; the loser gets a P2002. Re-read the winner's row rather
    // than fail the request.
    if ((err as Prisma.PrismaClientKnownRequestError)?.code !== "P2002") throw err;
    const row = await getOrganizationOrNull(clerkOrgId);
    if (!row) throw err;
    return row;
  }
}

/**
 * Upserts the org profile. `name` is trimmed and required; optional text
 * fields map ""/whitespace → null; omitted (undefined) fields are left unchanged.
 */
export async function upsertOrganizationProfile(
  clerkOrgId: string,
  data: OrganizationProfileInput,
): Promise<Organization> {
  const name = data.name?.trim();
  if (!name) throw new Error("Organization name is required");

  const fields: Omit<Prisma.OrganizationCreateInput, "clerkOrgId"> = { name };
  for (const key of OPTIONAL_TEXT_KEYS) {
    if (data[key] !== undefined) fields[key] = normalizeText(data[key]);
  }
  if (data.exerciseSourcePreference !== undefined) {
    fields.exerciseSourcePreference = normalizePreference(data.exerciseSourcePreference);
  }

  return prisma.organization.upsert({
    where: { clerkOrgId },
    update: fields,
    create: { clerkOrgId, ...fields },
  });
}
