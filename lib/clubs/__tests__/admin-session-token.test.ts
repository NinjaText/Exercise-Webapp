import { describe, expect, it } from "vitest";
import {
  signClubAdminMarker,
  verifyClubAdminMarker,
  type ClubAdminMarker,
} from "../admin-session-token";

const SECRET = "sk_test_0123456789abcdefghijklmnop";
const NOW = 1_800_000_000_000;

const marker: ClubAdminMarker = {
  sid: "sess1",
  adminUserId: "admin1",
  adminName: "Ada Admin",
  clerkOrgId: "org_pine",
  houseCoachClerkId: "user_coach",
  exp: NOW + 60_000,
};

function b64urlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

describe("club admin marker", () => {
  it("round-trips a signed marker", async () => {
    const token = await signClubAdminMarker(marker, SECRET);
    expect(await verifyClubAdminMarker(token, SECRET, NOW)).toEqual(marker);
  });

  it("rejects a missing or malformed token", async () => {
    expect(await verifyClubAdminMarker(undefined, SECRET, NOW)).toBeNull();
    expect(await verifyClubAdminMarker("", SECRET, NOW)).toBeNull();
    expect(await verifyClubAdminMarker("no-dot", SECRET, NOW)).toBeNull();
    expect(await verifyClubAdminMarker("a.b.c", SECRET, NOW)).toBeNull();
  });

  it("rejects a tampered payload", async () => {
    const token = await signClubAdminMarker(marker, SECRET);
    const [, signature] = token.split(".");
    const forged = `${b64urlJson({ ...marker, houseCoachClerkId: "user_other" })}.${signature}`;
    expect(await verifyClubAdminMarker(forged, SECRET, NOW)).toBeNull();
  });

  it("rejects a tampered signature", async () => {
    const token = await signClubAdminMarker(marker, SECRET);
    const [payload, signature] = token.split(".");
    const flipped = (signature[0] === "A" ? "B" : "A") + signature.slice(1);
    expect(await verifyClubAdminMarker(`${payload}.${flipped}`, SECRET, NOW)).toBeNull();
  });

  it("rejects a marker signed with another secret", async () => {
    const token = await signClubAdminMarker(marker, "sk_test_some_other_secret_value_xyz");
    expect(await verifyClubAdminMarker(token, SECRET, NOW)).toBeNull();
  });

  it("rejects an expired marker", async () => {
    const token = await signClubAdminMarker(marker, SECRET);
    expect(await verifyClubAdminMarker(token, SECRET, marker.exp + 1)).toBeNull();
  });
});
