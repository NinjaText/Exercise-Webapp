import type { ExerciseSourcePreference } from "@prisma/client";
import {
  normalizeHttpsUrl,
  normalizePreference,
  normalizeText,
} from "@/lib/services/organization.service";

/**
 * Core of the one-shot Clerk publicMetadata → DB Organization migration.
 * Dependencies are injected so it can be unit-tested with fakes; the thin
 * entry point lives in ./migrate-org-profiles-to-db.ts. Never writes to Clerk.
 */

const PAGE_SIZE = 100;

export type ClerkOrgLike = {
  id: string;
  name: string;
  publicMetadata: Record<string, unknown> | null;
};

export type FetchOrgsPage = (params: { limit: number; offset: number }) => Promise<{
  data: ClerkOrgLike[];
  totalCount: number;
}>;

type OrgProfileData = {
  name: string;
  tagline: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  exerciseSourcePreference: ExerciseSourcePreference;
  brandLogoOnLightUrl?: string;
};

/** Minimal structural slice of PrismaClient used here (keeps fakes simple). */
export type MigrationPrisma = {
  organization: {
    findUnique(args: { where: { clerkOrgId: string } }): Promise<unknown>;
    upsert(args: {
      where: { clerkOrgId: string };
      update: OrgProfileData;
      create: OrgProfileData & { clerkOrgId: string };
    }): Promise<unknown>;
  };
};

export type MigrationSummary = { created: number; updated: number; withLogo: number };

const TEXT_KEYS = ["tagline", "phone", "email", "website", "address"] as const;

function asText(v: unknown): string | null {
  return typeof v === "string" ? normalizeText(v) : null;
}

/** Maps a Clerk org to the DB profile fields. `brandingEnabled` is never set. */
export function mapClerkOrgToProfile(org: ClerkOrgLike): OrgProfileData {
  const meta = org.publicMetadata ?? {};
  const data = { name: org.name } as OrgProfileData;
  for (const key of TEXT_KEYS) data[key] = asText(meta[key]);
  data.exerciseSourcePreference = normalizePreference(meta.exerciseSourcePreference);
  const logo = typeof meta.logoUrl === "string" ? normalizeHttpsUrl(meta.logoUrl) : null;
  if (logo) data.brandLogoOnLightUrl = logo;
  return data;
}

export async function migrateOrgProfiles(deps: {
  fetchOrgs: FetchOrgsPage;
  prisma: MigrationPrisma;
}): Promise<MigrationSummary> {
  const summary: MigrationSummary = { created: 0, updated: 0, withLogo: 0 };

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await deps.fetchOrgs({ limit: PAGE_SIZE, offset });
    for (const org of page.data) {
      const data = mapClerkOrgToProfile(org);
      const existing = await deps.prisma.organization.findUnique({
        where: { clerkOrgId: org.id },
      });
      await deps.prisma.organization.upsert({
        where: { clerkOrgId: org.id },
        update: data,
        create: { clerkOrgId: org.id, ...data },
      });
      if (existing) summary.updated++;
      else summary.created++;
      if (data.brandLogoOnLightUrl) summary.withLogo++;
    }
    if (page.data.length < PAGE_SIZE || offset + PAGE_SIZE >= page.totalCount) break;
  }

  return summary;
}
