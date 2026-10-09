import { beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { createRouteMatcher } from "@clerk/nextjs/server";
import { PUBLIC_ROUTES } from "../public-routes";
import { houseCoachSessionInvalid, signClubAdminMarker } from "@/lib/clubs/admin-session-token";

const NOW = 1_800_000_000_000;
let validCookie: string;
let expiredCookie: string;

beforeAll(async () => {
  process.env.CLERK_SECRET_KEY ??= "sk_test_0123456789abcdefghijklmnop";
  const base = {
    sid: "sess1",
    adminUserId: "admin1",
    adminName: "Ada Admin",
    clerkOrgId: "org_pine",
    houseCoachClerkId: "user_coach",
  };
  validCookie = await signClubAdminMarker({ ...base, exp: NOW + 60_000 });
  expiredCookie = await signClubAdminMarker({ ...base, exp: NOW - 1 });
});

const check = (over: Partial<Parameters<typeof houseCoachSessionInvalid>[0]>) =>
  houseCoachSessionInvalid({
    isHouseCoach: true,
    userId: "user_coach",
    cookie: validCookie,
    pathname: "/dashboard",
    now: NOW,
    ...over,
  });

describe("houseCoachSessionInvalid", () => {
  it("ignores users who are not a house coach", async () => {
    expect(await check({ isHouseCoach: false, cookie: undefined, userId: "user_admin" })).toBe(false);
  });

  it("lets a house coach through with a valid marker for that coach", async () => {
    expect(await check({})).toBe(false);
  });

  it("blocks a house coach whose marker names another coach", async () => {
    expect(await check({ userId: "user_other_coach" })).toBe(true);
  });

  it("blocks a house coach with no marker", async () => {
    expect(await check({ cookie: undefined })).toBe(true);
  });

  it("blocks a house coach with an expired marker", async () => {
    expect(await check({ cookie: expiredCookie })).toBe(true);
  });

  it("blocks a house coach with a garbage marker", async () => {
    expect(await check({ cookie: "garbage.value" })).toBe(true);
  });

  it("never blocks the club-session pages or webhooks (no redirect loop)", async () => {
    expect(await check({ cookie: undefined, pathname: "/club-session/ended" })).toBe(false);
    expect(await check({ cookie: undefined, pathname: "/club-session/enter" })).toBe(false);
    expect(await check({ cookie: undefined, pathname: "/api/webhooks/clerk" })).toBe(false);
  });
});

describe("club-session routes", () => {
  const isPublicRoute = createRouteMatcher([...PUBLIC_ROUTES]);
  const req = (path: string) => new NextRequest(new URL(path, "http://localhost:3000"));

  it("are public so the ended page is reachable without a valid session", () => {
    expect(isPublicRoute(req("/club-session/enter"))).toBe(true);
    expect(isPublicRoute(req("/club-session/ended"))).toBe(true);
    expect(isPublicRoute(req("/club-sessions"))).toBe(false);
  });
});
