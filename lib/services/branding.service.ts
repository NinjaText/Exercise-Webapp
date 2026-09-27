import "server-only";

import { auth } from "@clerk/nextjs/server";
import { unstable_cache, updateTag } from "next/cache";
import { cache } from "react";

import {
  BRANDING_SELECT,
  resolveBranding,
  type BrandingRecord,
} from "@/lib/branding/resolve";
import type { ResolvedBranding } from "@/lib/branding/types";
import { prisma } from "@/lib/prisma";

/**
 * Branding read model with two cache layers (spec §4.4 / §5.5):
 *
 * - `React.cache()` dedupes within one request (layout, generateMetadata,
 *   sidebar and pages share a single read).
 * - `unstable_cache` is the cross-request layer, tagged per org and expired by
 *   `expireBranding` from Server Actions (`updateTag` = immediate expiry, so a
 *   trainer sees their own save on the next `router.refresh()`).
 *
 * The cross-request layer stores the raw `BrandingRecord` (JSON-safe: strings,
 * booleans, nulls). `resolveBranding` runs outside the cache, so derived
 * tokens/CSS never go through JSON and always reflect the current engine.
 */

const BRANDING_REVALIDATE_SECONDS = 3600;

export const brandingTag = (clerkOrgId: string): string =>
  `org-branding:${clerkOrgId}`;

async function loadBrandingRecord(
  clerkOrgId: string,
): Promise<BrandingRecord | null> {
  return prisma.organization.findUnique({
    where: { clerkOrgId },
    select: BRANDING_SELECT,
  });
}

type CachedLoader = (clerkOrgId: string) => Promise<BrandingRecord | null>;

// One cached loader per org so each carries its own tag. Bounded by the number
// of orgs this server instance has served.
const loaders = new Map<string, CachedLoader>();

function cachedLoaderFor(clerkOrgId: string): CachedLoader {
  let loader = loaders.get(clerkOrgId);
  if (!loader) {
    loader = unstable_cache(loadBrandingRecord, ["org-branding", clerkOrgId], {
      tags: [brandingTag(clerkOrgId)],
      revalidate: BRANDING_REVALIDATE_SECONDS,
    });
    loaders.set(clerkOrgId, loader);
  }
  return loader;
}

/** Resolved branding for an org; `null` → product defaults, no DB read. */
export const getOrgBranding = cache(
  async (clerkOrgId: string | null): Promise<ResolvedBranding> => {
    if (!clerkOrgId) return resolveBranding(null);
    const record = await cachedLoaderFor(clerkOrgId)(clerkOrgId);
    return resolveBranding(record);
  },
);

/**
 * Branding for the signed-in user. The org comes from the DB user's
 * `clerkOrgId` (canonical; clients inherit their trainer's org), never from
 * the Clerk session's `orgId` claim.
 */
export const getCurrentBranding = cache(
  async (): Promise<ResolvedBranding> => {
    const { userId } = await auth();
    if (!userId) return resolveBranding(null);

    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: { clerkOrgId: true },
    });
    return getOrgBranding(user?.clerkOrgId ?? null);
  },
);

/**
 * Expire an org's cached branding immediately. `updateTag` throws outside a
 * Server Action (Next 16.1.6), so call this only from Server Actions.
 */
export function expireBranding(clerkOrgId: string): void {
  updateTag(brandingTag(clerkOrgId));
}
