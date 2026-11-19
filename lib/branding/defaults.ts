/**
 * Pure, browser-safe branding defaults. No server-only / prisma / next
 * imports — consumed directly by the branding settings form.
 */

import { PRODUCT_NAME } from "@/lib/brand";
import type { LightToken } from "./types";

/**
 * Nearest displayable sRGB hex to the product's existing `--primary` token
 * (`oklch(0.514 0.082 56)`, the Clay & Espresso bronze, see `app/globals.css`).
 *
 * Computed with culori: `formatHex(clampChroma({ mode: "oklch", l: 0.514,
 * c: 0.082, h: 56 }, "oklch"))` → `"#8b5a36"`. Pinned exactly in
 * `lib/branding/__tests__/defaults.test.ts`.
 */
export const DEFAULT_PRIMARY_HEX = "#8b5a36";

export const DEFAULT_DISPLAY_NAME = PRODUCT_NAME;

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
  primary: "oklch(0.514 0.082 56)",
  "primary-foreground": "oklch(0.984 0.008 74)",
  ring: "oklch(0.514 0.082 56)",
  accent: "oklch(0.942 0.017 68)",
  "accent-foreground": "oklch(0.422 0.067 54)",
  brand: "oklch(0.514 0.082 56)",
  "brand-foreground": "oklch(0.446 0.074 54)",
  "brand-soft": "oklch(0.951 0.015 68)",
  "brand-border": "oklch(0.866 0.034 66)",
  "chart-2": "oklch(0.514 0.082 56)",
  sidebar: "oklch(0.275 0.013 52)",
  "sidebar-gradient-end": "oklch(0.237 0.011 48)",
  "sidebar-accent": "oklch(0.334 0.018 53)",
  "sidebar-border": "oklch(0.321 0.017 56)",
  "sidebar-primary": "oklch(0.732 0.08 58)",
  "sidebar-primary-foreground": "oklch(0.207 0.014 51)",
  "sidebar-ring": "oklch(0.514 0.082 56)",
};
