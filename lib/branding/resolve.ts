/**
 * Pure branding resolver (spec §4.4). `lib/services/branding.service.ts`
 * wraps it with data access and caching.
 *
 * Browser-safe: imports Prisma *types* only. Deliberately does not import
 * `lib/r2.ts` (it constructs an S3 client) or the server-only `./assets`.
 */
import type { Organization, Prisma } from "@prisma/client";
import { isOwnAssetUrl } from "./asset-kinds";
import { buildBrandCss } from "./css";
import { DEFAULT_DISPLAY_NAME, DEFAULT_PRIMARY_HEX } from "./defaults";
import { deriveBrandTokens } from "./tokens";
import type { BrandTokens, ResolvedBranding } from "./types";

export type BrandingRecord = Pick<
  Organization,
  | "clerkOrgId"
  | "name"
  | "tagline"
  | "brandingEnabled"
  | "brandDisplayName"
  | "brandPrimaryColor"
  | "brandLogoOnLightUrl"
  | "brandLogoOnDarkUrl"
  | "brandMarkUrl"
  | "brandFaviconUrl"
  | "brandAppleIconUrl"
>;

/** Prisma `select` for {@link BrandingRecord}. */
export const BRANDING_SELECT = {
  clerkOrgId: true,
  name: true,
  tagline: true,
  brandingEnabled: true,
  brandDisplayName: true,
  brandPrimaryColor: true,
  brandLogoOnLightUrl: true,
  brandLogoOnDarkUrl: true,
  brandMarkUrl: true,
  brandFaviconUrl: true,
  brandAppleIconUrl: true,
} as const satisfies Record<keyof BrandingRecord, true> &
  Prisma.OrganizationSelect;

export const DEFAULT_BRANDING: ResolvedBranding = Object.freeze({
  enabled: false,
  orgId: null,
  displayName: DEFAULT_DISPLAY_NAME,
  tagline: null,
  primaryHex: DEFAULT_PRIMARY_HEX,
  logoOnLightUrl: null,
  logoOnDarkUrl: null,
  markUrl: null,
  faviconUrl: null,
  appleIconUrl: null,
  tokens: null,
  css: null,
  themeColor: DEFAULT_PRIMARY_HEX,
});

function ownOrNull(url: string | null | undefined): string | null {
  return isOwnAssetUrl(url) ? url : null;
}

function nonBlank(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

type Theme = { tokens: BrandTokens; css: string };

function buildTheme(hex: string): Theme {
  const tokens = deriveBrandTokens(hex);
  return { tokens, css: buildBrandCss(tokens) };
}

/**
 * Resolves a DB record into the branding read model. Never throws: a stored
 * color that is invalid or fails the guardrail (e.g. a hand-edited row) is
 * warned about and dropped — `tokens`/`css` come back `null` so the page
 * renders the product look from `globals.css` exactly (no derived theme that
 * could introduce AA deviations for an org that only wanted a name/logo).
 * `displayName`/logos/`enabled` still apply; `primaryHex`/`themeColor` fall
 * back to `DEFAULT_PRIMARY_HEX` (spec §4.4 ruling).
 */
export function resolveBranding(record: BrandingRecord | null): ResolvedBranding {
  if (!record || !record.brandingEnabled) return DEFAULT_BRANDING;

  let theme: Theme | null = null;
  if (record.brandPrimaryColor) {
    try {
      theme = buildTheme(record.brandPrimaryColor);
    } catch (error) {
      console.warn(
        `[branding] ignoring unusable brandPrimaryColor for org ${record.clerkOrgId}`,
        error,
      );
    }
  }

  const primaryHex = theme?.tokens.meta.primaryHex ?? DEFAULT_PRIMARY_HEX;

  return {
    enabled: true,
    orgId: record.clerkOrgId,
    displayName:
      nonBlank(record.brandDisplayName) ?? nonBlank(record.name) ?? DEFAULT_DISPLAY_NAME,
    tagline: nonBlank(record.tagline),
    primaryHex,
    logoOnLightUrl: ownOrNull(record.brandLogoOnLightUrl),
    logoOnDarkUrl: ownOrNull(record.brandLogoOnDarkUrl),
    markUrl: ownOrNull(record.brandMarkUrl),
    faviconUrl: ownOrNull(record.brandFaviconUrl),
    appleIconUrl: ownOrNull(record.brandAppleIconUrl),
    tokens: theme?.tokens ?? null,
    css: theme?.css ?? null,
    themeColor: primaryHex,
  };
}
