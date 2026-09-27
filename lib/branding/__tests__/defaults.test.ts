import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_DISPLAY_NAME, DEFAULT_LIGHT_TOKENS, DEFAULT_PRIMARY_HEX } from "../defaults";
import { BRAND_TOKEN_NAMES_LIGHT } from "../types";
import { hexToOklch } from "../color";

describe("DEFAULT_PRIMARY_HEX", () => {
  it("is pinned to the computed nearest hex for oklch(0.47 0.19 264)", () => {
    // See defaults.ts for how this was derived and why it differs from the
    // brief's eyeballed "#4f46e5" guess.
    expect(DEFAULT_PRIMARY_HEX).toBe("#204ec3");
  });

  it("round-trips back to ≈ oklch(0.47 0.19 264), reproducing the product's existing --primary token", () => {
    const o = hexToOklch(DEFAULT_PRIMARY_HEX);
    expect(o.l).toBeCloseTo(0.47, 2);
    expect(o.c).toBeCloseTo(0.19, 2);
    expect(o.h).toBeCloseTo(264, 0);
  });
});

describe("DEFAULT_DISPLAY_NAME", () => {
  it("is INMOTUS RX", () => {
    expect(DEFAULT_DISPLAY_NAME).toBe("INMOTUS RX");
  });
});

describe("DEFAULT_LIGHT_TOKENS", () => {
  // The top-level `:root { ... }` block of app/globals.css (the light theme).
  const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
  const rootBlock = css.match(/^:root\s*\{([\s\S]*?)^\}/m)?.[1] ?? "";

  function rootValue(token: string): string | undefined {
    // Token names are [a-z0-9-] only, so they need no regex escaping.
    return rootBlock.match(new RegExp(`^\\s*--${token}:\\s*([^;]+);`, "m"))?.[1].trim();
  }

  it("found the :root block", () => {
    expect(rootBlock).toContain("--primary:");
  });

  it("has exactly the light brand token names", () => {
    expect(Object.keys(DEFAULT_LIGHT_TOKENS).sort()).toEqual([...BRAND_TOKEN_NAMES_LIGHT].sort());
  });

  it.each([...BRAND_TOKEN_NAMES_LIGHT])("--%s matches the :root value in app/globals.css", (token) => {
    const value = rootValue(token);
    expect(value).toBeDefined();
    expect(DEFAULT_LIGHT_TOKENS[token]).toBe(value);
  });
});
