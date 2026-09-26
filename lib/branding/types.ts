/**
 * Pure, browser-safe types for the org branding theming engine.
 *
 * This module must never import `server-only`, prisma, `next/*`, or any
 * node-only API — the branding settings form runs these helpers directly in
 * the browser for live preview.
 */

/** A color in OKLCH space. `h` (hue) is always a finite number — 0 when the
 * color is achromatic (culori omits `h` for gray/black/white). */
export type Oklch = {
  l: number;
  c: number;
  h: number;
};

/**
 * Overridable token whitelist, spec §5.2 (light column), in table order.
 * Names are bare (no `--` prefix); the CSS builder adds the prefix.
 */
export const BRAND_TOKEN_NAMES_LIGHT = [
  "primary",
  "primary-foreground",
  "ring",
  "accent",
  "accent-foreground",
  "brand",
  "brand-foreground",
  "brand-soft",
  "brand-border",
  "chart-2",
  "sidebar",
  "sidebar-gradient-end",
  "sidebar-accent",
  "sidebar-border",
  "sidebar-primary",
  "sidebar-primary-foreground",
  "sidebar-ring",
] as const;

/**
 * Overridable token whitelist, spec §5.2 (dark column). Omits `ring`,
 * `accent`, `accent-foreground`, `sidebar-border`, and `sidebar-ring`, which
 * stay system-neutral in dark mode.
 */
export const BRAND_TOKEN_NAMES_DARK = [
  "primary",
  "primary-foreground",
  "brand",
  "brand-foreground",
  "brand-soft",
  "brand-border",
  "chart-2",
  "sidebar",
  "sidebar-gradient-end",
  "sidebar-accent",
  "sidebar-primary",
  "sidebar-primary-foreground",
] as const;

export type LightToken = (typeof BRAND_TOKEN_NAMES_LIGHT)[number];
export type DarkToken = (typeof BRAND_TOKEN_NAMES_DARK)[number];

export type BrandTokensMeta = {
  /** The normalized (lower-case, 6-digit) hex the caller passed in. */
  inputHex: string;
  /** The hex actually used for `--primary` (differs only when adjusted). */
  primaryHex: string;
  /** True when §5.3 step 3 had to move the primary's lightness. */
  adjusted: boolean;
  /** Set to `inputHex` when `adjusted` is true. */
  adjustedFromHex?: string;
  /** Which foreground `--primary-foreground` resolved to. */
  primaryForeground: "light" | "dark";
  /** WCAG ratio of `--primary-foreground` on `--primary` (light mode). */
  contrastOnPrimary: number;
};

/** Derived, whitelisted token values (CSS `oklch()` strings) per mode. */
export type BrandTokens = {
  light: Record<LightToken, string>;
  dark: Record<DarkToken, string>;
  meta: BrandTokensMeta;
};

export type BrandColorErrorCode = "invalid-hex" | "out-of-range";

/** Thrown by the theming engine for an unusable brand color. */
export class BrandColorError extends Error {
  readonly code: BrandColorErrorCode;

  constructor(code: BrandColorErrorCode, message?: string) {
    super(
      message ??
        (code === "out-of-range"
          ? "Pick a color that is neither near-black nor near-white — it cannot produce readable buttons and highlights"
          : "Enter a color as a 6-digit hex, e.g. #1d4ed8"),
    );
    this.name = "BrandColorError";
    this.code = code;
  }
}

/**
 * Branding read model, spec §4.4 (plus `tagline`, which the workout-plan PDF
 * needs). Produced by `resolveBranding` in `./resolve.ts`.
 */
export interface ResolvedBranding {
  /** false → everything below is the product default. */
  enabled: boolean;
  orgId: string | null;
  /** "INMOTUS RX" when disabled; else `brandDisplayName ?? name`. */
  displayName: string;
  /** Organization tagline; null when disabled or blank. */
  tagline: string | null;
  /** Hex actually used for `--primary` (contrast-adjusted); product default when disabled. */
  primaryHex: string;
  /** Own-bucket asset URLs only; anything else resolves to null. */
  logoOnLightUrl: string | null;
  logoOnDarkUrl: string | null;
  markUrl: string | null;
  faviconUrl: string | null;
  appleIconUrl: string | null;
  /** null when disabled → no <style> emitted. */
  tokens: BrandTokens | null;
  /** Pre-built CSS block that passed `BRAND_CSS_RE` (see §5.4). */
  css: string | null;
  /** Hex for <meta name="theme-color">. */
  themeColor: string;
}

/**
 * Serialisable, client-safe subset of `ResolvedBranding` for client
 * components (sidebar/header). Never carries tokens or CSS; asset URLs are
 * already own-bucket-only because `resolveBranding` nulls anything else. No
 * `primaryHex` — nothing on the client reads the org's brand color directly,
 * it only ever renders through the `--primary` CSS token.
 */
export type BrandingViewModel = Pick<
  ResolvedBranding,
  "enabled" | "displayName" | "logoOnLightUrl" | "logoOnDarkUrl" | "markUrl"
>;

/** Picks the `BrandingViewModel` fields (explicitly, so nothing else leaks). */
export function toViewModel(b: ResolvedBranding): BrandingViewModel {
  return {
    enabled: b.enabled,
    displayName: b.displayName,
    logoOnLightUrl: b.logoOnLightUrl,
    logoOnDarkUrl: b.logoOnDarkUrl,
    markUrl: b.markUrl,
  };
}
