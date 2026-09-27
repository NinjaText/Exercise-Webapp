/**
 * Brand asset kinds, limits, R2 key layout and URL helpers (spec §6).
 *
 * Browser-safe on purpose: the uploader client component needs the MIME/size
 * constants and the resolver needs `isOwnAssetUrl`. This module must NOT import
 * `server-only`, sharp, the AWS SDK or `lib/r2.ts` — only types. Image
 * processing and R2 deletion live in the server-only `./assets`.
 */
import type { Organization } from "@prisma/client";

export const ASSET_KINDS = ["logo-on-light", "logo-on-dark", "mark"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

/** Derived from the mark at upload time. */
export const DERIVATIVE_SUFFIXES = ["favicon-32", "apple-180"] as const;
export type DerivativeSuffix = (typeof DERIVATIVE_SUFFIXES)[number];

export const MAX_ASSET_BYTES = 2 * 1024 * 1024;

export const ACCEPTED_MIME = ["image/png", "image/jpeg", "image/webp"] as const;
export type AcceptedMime = (typeof ACCEPTED_MIME)[number];

export type AssetLimits = { minWidth: number; minHeight: number; maxDim: number };

/** Measured on the displayed (EXIF-oriented) image. */
export const ASSET_LIMITS: Readonly<Record<AssetKind, AssetLimits>> = Object.freeze({
  "logo-on-light": { minWidth: 1, minHeight: 64, maxDim: 4096 },
  "logo-on-dark": { minWidth: 1, minHeight: 64, maxDim: 4096 },
  mark: { minWidth: 128, minHeight: 128, maxDim: 4096 },
});

/** Organization column that stores each kind's public URL. */
export const fieldForKind = {
  "logo-on-light": "brandLogoOnLightUrl",
  "logo-on-dark": "brandLogoOnDarkUrl",
  mark: "brandMarkUrl",
} as const satisfies Record<AssetKind, keyof Organization>;

/** Organization column that stores each mark derivative's public URL. */
export const fieldForDerivative = {
  "favicon-32": "brandFaviconUrl",
  "apple-180": "brandAppleIconUrl",
} as const satisfies Record<DerivativeSuffix, keyof Organization>;

export function isAssetKind(value: unknown): value is AssetKind {
  return typeof value === "string" && (ASSET_KINDS as readonly string[]).includes(value);
}

function isDerivativeSuffix(value: unknown): value is DerivativeSuffix {
  return typeof value === "string" && (DERIVATIVE_SUFFIXES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// R2 key layout
//
//   branding-pending/<clerkOrgId>/<uuid>-<kind|suffix>.png   (upload route)
//   branding/<clerkOrgId>/<kind|suffix>-<sha256[:8]>.png     (after confirm)
//
// Pending uploads sit under ONE literal top-level prefix so a single R2
// lifecycle rule ("expire `branding-pending/` after 1 day") removes every
// org's abandoned uploads — R2 lifecycle prefixes are literal, not globs.
//
// Every helper validates its inputs and throws on anything else, so a key can
// never escape its org's prefix.
// ---------------------------------------------------------------------------

/** Clerk org ids (`org_…`) and Mongo ObjectIds both fit; no `/`, `.`, `%`. */
const ORG_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
/** Strict 8-4-4-4-12 lower-case hex (what `crypto.randomUUID()` produces). */
const UUID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const UUID_RE = new RegExp(`^${UUID_PATTERN}$`);
const SHA8_RE = /^[0-9a-f]{8}$/;

function assertOrgId(orgId: string): void {
  if (typeof orgId !== "string" || !ORG_ID_RE.test(orgId)) {
    throw new Error("Invalid organization id for a brand asset key");
  }
}

function assertKind(kind: AssetKind): void {
  if (!isAssetKind(kind)) throw new Error("Invalid brand asset kind");
}

function assertSuffix(suffix: DerivativeSuffix): void {
  if (!isDerivativeSuffix(suffix)) throw new Error("Invalid brand asset derivative");
}

function assertUuid(uuid: string): void {
  if (typeof uuid !== "string" || !UUID_RE.test(uuid)) {
    throw new Error("Invalid upload id for a brand asset key");
  }
}

function assertSha8(sha8: string): void {
  if (typeof sha8 !== "string" || !SHA8_RE.test(sha8)) {
    throw new Error("Invalid content hash for a brand asset key");
  }
}

/** `branding/<orgId>/` — the trailing slash keeps `org_1` from matching `org_10`. */
export function brandingPrefix(orgId: string): string {
  assertOrgId(orgId);
  return `branding/${orgId}/`;
}

/** Literal top-level prefix for every org's unconfirmed uploads. */
export const PENDING_ROOT = "branding-pending/";

/** `branding-pending/<orgId>/` — trailing slash for the same reason as above. */
export function pendingPrefix(orgId: string): string {
  assertOrgId(orgId);
  return `${PENDING_ROOT}${orgId}/`;
}

export function pendingKey(orgId: string, kind: AssetKind, uuid: string): string {
  assertKind(kind);
  assertUuid(uuid);
  return `${pendingPrefix(orgId)}${uuid}-${kind}.png`;
}

/** Pending key for a mark derivative uploaded alongside `pendingKey(org, "mark", uuid)`. */
export function pendingDerivativeKey(
  orgId: string,
  suffix: DerivativeSuffix,
  uuid: string,
): string {
  assertSuffix(suffix);
  assertUuid(uuid);
  return `${pendingPrefix(orgId)}${uuid}-${suffix}.png`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&");
}

/**
 * Anchored matcher for a pending key the caller (identified by `orgId`) may
 * confirm for `kind`. Another org's key, traversal and trailing junk all fail.
 */
export function PENDING_KEY_RE(orgId: string, kind: AssetKind): RegExp {
  assertOrgId(orgId);
  assertKind(kind);
  return new RegExp(
    `^branding-pending/${escapeRegExp(orgId)}/${UUID_PATTERN}-${escapeRegExp(kind)}\\.png$`,
  );
}

/** Anchored matcher for a mark derivative's pending key, scoped to `orgId`. */
export function PENDING_DERIVATIVE_KEY_RE(orgId: string, suffix: DerivativeSuffix): RegExp {
  assertOrgId(orgId);
  assertSuffix(suffix);
  return new RegExp(
    `^branding-pending/${escapeRegExp(orgId)}/${UUID_PATTERN}-${escapeRegExp(suffix)}\\.png$`,
  );
}

/** Derivatives the upload route stages alongside each kind (mark only). */
export function derivativeSuffixesForKind(kind: AssetKind): readonly DerivativeSuffix[] {
  return kind === "mark" ? DERIVATIVE_SUFFIXES : [];
}

export type ValidatedPendingUpload = {
  primary: string;
  /** In canonical `DERIVATIVE_SUFFIXES` order. */
  derivatives: Array<{ suffix: DerivativeSuffix; key: string }>;
};

/**
 * Validates one staged upload for `confirmBrandAsset`: the primary key must
 * match `PENDING_KEY_RE(orgId, kind)`, and the derivative keys must be exactly
 * the kind's expected set (mark → favicon-32 + apple-180, any order; logos →
 * none), each org-scoped and carrying the primary's upload UUID.
 *
 * Returns null — never throws — for anything else, so callers can reject
 * before any storage call.
 */
export function validatePendingUpload(
  orgId: string,
  kind: AssetKind,
  primaryKey: unknown,
  derivativeKeys: unknown,
): ValidatedPendingUpload | null {
  try {
    if (typeof primaryKey !== "string" || !PENDING_KEY_RE(orgId, kind).test(primaryKey)) {
      return null;
    }
    const uuid = primaryKey.slice(pendingPrefix(orgId).length).slice(0, 36);

    const keys = derivativeKeys === undefined ? [] : derivativeKeys;
    if (!Array.isArray(keys)) return null;

    const expected = derivativeSuffixesForKind(kind);
    if (keys.length !== expected.length) return null;

    const derivatives: ValidatedPendingUpload["derivatives"] = [];
    for (const suffix of expected) {
      const key = pendingDerivativeKey(orgId, suffix, uuid);
      if (!keys.includes(key)) return null;
      derivatives.push({ suffix, key });
    }
    // Same length + every expected key present ⇒ no duplicates or extras.
    return { primary: primaryKey, derivatives };
  } catch {
    return null;
  }
}

export function finalKey(orgId: string, kind: AssetKind, sha8: string): string {
  assertKind(kind);
  assertSha8(sha8);
  return `${brandingPrefix(orgId)}${kind}-${sha8}.png`;
}

export function derivativeKey(orgId: string, suffix: DerivativeSuffix, sha8: string): string {
  assertSuffix(suffix);
  assertSha8(sha8);
  return `${brandingPrefix(orgId)}${suffix}-${sha8}.png`;
}

// ---------------------------------------------------------------------------
// Public URLs
// ---------------------------------------------------------------------------

function publicBase(): string {
  return (process.env.CLOUDFLARE_R2_PUBLIC_URL ?? "").trim().replace(/\/+$/, "");
}

/**
 * Public URL for a branding key (final `branding/…` or a pending
 * `branding-pending/…` preview). Reads `CLOUDFLARE_R2_PUBLIC_URL` at call
 * time and throws when it is unset (never store a relative URL).
 *
 * Only `branding/` URLs pass `isOwnAssetUrl`, so a pending preview URL can
 * never be persisted or rendered as a brand asset.
 */
export function assetUrl(key: string): string {
  if (
    typeof key !== "string" ||
    !(key.startsWith("branding/") || key.startsWith(PENDING_ROOT))
  ) {
    throw new Error("Brand asset keys must live under branding/ or branding-pending/");
  }
  const base = publicBase();
  if (!base) throw new Error("CLOUDFLARE_R2_PUBLIC_URL is not configured");
  return `${base}/${key}`;
}

// Characters/sequences that must never appear in an asset URL we render.
// `%` is rejected because percent-encoded dot segments (`%2e%2e`, `.%2E`)
// are resolved by WHATWG URL parsing and would escape the `branding/`
// prefix; our keys never contain it. Control characters are rejected too.
const UNSAFE_URL_RE = /\.\.|[\\\s"'`<>?#%\x00-\x1f\x7f]/;

/**
 * True only for URLs under our own R2 bucket's `branding/` prefix.
 * Reads `CLOUDFLARE_R2_PUBLIC_URL` at call time; false when it is unset.
 */
export function isOwnAssetUrl(url: string | null | undefined): url is string {
  if (typeof url !== "string" || url.length === 0) return false;

  const base = publicBase();
  if (!base) return false;

  const prefix = `${base}/branding/`;
  if (!url.startsWith(prefix) || url.length === prefix.length) return false;

  return !UNSAFE_URL_RE.test(url);
}

/**
 * The R2 key behind an own asset URL, only when it lives under
 * `branding/<orgId>/` — so cleanup can never touch another org's objects,
 * pending uploads, or anything outside our bucket. Null otherwise.
 */
export function ownAssetKey(orgId: string, url: string | null | undefined): string | null {
  if (!isOwnAssetUrl(url)) return null;
  let prefix: string;
  try {
    prefix = brandingPrefix(orgId);
  } catch {
    return null;
  }
  const key = url.slice(publicBase().length + 1);
  if (!key.startsWith(prefix) || key.length === prefix.length || key.slice(prefix.length).includes("/")) {
    return null;
  }
  return key;
}
