/**
 * Pure color math for the org branding theming engine.
 *
 * Browser-safe: no `server-only`, prisma, `next/*`, or node-only imports —
 * the branding settings form calls these helpers directly for live preview.
 *
 * Imports are named from culori's root ESM entry point (not the CJS
 * `bundled/culori.cjs`, and not the `culori/all` "everything registered"
 * entry), which is the tree-shakeable pattern that works the same way under
 * both Next.js's bundlers and Vitest.
 */
import { clampChroma, formatHex, oklch, parse, wcagContrast } from "culori";
import type { Oklch } from "./types";

/** Lower-case 6-digit hex, e.g. "#4f46e5". */
export const HEX_RE = /^#[0-9a-f]{6}$/;

const SHORT_HEX_RE = /^#[0-9a-f]{3}$/;

/**
 * Normalizes a user-entered hex string: trims whitespace, lower-cases it,
 * and expands a 3-digit shorthand (`#abc` -> `#aabbcc`). Returns `null` for
 * anything that isn't a valid hex color (missing `#`, wrong length, or
 * invalid characters).
 */
export function normalizeHex(input: string): string | null {
  const trimmed = input.trim().toLowerCase();

  if (HEX_RE.test(trimmed)) {
    return trimmed;
  }

  if (SHORT_HEX_RE.test(trimmed)) {
    const [r, g, b] = trimmed.slice(1).split("");
    return `#${r}${r}${g}${g}${b}${b}`;
  }

  return null;
}

/**
 * Parses a hex color to OKLCH, gamut-clamping it so downstream math never
 * operates on an out-of-gamut chroma. `h` is normalized to `0` when culori
 * omits it (achromatic colors — pure gray, black, or white).
 */
export function hexToOklch(hex: string): Oklch {
  const parsed = oklch(parse(hex));
  if (!parsed) {
    throw new Error(`hexToOklch: could not parse "${hex}" as a color`);
  }

  const clamped = clampChroma(parsed, "oklch") ?? parsed;

  return {
    l: clamped.l,
    c: clamped.c ?? 0,
    h: clamped.h ?? 0,
  };
}

/** Inverse of {@link hexToOklch}: gamut-clamps and formats as a hex string. */
export function oklchToHex(o: Oklch): string {
  const color = { mode: "oklch" as const, l: o.l, c: o.c, h: o.h };
  const clamped = clampChroma(color, "oklch") ?? color;
  return formatHex(clamped);
}

/** WCAG contrast ratio between two OKLCH colors (1–21). */
export function contrast(a: Oklch, b: Oklch): number {
  return wcagContrast({ mode: "oklch", ...a }, { mode: "oklch", ...b });
}

/** Pure white, as an OKLCH triple. */
export const WHITE: Oklch = { l: 1, c: 0, h: 0 };

/** Near-black at the given hue — used as the "dark text" foreground candidate. */
export function NEAR_BLACK(h: number): Oklch {
  return { l: 0.13, c: 0.02, h };
}

/**
 * Chooses a WCAG-AA-safe (≥ 4.5:1) foreground for `bg`, preferring white,
 * then near-black. Returns `null` when neither reaches 4.5:1 — callers must
 * fall back to {@link adjustLightnessUntil} in that case.
 */
export function pickForeground(
  bg: Oklch,
): { fg: Oklch; kind: "light" | "dark"; ratio: number } | null {
  const ratioWhite = contrast(bg, WHITE);
  if (ratioWhite >= 4.5) {
    return { fg: WHITE, kind: "light", ratio: ratioWhite };
  }

  const nearBlack = NEAR_BLACK(bg.h);
  const ratioBlack = contrast(bg, nearBlack);
  if (ratioBlack >= 4.5) {
    return { fg: nearBlack, kind: "dark", ratio: ratioBlack };
  }

  return null;
}

/**
 * Steps `color`'s lightness toward `direction` ("darker" decreases L,
 * "lighter" increases it) until its contrast against `other` reaches `min`,
 * or `max` steps are exhausted. Terminates in bounded time: moving L toward
 * 0 (darker) or 1 (lighter) monotonically increases contrast against a
 * fixed white/near-black `other` until the 4.5:1 threshold is crossed well
 * within 60 steps of 0.01.
 */
export function adjustLightnessUntil(
  color: Oklch,
  other: Oklch,
  min = 4.5,
  direction: "darker" | "lighter",
  step = 0.01,
  max = 60,
): { color: Oklch; steps: number } {
  let current = color;
  let steps = 0;

  while (contrast(current, other) < min && steps < max) {
    const nextL = direction === "darker" ? current.l - step : current.l + step;
    current = { ...current, l: Math.max(0, Math.min(1, nextL)) };
    steps += 1;
  }

  return { color: current, steps };
}

/** Guardrail from spec §5.1: rejects near-black/near-white brand colors. */
export function inGuardrail(o: Oklch): boolean {
  return o.l >= 0.25 && o.l <= 0.8;
}

/**
 * Formats an OKLCH triple as a CSS `oklch()` value, e.g.
 * `"oklch(0.470 0.190 264.000)"`, or with an alpha percentage,
 * `"oklch(0.150 0.040 264.000 / 14%)"`. Every channel is coerced to a
 * finite number first, so a missing/NaN `h` (e.g. an achromatic culori
 * result) never leaks `NaN` or exponential notation into the output.
 *
 * `h` is normalized into `[0, 360)` (negative or >= 360 hues wrap around),
 * and the display rounding is re-checked so a value that rounds up to
 * `360.000` (e.g. `359.9996`) prints as `0.000` instead — the function's
 * own contract is that hue is always `< 360`.
 *
 * `alphaPct` is rounded to the nearest integer and clamped to `[0, 100]`.
 * A non-finite `alphaPct` (`NaN`, `Infinity`, `-Infinity`) is treated the
 * same as an omitted one: no `/ NN%` suffix is emitted, rather than
 * leaking `NaN%` or `Infinity%` into a value CSS would then reject.
 */
export function fmtOklch(o: Oklch, alphaPct?: number): string {
  const l = Number.isFinite(o.l) ? o.l : 0;
  const c = Number.isFinite(o.c) ? o.c : 0;
  const hRaw = Number.isFinite(o.h) ? o.h : 0;
  const h = ((hRaw % 360) + 360) % 360;

  let hFixed = h.toFixed(3);
  if (hFixed === "360.000") {
    hFixed = "0.000";
  }

  const base = `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${hFixed}`;

  if (alphaPct === undefined || !Number.isFinite(alphaPct)) {
    return `${base})`;
  }

  const clampedAlpha = Math.min(100, Math.max(0, Math.round(alphaPct)));
  return `${base} / ${clampedAlpha}%)`;
}
