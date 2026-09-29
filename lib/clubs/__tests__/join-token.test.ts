import { describe, it, expect, beforeAll } from "vitest";
import {
  signJoinToken, verifyJoinToken, joinCodesMatch, normalizeJoinCode, JOIN_TOKEN_TTL_MS,
} from "@/lib/clubs/join-token";

beforeAll(() => {
  process.env.CLUB_JOIN_SECRET = "test-secret-test-secret-test-secret-xx";
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
