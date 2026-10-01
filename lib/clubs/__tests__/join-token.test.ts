import { describe, it, expect, beforeAll, afterEach } from "vitest";
import {
  signJoinToken, verifyJoinToken, joinCodesMatch, normalizeJoinCode, JOIN_TOKEN_TTL_MS,
} from "@/lib/clubs/join-token";

beforeAll(() => {
  process.env.CLERK_SECRET_KEY = "test-clerk-secret-key-minimum-20-chars";
});

afterEach(() => {
  delete process.env.CLERK_SECRET_KEY;
  process.env.CLERK_SECRET_KEY = "test-clerk-secret-key-minimum-20-chars";
});

describe("join token", () => {
  const t0 = 1_800_000_000_000;

  it("verifies for the same org before expiry", () => {
    const token = signJoinToken("org_abc", t0);
    expect(verifyJoinToken(token, "org_abc", t0 + 1000)).toBe(true);
  });
  it("rejects another org", () => {
    expect(verifyJoinToken(signJoinToken("org_abc", t0), "org_xyz", t0)).toBe(false);
  });
  it("rejects after expiry", () => {
    expect(verifyJoinToken(signJoinToken("org_abc", t0), "org_abc", t0 + JOIN_TOKEN_TTL_MS + 1)).toBe(false);
  });
  it("rejects a tampered expiry or signature", () => {
    const [org, exp, mac] = signJoinToken("org_abc", t0).split(".");
    expect(verifyJoinToken(`${org}.${Number(exp) + 999999}.${mac}`, "org_abc", t0)).toBe(false);
    expect(verifyJoinToken(`${org}.${exp}.AAAA`, "org_abc", t0)).toBe(false);
  });
  it("rejects missing / malformed tokens", () => {
    expect(verifyJoinToken(undefined, "org_abc", t0)).toBe(false);
    expect(verifyJoinToken("garbage", "org_abc", t0)).toBe(false);
  });
  it("throws when CLERK_SECRET_KEY is missing on sign", () => {
    delete process.env.CLERK_SECRET_KEY;
    expect(() => signJoinToken("org_abc", t0)).toThrow("CLERK_SECRET_KEY must be set to sign club join tokens");
  });
  it("throws when CLERK_SECRET_KEY is too short on sign", () => {
    process.env.CLERK_SECRET_KEY = "short";
    expect(() => signJoinToken("org_abc", t0)).toThrow("CLERK_SECRET_KEY must be set to sign club join tokens");
  });
  it("rejects a token signed with a different key", () => {
    const token = signJoinToken("org_abc", t0);
    process.env.CLERK_SECRET_KEY = "different-clerk-secret-key-minimum-20-chars";
    expect(verifyJoinToken(token, "org_abc", t0 + 1000)).toBe(false);
  });
});

describe("join codes", () => {
  it("normalizes case and whitespace", () => {
    expect(normalizeJoinCode("  pineValley24 ")).toBe("PINEVALLEY24");
    expect(joinCodesMatch(" pinevalley24", "PINEVALLEY24")).toBe(true);
  });
  it("rejects wrong, empty, or unset codes", () => {
    expect(joinCodesMatch("PINEVALLEY25", "PINEVALLEY24")).toBe(false);
    expect(joinCodesMatch("", "PINEVALLEY24")).toBe(false);
    expect(joinCodesMatch("ANY", null)).toBe(false);
  });
});
