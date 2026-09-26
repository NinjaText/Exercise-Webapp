/**
 * Pure, browser-safe branding defaults. No server-only / prisma / next
 * imports — consumed directly by the branding settings form.
 */

import type { LightToken } from "./types";

/**
 * Nearest displayable sRGB hex to the product's existing `--primary` token
 * (`oklch(0.47 0.19 264)`, see `app/globals.css`).
 *
 * Computed with culori: `formatHex(clampChroma({ mode: "oklch", l: 0.47,
 * c: 0.19, h: 264 }, "oklch"))` → `"#204ec3"`. That input is already inside
 * the sRGB gamut (`clampChroma` returns it unchanged), so this is a pure
 * rounding of the OKLCH triple to the nearest hex, not a gamut-mapped
 * approximation. Pinned exactly in `lib/branding/__tests__/defaults.test.ts`.
 *
 * Note: an earlier draft of the design brief guessed `#4f46e5` for this
 * value by eye. That guess is measurably wrong — `hexToOklch("#4f46e5")`
 * resolves to `oklch(0.511 0.230 276.97)`, not `oklch(0.47 0.19 264)` — so
 * this constant uses the value culori actually computes.
 */
export const DEFAULT_PRIMARY_HEX = "#204ec3";

export const DEFAULT_DISPLAY_NAME = "INMOTUS RX";

/**
 * The product's default value of every light brand token, copied verbatim
 * from the `:root` block of `app/globals.css`. The branding preview applies
 * these inline whenever it isn't showing a derived color, so it never inherits
 * the org's live `<style id="org-brand">` while claiming to show the default.
 *
 * Deliberately NOT `deriveBrandTokens(DEFAULT_PRIMARY_HEX)`: the hand-tuned
 * defaults differ from what the engine derives. Kept in sync with globals.css
 * by `lib/branding/__tests__/defaults.test.ts`.
 */
export const DEFAULT_LIGHT_TOKENS: Record<LightToken, string> = {
  primary: "oklch(0.47 0.19 264)",
  "primary-foreground": "oklch(0.99 0 0)",
  ring: "oklch(0.47 0.19 264)",
  accent: "oklch(0.94 0.04 264)",
  "accent-foreground": "oklch(0.3 0.1 264)",
  brand: "oklch(0.47 0.19 264)",
  "brand-foreground": "oklch(0.36 0.15 264)",
  "brand-soft": "oklch(0.95 0.03 264)",
  "brand-border": "oklch(0.87 0.06 264)",
  "chart-2": "oklch(0.47 0.19 264)",
  sidebar: "oklch(0.18 0.04 264)",
  "sidebar-gradient-end": "oklch(0.15 0.04 264)",
  "sidebar-accent": "oklch(0.25 0.05 264)",
  "sidebar-border": "oklch(0.28 0.04 264)",
  "sidebar-primary": "oklch(0.65 0.15 264)",
  "sidebar-primary-foreground": "oklch(1 0 0)",
  "sidebar-ring": "oklch(0.47 0.19 264)",
};
