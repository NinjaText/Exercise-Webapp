/**
 * Token derivation for the org branding theming engine (spec §5.2–5.3).
 *
 * Turns one brand hex into the whitelisted set of OKLCH design tokens for
 * light and dark mode. Every derivation below is a small named function that
 * maps 1:1 to a row group of the spec §5.2 table; the contrast-safe
 * foreground / step-until-4.5 rules are spec §5.3.
 *
 * Browser-safe: no `server-only`, prisma, `next/*`, or node-only imports —
 * the branding settings form calls this directly for live preview.
 *
 * All contrast checks run on the exact values that get emitted (gamut-clamped
 * and rounded to `fmtOklch`'s 3 decimals), so a 4.5:1 guarantee made here
 * holds for the CSS string a browser actually receives.
 */
import { clampChroma, oklch, rgb } from "culori";
import {
  WHITE,
  contrast,
  fmtOklch,
  hexToOklch,
  inGuardrail,
  normalizeHex,
  oklchToHex,
  pickForeground,
} from "./color";
import {
  BRAND_TOKEN_NAMES_DARK,
  BRAND_TOKEN_NAMES_LIGHT,
  BrandColorError,
  type BrandTokens,
  type DarkToken,
  type LightToken,
  type Oklch,
} from "./types";

export { BRAND_TOKEN_NAMES_DARK, BRAND_TOKEN_NAMES_LIGHT };

/** WCAG AA for normal text (spec §5.3 — the 3:1 large-text relaxation does not apply). */
const AA = 4.5;
const STEP = 0.01;
const MAX_STEPS = 60;

/** Dark-mode opacity of `--brand-soft` / `--brand-border` over dark primary (spec §5.2). */
const DARK_SOFT_ALPHA = 14;
const DARK_BORDER_ALPHA = 32;

/**
 * Never-overridden dark surfaces (app/globals.css `.dark`) that the
 * translucent dark `--brand-soft` is composited over.
 */
const DARK_BACKGROUND: Oklch = { l: 0.145, c: 0, h: 0 };
const DARK_CARD: Oklch = { l: 0.205, c: 0, h: 0 };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Gamut-clamps to sRGB and snaps to the precision `fmtOklch` emits. Chroma is
 * floored (not rounded) so snapping can never push a clamped color back out
 * of gamut.
 */
function color(l: number, c: number, h: number): Oklch {
  const lc = Math.max(0, Math.min(1, l));
  const clamped = clampChroma({ mode: "oklch", l: lc, c: Math.max(0, c), h }, "oklch");
  return {
    l: Math.round(lc * 1000) / 1000,
    c: Math.floor((clamped?.c ?? 0) * 1000) / 1000,
    h: Math.round((((h % 360) + 360) % 360) * 1000) / 1000,
  };
}

/** Re-snaps an existing triple through {@link color}. */
function snap(o: Oklch): Oklch {
  return color(o.l, o.c, o.h);
}

/**
 * Spec §5.3 "step-until-4.5" loop: moves `start`'s lightness by 0.01 in
 * `direction` until it reaches 4.5:1 against every color in `against`
 * (bounded to 60 steps). Each step is re-clamped to the gamut so the measured
 * value is the emitted value.
 */
function stepUntilContrast(
  start: Oklch,
  against: Oklch[],
  direction: "darker" | "lighter",
): Oklch {
  const passes = (o: Oklch) => against.every((a) => contrast(o, a) >= AA);
  let current = snap(start);
  for (let i = 0; i < MAX_STEPS && !passes(current); i++) {
    const nextL = direction === "darker" ? current.l - STEP : current.l + STEP;
    current = color(nextL, current.c, current.h);
  }
  return current;
}

/**
 * Source-over alpha compositing of `top` at `alphaPct` over an opaque
 * `surface`, in gamma-encoded sRGB — what a browser does with a translucent
 * `oklch(… / N%)` background.
 */
function compositeOver(top: Oklch, alphaPct: number, surface: Oklch): Oklch {
  const a = alphaPct / 100;
  const t = rgb({ mode: "oklch", ...top });
  const s = rgb({ mode: "oklch", ...surface });
  const mixed = oklch({
    mode: "rgb",
    r: t.r * a + s.r * (1 - a),
    g: t.g * a + s.g * (1 - a),
    b: t.b * a + s.b * (1 - a),
  });
  return { l: mixed.l, c: mixed.c ?? 0, h: mixed.h ?? 0 };
}

type Foreground = {
  bg: Oklch;
  fg: Oklch;
  kind: "light" | "dark";
  ratio: number;
  adjusted: boolean;
};

/**
 * Spec §5.3 steps 1–3 for a background that carries text: white if it
 * reaches 4.5:1, else near-black `oklch(0.13 0.02 H)` if that does, else
 * darken the background until white reaches 4.5:1 (darkening is the
 * direction that increases contrast with white).
 */
function resolveForeground(bgIn: Oklch): Foreground {
  const bg = snap(bgIn);
  const picked = pickForeground(bg);
  if (picked) {
    const fg = snap(picked.fg);
    return { bg, fg, kind: picked.kind, ratio: contrast(bg, fg), adjusted: false };
  }
  const adjustedBg = stepUntilContrast(bg, [WHITE], "darker");
  return {
    bg: adjustedBg,
    fg: WHITE,
    kind: "light",
    ratio: contrast(adjustedBg, WHITE),
    adjusted: true,
  };
}

// ---------------------------------------------------------------------------
// Light derivations (spec §5.2, light column)
// ---------------------------------------------------------------------------

/** `--primary`, `--primary-foreground` (= B after §5.3). */
function derivePrimaryLight(b: Oklch): Foreground {
  return resolveForeground(b);
}

/** `--accent` = `oklch(0.94 min(0.04,C) H)`; `--accent-foreground` = `oklch(0.30 min(0.10,C) H)`, stepped darker to 4.5:1. */
function deriveAccentLight(b: Oklch) {
  const accent = color(0.94, Math.min(0.04, b.c), b.h);
  const accentForeground = stepUntilContrast(
    color(0.3, Math.min(0.1, b.c), b.h),
    [accent],
    "darker",
  );
  return { accent, accentForeground };
}

/**
 * `--brand-soft` = `oklch(0.95 min(0.03,C) H)`;
 * `--brand-foreground` = `oklch(0.36 min(0.15,C) H)`, darkened until 4.5:1 on soft;
 * `--brand-border` = `oklch(0.87 min(0.06,C) H)`.
 */
function deriveBrandRoleLight(b: Oklch) {
  const soft = color(0.95, Math.min(0.03, b.c), b.h);
  const foreground = stepUntilContrast(
    color(0.36, Math.min(0.15, b.c), b.h),
    [soft],
    "darker",
  );
  const border = color(0.87, Math.min(0.06, b.c), b.h);
  return { soft, foreground, border };
}

/** `--sidebar`, `--sidebar-gradient-end`, `--sidebar-accent`, `--sidebar-border` (light). */
function deriveSidebarLight(b: Oklch) {
  return {
    sidebar: color(0.18, Math.min(0.04, 0.3 * b.c), b.h),
    gradientEnd: color(0.15, Math.min(0.04, 0.3 * b.c), b.h),
    accent: color(0.25, Math.min(0.05, 0.35 * b.c), b.h),
    border: color(0.28, Math.min(0.04, 0.3 * b.c), b.h),
  };
}

/**
 * `--sidebar-primary` = `oklch(max(L,0.65) min(C,0.15) H)`, lightened until
 * 4.5:1 on `--sidebar` (it is used as text); `--sidebar-primary-foreground`
 * by §5.3. Same rule in both modes, against that mode's sidebar.
 */
function deriveSidebarPrimary(b: Oklch, sidebar: Oklch): Foreground {
  const sidebarPrimary = stepUntilContrast(
    color(Math.max(b.l, 0.65), Math.min(b.c, 0.15), b.h),
    [sidebar],
    "lighter",
  );
  return resolveForeground(sidebarPrimary);
}

// ---------------------------------------------------------------------------
// Dark derivations (spec §5.2, dark column)
// ---------------------------------------------------------------------------

/** Dark `--primary` = `oklch(max(L,0.65) min(C,0.15) H)`, foreground by §5.3. */
function derivePrimaryDark(b: Oklch): Foreground {
  return resolveForeground(color(Math.max(b.l, 0.65), Math.min(b.c, 0.15), b.h));
}

/**
 * Dark `--brand-soft` / `--brand-border` = dark primary at 14% / 32%;
 * `--brand-foreground` = `oklch(0.86 min(0.09,C) H)`, lightened until 4.5:1
 * on the soft tint composited over both dark background and card.
 */
function deriveBrandRoleDark(b: Oklch, darkPrimary: Oklch) {
  const surfaces = [DARK_BACKGROUND, DARK_CARD].map((s) =>
    compositeOver(darkPrimary, DARK_SOFT_ALPHA, s),
  );
  const foreground = stepUntilContrast(
    color(0.86, Math.min(0.09, b.c), b.h),
    surfaces,
    "lighter",
  );
  return {
    soft: fmtOklch(darkPrimary, DARK_SOFT_ALPHA),
    border: fmtOklch(darkPrimary, DARK_BORDER_ALPHA),
    foreground,
  };
}

/** Dark `--sidebar`, `--sidebar-gradient-end`, `--sidebar-accent`. */
function deriveSidebarDark(b: Oklch) {
  return {
    sidebar: color(0.15, Math.min(0.03, 0.3 * b.c), b.h),
    gradientEnd: color(0.12, Math.min(0.03, 0.3 * b.c), b.h),
    accent: color(0.22, Math.min(0.04, 0.35 * b.c), b.h),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Builds a record in the whitelist's order, so keys can never drift from it. */
function inOrder<T extends string>(
  names: readonly T[],
  values: Record<T, string>,
): Record<T, string> {
  const out = {} as Record<T, string>;
  for (const name of names) out[name] = values[name];
  return out;
}

/**
 * Derives the whitelisted light/dark brand tokens from one brand hex.
 *
 * @throws {BrandColorError} `"invalid-hex"` for an unparseable input,
 *   `"out-of-range"` when the color fails the §5.1 lightness guardrail.
 */
export function deriveBrandTokens(hex: string): BrandTokens {
  const inputHex = normalizeHex(hex);
  if (!inputHex) throw new BrandColorError("invalid-hex");

  const b = hexToOklch(inputHex);
  if (!inGuardrail(b)) throw new BrandColorError("out-of-range");

  // Light
  const primary = derivePrimaryLight(b);
  const accent = deriveAccentLight(b);
  const brand = deriveBrandRoleLight(b);
  const sidebar = deriveSidebarLight(b);
  const sidebarPrimary = deriveSidebarPrimary(b, sidebar.sidebar);

  const p = fmtOklch(primary.bg);
  const sp = fmtOklch(sidebarPrimary.bg);
  const light: Record<LightToken, string> = inOrder(BRAND_TOKEN_NAMES_LIGHT, {
    primary: p,
    "primary-foreground": fmtOklch(primary.fg),
    ring: p,
    accent: fmtOklch(accent.accent),
    "accent-foreground": fmtOklch(accent.accentForeground),
    brand: p,
    "brand-foreground": fmtOklch(brand.foreground),
    "brand-soft": fmtOklch(brand.soft),
    "brand-border": fmtOklch(brand.border),
    "chart-2": p,
    sidebar: fmtOklch(sidebar.sidebar),
    "sidebar-gradient-end": fmtOklch(sidebar.gradientEnd),
    "sidebar-accent": fmtOklch(sidebar.accent),
    "sidebar-border": fmtOklch(sidebar.border),
    "sidebar-primary": sp,
    "sidebar-primary-foreground": fmtOklch(sidebarPrimary.fg),
    "sidebar-ring": sp,
  });

  // Dark
  const darkPrimary = derivePrimaryDark(b);
  const darkBrand = deriveBrandRoleDark(b, darkPrimary.bg);
  const darkSidebar = deriveSidebarDark(b);
  const darkSidebarPrimary = deriveSidebarPrimary(b, darkSidebar.sidebar);

  const dp = fmtOklch(darkPrimary.bg);
  const dark: Record<DarkToken, string> = inOrder(BRAND_TOKEN_NAMES_DARK, {
    primary: dp,
    "primary-foreground": fmtOklch(darkPrimary.fg),
    brand: dp,
    "brand-foreground": fmtOklch(darkBrand.foreground),
    "brand-soft": darkBrand.soft,
    "brand-border": darkBrand.border,
    "chart-2": dp,
    sidebar: fmtOklch(darkSidebar.sidebar),
    "sidebar-gradient-end": fmtOklch(darkSidebar.gradientEnd),
    "sidebar-accent": fmtOklch(darkSidebar.accent),
    "sidebar-primary": fmtOklch(darkSidebarPrimary.bg),
    "sidebar-primary-foreground": fmtOklch(darkSidebarPrimary.fg),
  });

  return {
    light,
    dark,
    meta: {
      inputHex,
      primaryHex: primary.adjusted ? oklchToHex(primary.bg) : inputHex,
      adjusted: primary.adjusted,
      ...(primary.adjusted ? { adjustedFromHex: inputHex } : {}),
      primaryForeground: primary.kind,
      contrastOnPrimary: primary.ratio,
    },
  };
}

/**
 * The reason `hex` can't be used as a brand color — the engine's
 * {@link BrandColorError} message — or null when it can (including null, "use
 * the default"). Lets the settings UI show the guardrail message without
 * duplicating its copy.
 */
export function brandColorErrorMessage(hex: string | null): string | null {
  if (hex === null) return null;
  try {
    deriveBrandTokens(hex);
    return null;
  } catch (err) {
    return err instanceof BrandColorError ? err.message : "This color can't be used";
  }
}

/**
 * True when `hex` can be saved as a brand color: null (use the default) or a
 * color {@link deriveBrandTokens} accepts. Mirrors the server-side check in
 * `saveBrandingSettings`, so the settings form can block Save up front.
 */
export function isUsableBrandColor(hex: string | null): boolean {
  return brandColorErrorMessage(hex) === null;
}
