import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ACCEPTED_MIME,
  ASSET_KINDS,
  ASSET_LIMITS,
  MAX_ASSET_BYTES,
  PENDING_DERIVATIVE_KEY_RE,
  PENDING_KEY_RE,
  assetUrl,
  derivativeSuffixesForKind,
  ownAssetKey,
  validatePendingUpload,
  brandingPrefix,
  derivativeKey,
  fieldForDerivative,
  fieldForKind,
  finalKey,
  isOwnAssetUrl,
  pendingDerivativeKey,
  pendingKey,
  pendingPrefix,
} from "../asset-kinds";

const R2 = "https://assets.example-r2.dev";
const ORG = "org_2abcXYZ09";
const OTHER_ORG = "org_2otherORG";
const UUID = "123e4567-e89b-42d3-a456-426614174000";

beforeEach(() => {
  vi.stubEnv("CLOUDFLARE_R2_PUBLIC_URL", R2);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("constants", () => {
  it("exposes the three kinds, 2 MB cap and raster MIME list", () => {
    expect(ASSET_KINDS).toEqual(["logo-on-light", "logo-on-dark", "mark"]);
    expect(MAX_ASSET_BYTES).toBe(2 * 1024 * 1024);
    expect(ACCEPTED_MIME).toEqual(["image/png", "image/jpeg", "image/webp"]);
  });

  it("sets per-kind limits (logos >= 64 tall, mark >= 128 square, max 4096)", () => {
    expect(ASSET_LIMITS["logo-on-light"]).toMatchObject({ minHeight: 64, maxDim: 4096 });
    expect(ASSET_LIMITS["logo-on-dark"]).toMatchObject({ minHeight: 64, maxDim: 4096 });
    expect(ASSET_LIMITS.mark).toEqual({ minWidth: 128, minHeight: 128, maxDim: 4096 });
  });

  it("maps kinds and derivatives to Organization fields", () => {
    expect(fieldForKind).toEqual({
      "logo-on-light": "brandLogoOnLightUrl",
      "logo-on-dark": "brandLogoOnDarkUrl",
      mark: "brandMarkUrl",
    });
    expect(fieldForDerivative).toEqual({
      "favicon-32": "brandFaviconUrl",
      "apple-180": "brandAppleIconUrl",
    });
  });
});

describe("key helpers", () => {
  it("builds the spec key layout", () => {
    expect(brandingPrefix(ORG)).toBe(`branding/${ORG}/`);
    // Pending uploads live under ONE literal top-level prefix so a single R2
    // lifecycle rule (`branding-pending/`, 1 day) can expire every org's orphans.
    expect(pendingPrefix(ORG)).toBe(`branding-pending/${ORG}/`);
    expect(pendingKey(ORG, "mark", UUID)).toBe(`branding-pending/${ORG}/${UUID}-mark.png`);
    expect(pendingDerivativeKey(ORG, "favicon-32", UUID)).toBe(
      `branding-pending/${ORG}/${UUID}-favicon-32.png`,
    );
    expect(finalKey(ORG, "logo-on-dark", "0a1b2c3d")).toBe(
      `branding/${ORG}/logo-on-dark-0a1b2c3d.png`,
    );
    expect(derivativeKey(ORG, "apple-180", "deadbeef")).toBe(
      `branding/${ORG}/apple-180-deadbeef.png`,
    );
  });

  it("accepts a Mongo ObjectId-shaped id too", () => {
    expect(brandingPrefix("65f1a2b3c4d5e6f708192a3b")).toBe("branding/65f1a2b3c4d5e6f708192a3b/");
  });

  it.each(["", "../x", "org/1", "org_1/..", "..", "org 1", "org.1", "org%2f", "org_1\n", "ørg"])(
    "rejects unsafe org id %j",
    (org) => {
      expect(() => brandingPrefix(org)).toThrow();
      expect(() => pendingKey(org, "mark", UUID)).toThrow();
      expect(() => pendingPrefix(org)).toThrow();
      expect(() => finalKey(org, "mark", "0a1b2c3d")).toThrow();
      expect(() => PENDING_KEY_RE(org, "mark")).toThrow();
    },
  );

  it("rejects bad kinds, uuids and hashes", () => {
    expect(() => pendingKey(ORG, "banner" as never, UUID)).toThrow();
    expect(() => pendingKey(ORG, "mark", "../../evil")).toThrow();
    expect(() => pendingKey(ORG, "mark", UUID.toUpperCase())).toThrow();
    expect(() => finalKey(ORG, "mark", "0A1B2C3D")).toThrow();
    expect(() => finalKey(ORG, "mark", "0a1b2c3")).toThrow();
    expect(() => derivativeKey(ORG, "favicon-16" as never, "0a1b2c3d")).toThrow();
    expect(() => pendingDerivativeKey(ORG, "apple-180", "nope")).toThrow();
    // Strict 8-4-4-4-12 lower-case hex: 36 chars of hex/dashes in the wrong shape fail.
    expect(() => pendingKey(ORG, "mark", "------------------------------------")).toThrow();
    expect(() => pendingKey(ORG, "mark", "123e4567e89b-42d3-a456-426614174000-")).toThrow();
    expect(() => pendingKey(ORG, "mark", "0123456789abcdef0123456789abcdef0123")).toThrow();
  });
});

describe("PENDING_KEY_RE", () => {
  const re = PENDING_KEY_RE(ORG, "logo-on-light");

  it("accepts the caller's own pending key", () => {
    expect(re.test(pendingKey(ORG, "logo-on-light", UUID))).toBe(true);
  });

  it.each([
    [`another org`, `branding-pending/${OTHER_ORG}/${UUID}-logo-on-light.png`],
    [`org id prefix`, `branding-pending/${ORG}x/${UUID}-logo-on-light.png`],
    [`other kind`, `branding-pending/${ORG}/${UUID}-mark.png`],
    [`final key`, `branding/${ORG}/logo-on-light-0a1b2c3d.png`],
    [`old nested pending layout`, `branding/${ORG}/pending/${UUID}-logo-on-light.png`],
    [`pending prefix without dash`, `brandingpending/${ORG}/${UUID}-logo-on-light.png`],
    [`traversal`, `branding-pending/${ORG}/../${OTHER_ORG}/${UUID}-logo-on-light.png`],
    [`traversal into org`, `branding-pending/${OTHER_ORG}/../${ORG}/${UUID}-logo-on-light.png`],
    [`leading junk`, `x/branding-pending/${ORG}/${UUID}-logo-on-light.png`],
    [`trailing junk`, `branding-pending/${ORG}/${UUID}-logo-on-light.png.svg`],
    [`trailing newline`, `branding-pending/${ORG}/${UUID}-logo-on-light.png\n`],
    [`svg`, `branding-pending/${ORG}/${UUID}-logo-on-light.svg`],
    [`short uuid`, `branding-pending/${ORG}/1234-logo-on-light.png`],
    [`dash-only uuid`, `branding-pending/${ORG}/-------------------------------------logo-on-light.png`],
    [`misshapen uuid`, `branding-pending/${ORG}/123e4567e89b-42d3-a456-426614174000--logo-on-light.png`],
    [`upper-case uuid`, `branding-pending/${ORG}/${UUID.toUpperCase()}-logo-on-light.png`],
])("rejects %s", (_label, key) => {
    expect(re.test(key)).toBe(false);
  });

  it("is not stateful (no g/y flags)", () => {
    const key = pendingKey(ORG, "logo-on-light", UUID);
    expect(re.test(key)).toBe(true);
    expect(re.test(key)).toBe(true);
  });

  it("rejects an unknown kind", () => {
    expect(() => PENDING_KEY_RE(ORG, "banner" as never)).toThrow();
  });
});

describe("PENDING_DERIVATIVE_KEY_RE", () => {
  it("accepts the caller's own derivative key", () => {
    expect(PENDING_DERIVATIVE_KEY_RE(ORG, "favicon-32").test(pendingDerivativeKey(ORG, "favicon-32", UUID))).toBe(true);
    expect(PENDING_DERIVATIVE_KEY_RE(ORG, "apple-180").test(pendingDerivativeKey(ORG, "apple-180", UUID))).toBe(true);
  });

  it.each([
    ["another org", `branding-pending/${OTHER_ORG}/${UUID}-favicon-32.png`],
    ["other suffix", `branding-pending/${ORG}/${UUID}-apple-180.png`],
    ["a kind", `branding-pending/${ORG}/${UUID}-mark.png`],
    ["final key", `branding/${ORG}/favicon-32-0a1b2c3d.png`],
    ["traversal", `branding-pending/${ORG}/../${OTHER_ORG}/${UUID}-favicon-32.png`],
    ["trailing junk", `branding-pending/${ORG}/${UUID}-favicon-32.png.svg`],
    ["upper-case uuid", `branding-pending/${ORG}/${UUID.toUpperCase()}-favicon-32.png`],
  ])("rejects %s", (_label, key) => {
    expect(PENDING_DERIVATIVE_KEY_RE(ORG, "favicon-32").test(key)).toBe(false);
  });

  it("rejects an unknown suffix or org id", () => {
    expect(() => PENDING_DERIVATIVE_KEY_RE(ORG, "icon-64" as never)).toThrow();
    expect(() => PENDING_DERIVATIVE_KEY_RE("org/1", "favicon-32")).toThrow();
  });
});

describe("derivativeSuffixesForKind", () => {
  it("is favicon-32 + apple-180 for the mark and nothing for logos", () => {
    expect(derivativeSuffixesForKind("mark")).toEqual(["favicon-32", "apple-180"]);
    expect(derivativeSuffixesForKind("logo-on-light")).toEqual([]);
    expect(derivativeSuffixesForKind("logo-on-dark")).toEqual([]);
  });
});

describe("validatePendingUpload", () => {
  const OTHER_UUID = "923e4567-e89b-42d3-a456-426614174999";
  const fav = pendingDerivativeKey(ORG, "favicon-32", UUID);
  const apple = pendingDerivativeKey(ORG, "apple-180", UUID);

  it("accepts a logo with no derivatives (undefined or empty)", () => {
    const primary = pendingKey(ORG, "logo-on-dark", UUID);
    const expected = { primary, derivatives: [] };
    expect(validatePendingUpload(ORG, "logo-on-dark", primary, undefined)).toEqual(expected);
    expect(validatePendingUpload(ORG, "logo-on-dark", primary, [])).toEqual(expected);
  });

  it("accepts a mark with exactly its two derivatives, in either order, returned canonically", () => {
    const primary = pendingKey(ORG, "mark", UUID);
    const expected = {
      primary,
      derivatives: [
        { suffix: "favicon-32", key: fav },
        { suffix: "apple-180", key: apple },
      ],
    };
    expect(validatePendingUpload(ORG, "mark", primary, [fav, apple])).toEqual(expected);
    expect(validatePendingUpload(ORG, "mark", primary, [apple, fav])).toEqual(expected);
  });

  it.each([
    ["another org's primary", pendingKey(OTHER_ORG, "mark", UUID), [fav, apple]],
    ["a primary for another kind", pendingKey(ORG, "logo-on-light", UUID), [fav, apple]],
    ["no derivatives", pendingKey(ORG, "mark", UUID), undefined],
    ["one derivative", pendingKey(ORG, "mark", UUID), [fav]],
    ["a duplicated derivative", pendingKey(ORG, "mark", UUID), [fav, fav]],
    ["an extra derivative", pendingKey(ORG, "mark", UUID), [fav, apple, fav]],
    ["a derivative with another uuid", pendingKey(ORG, "mark", UUID), [fav, pendingDerivativeKey(ORG, "apple-180", OTHER_UUID)]],
    ["a derivative from another org", pendingKey(ORG, "mark", UUID), [fav, pendingDerivativeKey(OTHER_ORG, "apple-180", UUID)]],
    ["a primary key as a derivative", pendingKey(ORG, "mark", UUID), [fav, pendingKey(ORG, "mark", UUID)]],
    ["a non-string derivative", pendingKey(ORG, "mark", UUID), [fav, 42]],
    ["derivatives not an array", pendingKey(ORG, "mark", UUID), fav],
    ["a non-string primary", 42, [fav, apple]],
  ])("rejects %s", (_label, primary, derivatives) => {
    expect(validatePendingUpload(ORG, "mark", primary as never, derivatives as never)).toBeNull();
  });

  it("rejects derivatives on a logo", () => {
    const primary = pendingKey(ORG, "logo-on-light", UUID);
    expect(validatePendingUpload(ORG, "logo-on-light", primary, [fav])).toBeNull();
  });

  it("returns null (does not throw) for an unsafe org id or unknown kind", () => {
    expect(validatePendingUpload("org/1", "mark", pendingKey(ORG, "mark", UUID), [fav, apple])).toBeNull();
    expect(validatePendingUpload(ORG, "banner" as never, pendingKey(ORG, "mark", UUID), [])).toBeNull();
  });
});

describe("ownAssetKey", () => {
  it("maps an own final URL under the org's prefix back to its key", () => {
    expect(ownAssetKey(ORG, `${R2}/branding/${ORG}/mark-0a1b2c3d.png`)).toBe(`branding/${ORG}/mark-0a1b2c3d.png`);
  });

  it.each([
    null,
    undefined,
    "",
    "https://legacy.example.com/logo.png",
    `${R2}/branding/${OTHER_ORG}/mark-0a1b2c3d.png`,
    `${R2}/branding/${ORG}x/mark-0a1b2c3d.png`,
    `${R2}/branding/${ORG}/`,
    `${R2}/branding/${ORG}/../${OTHER_ORG}/mark.png`,
    `${R2}/branding-pending/${ORG}/${UUID}-mark.png`,
  ])("returns null for %j", (url) => {
    expect(ownAssetKey(ORG, url)).toBeNull();
  });

  it("returns null for an unsafe org id", () => {
    expect(ownAssetKey("org/1", `${R2}/branding/org/1/mark.png`)).toBeNull();
  });
});

describe("assetUrl", () => {
  it("joins the public URL and key, trimming a trailing slash", () => {
    vi.stubEnv("CLOUDFLARE_R2_PUBLIC_URL", `${R2}/`);
    const key = finalKey(ORG, "mark", "0a1b2c3d");
    expect(assetUrl(key)).toBe(`${R2}/${key}`);
  });

  it("produces URLs that isOwnAssetUrl accepts", () => {
    expect(isOwnAssetUrl(assetUrl(finalKey(ORG, "mark", "0a1b2c3d")))).toBe(true);
    expect(isOwnAssetUrl(assetUrl(derivativeKey(ORG, "favicon-32", "0a1b2c3d")))).toBe(true);
  });

  it("builds preview URLs for pending keys (never own URLs)", () => {
    const key = pendingKey(ORG, "mark", UUID);
    expect(assetUrl(key)).toBe(`${R2}/${key}`);
    expect(isOwnAssetUrl(assetUrl(key))).toBe(false);
  });

  it("throws when the public URL is unset", () => {
    vi.stubEnv("CLOUDFLARE_R2_PUBLIC_URL", "");
    expect(() => assetUrl(finalKey(ORG, "mark", "0a1b2c3d"))).toThrow();
  });

  it("rejects keys outside the branding prefix", () => {
    expect(() => assetUrl("/branding/x.png")).toThrow();
    expect(() => assetUrl("other/x.png")).toThrow();
    expect(() => assetUrl("branding-pendingx/x.png")).toThrow();
    expect(() => assetUrl("/branding-pending/x.png")).toThrow();
  });
});

describe("isOwnAssetUrl", () => {
  it("accepts own bucket branding URLs", () => {
    expect(isOwnAssetUrl(`${R2}/branding/org_1/logo-on-light-abc.png`)).toBe(true);
  });

  it("normalises a trailing slash on the base", () => {
    vi.stubEnv("CLOUDFLARE_R2_PUBLIC_URL", `${R2}/`);
    expect(isOwnAssetUrl(`${R2}/branding/org_1/logo.png`)).toBe(true);
  });

  it("reads the env at call time", () => {
    vi.stubEnv("CLOUDFLARE_R2_PUBLIC_URL", "https://other.example");
    expect(isOwnAssetUrl(`${R2}/branding/org_1/logo.png`)).toBe(false);
    expect(isOwnAssetUrl("https://other.example/branding/org_1/logo.png")).toBe(true);
  });

  it("returns false when env is unset or empty", () => {
    vi.stubEnv("CLOUDFLARE_R2_PUBLIC_URL", "");
    expect(isOwnAssetUrl(`${R2}/branding/org_1/logo.png`)).toBe(false);
    expect(isOwnAssetUrl("/branding/org_1/logo.png")).toBe(false);
    delete process.env.CLOUDFLARE_R2_PUBLIC_URL;
    expect(isOwnAssetUrl(`${R2}/branding/org_1/logo.png`)).toBe(false);
  });

  it.each([
    null,
    undefined,
    "",
    "https://example.com/logo.png",
    `${R2}/logo.png`,
    `${R2}/branding/`,
    `${R2}/brandingx/org_1/logo.png`,
    `${R2}.evil.com/branding/org_1/logo.png`,
    `${R2}/branding/../secrets/key.png`,
    `${R2}/branding/%2e%2e/secret/a.png`,
    `${R2}/branding/.%2E/secret/a.png`,
    `${R2}/branding/%2E%2E/secret/a.png`,
    `${R2}/branding/org_1/logo%20x.png`,
    `${R2}/branding/org_1/logo\x00.png`,
    `${R2}/branding/org_1/logo\x1b.png`,
    `${R2}/branding/org_1/logo\x7f.png`,
    `${R2}/branding/org_1\\logo.png`,
    `${R2}/branding/org_1/lo go.png`,
    `${R2}/branding/org_1/logo.png\n`,
    `${R2}/branding/org_1/logo".png`,
    `${R2}/branding/org_1/logo'.png`,
    `${R2}/branding/org_1/<logo>.png`,
    `${R2}/branding/org_1/logo.png?x=1`,
    `${R2}/branding/org_1/logo.png#frag`,
    `http://evil.com/?u=${R2}/branding/org_1/logo.png`,
    // Pending uploads must never be persisted as brand URLs.
    `${R2}/branding-pending/org_1/${UUID}-mark.png`,
  ])("rejects %j", (url) => {
    expect(isOwnAssetUrl(url)).toBe(false);
  });
});

describe("browser safety", () => {
  it("does not import server-only, sharp, the AWS SDK or lib/r2", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(resolve(__dirname, "../asset-kinds.ts"), "utf8");
    const imports = [...src.matchAll(/^\s*import\s[^;]*?from\s+["']([^"']+)["']/gm)]
      .filter((m) => !/^\s*import\s+type\b/.test(m[0]))
      .map((m) => m[1]);
    expect(imports).toEqual([]);
    expect(src).not.toMatch(/["']server-only["']/);
  });
});
