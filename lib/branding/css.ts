/**
 * CSS emission for the org branding theming engine (spec §5.4).
 *
 * `buildBrandCss` produces the ONLY string that is ever injected into a
 * `<style>` tag (`components/branding/brand-style.tsx`, via
 * `dangerouslySetInnerHTML`). It is therefore a security boundary:
 *
 * - property names come from the whitelist constants, never from the input
 *   object's keys, and any unknown key in the input is rejected;
 * - every value is checked by {@link assertOklchLiteral} against the exact
 *   grammar `fmtOklch` emits before it is concatenated;
 * - the final string is checked against {@link BRAND_CSS_RE}, whose property
 *   names are built from the same whitelist.
 *
 * Any failure throws; `resolveBranding` catches and falls back to defaults.
 *
 * Browser-safe: no server-only / prisma / next imports.
 */
import {
  BRAND_TOKEN_NAMES_DARK,
  BRAND_TOKEN_NAMES_LIGHT,
  type BrandTokens,
} from "./types";

/**
 * One `oklch()` literal exactly as `fmtOklch` formats it:
 * - L: `0.ddd` or `1.000` (CSS range 0–1)
 * - C: `d.ddd`
 * - H: 0–359 without leading zeros, then `.ddd` (fmtOklch guarantees < 360)
 * - optional ` / N%` with integer N in 0–100, no leading zeros
 * Single spaces only. No capturing groups so it can be embedded.
 */
const OKLCH_LITERAL_SRC =
  String.raw`oklch\((?:0\.\d{3}|1\.000) \d\.\d{3} (?:[0-9]|[1-9][0-9]|[12][0-9]{2}|3[0-5][0-9])\.\d{3}(?: \/ (?:100|[1-9]?[0-9])%)?\)`;

const OKLCH_LITERAL_RE = new RegExp(`^${OKLCH_LITERAL_SRC}$`);

/** Whitelisted names only contain `[a-z0-9-]`; escape anyway for safety. */
function namesAlternation(names: readonly string[]): string {
  return names.map((n) => n.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&")).join("|");
}

function blockSrc(names: readonly string[]): string {
  return `(?:--(?:${namesAlternation(names)}):${OKLCH_LITERAL_SRC};)+`;
}

/**
 * Full grammar of {@link buildBrandCss}'s output. Property names are
 * constrained to the light/dark whitelists respectively. Exported so the
 * `<BrandStyle>` component test can reuse it.
 */
export const BRAND_CSS_RE = new RegExp(
  `^:root:not\\(\\.dark\\)\\{${blockSrc(BRAND_TOKEN_NAMES_LIGHT)}\\}:root\\.dark\\{${blockSrc(BRAND_TOKEN_NAMES_DARK)}\\}$`,
);

/** Throws unless `value` is a single `oklch()` literal in `fmtOklch` format. */
export function assertOklchLiteral(value: unknown): asserts value is string {
  if (typeof value !== "string" || !OKLCH_LITERAL_RE.test(value)) {
    throw new Error(
      `buildBrandCss: refusing to emit a non-oklch() token value (${JSON.stringify(
        typeof value === "string" ? value.slice(0, 80) : typeof value,
      )})`,
    );
  }
}

function emitBlock(
  mode: "light" | "dark",
  names: readonly string[],
  values: Record<string, unknown>,
): string {
  const allowed = new Set<string>(names);
  for (const key of Object.keys(values)) {
    if (!allowed.has(key)) {
      throw new Error(`buildBrandCss: token "${key}" is not in the ${mode} whitelist`);
    }
  }

  let out = "";
  for (const name of names) {
    const value = values[name];
    assertOklchLiteral(value);
    out += `--${name}:${value};`;
  }
  return out;
}

/**
 * Serializes derived tokens as `:root:not(.dark){…}:root.dark{…}` with no
 * whitespace outside the `oklch()` values.
 *
 * The light block is scoped with `:not(.dark)` rather than plain `:root`
 * because a bare `:root{…}` has the same specificity as `globals.css`'s
 * `.dark{…}` and, coming later in document order, would win under
 * `<html class="dark">` — overriding the dark-only neutral tokens (`ring`,
 * `accent`, `accent-foreground`, `sidebar-border`, `sidebar-ring`) that this
 * engine deliberately leaves system-neutral in dark mode (spec §5.4).
 *
 * @throws if any value or the final string fails the grammar.
 */
export function buildBrandCss(tokens: BrandTokens): string {
  const light = emitBlock("light", BRAND_TOKEN_NAMES_LIGHT, tokens.light);
  const dark = emitBlock("dark", BRAND_TOKEN_NAMES_DARK, tokens.dark);
  const css = `:root:not(.dark){${light}}:root.dark{${dark}}`;

  if (!BRAND_CSS_RE.test(css)) {
    throw new Error("buildBrandCss: output failed the BRAND_CSS_RE grammar check");
  }
  return css;
}
