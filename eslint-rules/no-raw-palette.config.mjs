// Shared file scope for the no-raw-palette rule, used by both eslint.config.mjs
// and scripts/palette-baseline.mjs so the two cannot drift out of sync.
export const PALETTE_FILES = ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"];
export const PALETTE_IGNORES = [
  "components/ui/**",
  "app/page.tsx",
  "app/about/**",
  "components/emails/**",
  "**/__tests__/**",
  "**/*.test.{ts,tsx}",
];
