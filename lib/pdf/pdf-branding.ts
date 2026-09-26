/**
 * Pure PDF branding resolution shared by both PDF export routes
 * (`app/api/workout-plans/[id]/pdf` and `app/api/programs/[id]/pdf`) so their
 * header name / tagline / logo / accent can never drift apart.
 *
 * Rules (spec §7, controller rulings for Task 20):
 * - Name + tagline come from the Organization row, so an unbranded org keeps
 *   its own name in the PDF (never "INMOTUS RX"). Branding enabled → the
 *   branded `displayName`.
 * - Logo only when branding is enabled and the URL is one of our own R2
 *   branding assets. Legacy external URLs are never fetched.
 * - Accent only when branding is enabled AND a color was actually set
 *   (`tokens` non-null); `null` means "keep the document's existing product
 *   colour" — including for a branded org that only set a name/logo. Returned
 *   as a hex (react-pdf has no oklch) that is readable as text on white
 *   (≥ 4.5:1), darkened when necessary.
 *
 * Browser-safe / no server-only imports, so it is unit-testable in isolation.
 */
import type { Organization } from "@prisma/client";
import { isOwnAssetUrl } from "@/lib/branding/asset-kinds";
import {
  contrast,
  hexToOklch,
  normalizeHex,
  oklchToHex,
  WHITE,
} from "@/lib/branding/color";
import type { ResolvedBranding } from "@/lib/branding/types";

export type PdfBranding = {
  organizationName?: string;
  tagline?: string;
  /** Own-bucket logo URL to fetch (PNG), or null → no logo. */
  logoUrl: string | null;
  /** Text-safe hex for the org name / title, or null → document default. */
  accentHex: string | null;
};

export type PdfOrgRow = Pick<Organization, "name" | "tagline">;

export type PdfResolvedBranding = Pick<
  ResolvedBranding,
  "enabled" | "displayName" | "tagline" | "primaryHex" | "logoOnLightUrl" | "tokens"
>;

const MIN_TEXT_CONTRAST = 4.5;

function nonBlank(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Returns `hex` as a lower-case 6-digit hex that reads at ≥ 4.5:1 as text on
 * white, darkening its OKLCH lightness (hue/chroma kept) when needed. The
 * check runs on the rounded hex itself, so rounding can't dip it under 4.5.
 * Returns null when `hex` isn't a hex color.
 */
export function pdfTextAccent(hex: string): string | null {
  const normalized = normalizeHex(hex);
  if (!normalized) return null;

  let color = hexToOklch(normalized);
  let out = normalized;
  // Terminates: L reaches 0 (black, 21:1 on white) after at most 100 steps.
  while (contrast(hexToOklch(out), WHITE) < MIN_TEXT_CONTRAST && color.l > 0) {
    color = { ...color, l: Math.max(0, color.l - 0.01) };
    out = oklchToHex(color);
  }
  return out;
}

export function resolvePdfBranding(
  org: PdfOrgRow | null,
  branding: PdfResolvedBranding,
): PdfBranding {
  const orgName = nonBlank(org?.name);
  const orgTagline = nonBlank(org?.tagline);

  if (!branding.enabled) {
    return {
      organizationName: orgName,
      tagline: orgTagline,
      logoUrl: null,
      accentHex: null,
    };
  }

  return {
    organizationName: nonBlank(branding.displayName) ?? orgName,
    tagline: orgTagline ?? nonBlank(branding.tagline),
    logoUrl: isOwnAssetUrl(branding.logoOnLightUrl) ? branding.logoOnLightUrl : null,
    // null (document default) unless a color was actually set — branding a
    // name/logo only shouldn't force the document's own accent to change.
    accentHex: branding.tokens ? pdfTextAccent(branding.primaryHex) : null,
  };
}
