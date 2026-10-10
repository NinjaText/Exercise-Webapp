import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

const cookieStore = { get: vi.fn() };
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => cookieStore) }));
vi.mock("@/lib/prisma", () => ({ prisma: { organization: { findFirst: vi.fn() } } }));

import { prisma } from "@/lib/prisma";
import { CLUB_ADMIN_COOKIE, signClubAdminMarker } from "@/lib/clubs/admin-session-token";
import { isStaleHouseCoach } from "../house-coach-guard";
import { activeCallerOnly } from "@/lib/auth/active-user";

const coach = { id: "coach1", clerkId: "user_coach", role: "TRAINER", isActive: true };

async function markerFor(houseCoachClerkId: string) {
  return signClubAdminMarker({
    sid: "sess1",
    adminUserId: "admin1",
    adminName: "Ada Admin",
    clerkOrgId: "org_pine",
    houseCoachClerkId,
    exp: Date.now() + 60_000,
  });
}

beforeAll(() => {
  process.env.CLERK_SECRET_KEY ??= "sk_test_0123456789abcdefghijklmnop";
});

beforeEach(() => {
  vi.clearAllMocks();
  cookieStore.get.mockReturnValue(undefined);
  vi.mocked(prisma.organization.findFirst).mockResolvedValue(null);
});

describe("isStaleHouseCoach", () => {
  it("is false for a client without any lookup", async () => {
    expect(await isStaleHouseCoach({ ...coach, role: "CLIENT" })).toBe(false);
    expect(prisma.organization.findFirst).not.toHaveBeenCalled();
  });

  it("is false for an ordinary trainer", async () => {
    expect(await isStaleHouseCoach(coach)).toBe(false);
    expect(prisma.organization.findFirst).toHaveBeenCalledWith({
      where: { houseCoachUserId: "coach1" },
      select: { id: true },
    });
  });

  it("is true for a house coach (DB) with no marker", async () => {
    vi.mocked(prisma.organization.findFirst).mockResolvedValue({ id: "o1" } as never);
    expect(await isStaleHouseCoach(coach)).toBe(true);
  });

  it("is true for a house coach (claim) with no marker, without a DB lookup", async () => {
    expect(await isStaleHouseCoach(coach, { publicMetadata: { houseCoach: true } })).toBe(true);
    expect(prisma.organization.findFirst).not.toHaveBeenCalled();
  });

  it("is false for a house coach whose marker is bound to them", async () => {
    vi.mocked(prisma.organization.findFirst).mockResolvedValue({ id: "o1" } as never);
    cookieStore.get.mockReturnValue({ name: CLUB_ADMIN_COOKIE, value: await markerFor("user_coach") });
    expect(await isStaleHouseCoach(coach)).toBe(false);
  });

  it("is true for a house coach whose marker names another Clerk user", async () => {
    vi.mocked(prisma.organization.findFirst).mockResolvedValue({ id: "o1" } as never);
    cookieStore.get.mockReturnValue({ name: CLUB_ADMIN_COOKIE, value: await markerFor("user_other") });
    expect(await isStaleHouseCoach(coach)).toBe(true);
  });
});

describe("activeCallerOnly", () => {
  it("refuses missing and deactivated users", async () => {
    expect(await activeCallerOnly(null)).toBeNull();
    expect(await activeCallerOnly({ ...coach, isActive: false })).toBeNull();
  });

  it("refuses a marker-less house coach", async () => {
    vi.mocked(prisma.organization.findFirst).mockResolvedValue({ id: "o1" } as never);
    expect(await activeCallerOnly(coach)).toBeNull();
  });

  it("returns an ordinary trainer and a client unchanged", async () => {
    expect(await activeCallerOnly(coach)).toBe(coach);
    const client = { ...coach, role: "CLIENT" };
    expect(await activeCallerOnly(client)).toBe(client);
  });
});
