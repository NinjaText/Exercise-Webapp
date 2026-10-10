import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

const authState: { userId: string; orgId: string | null; sessionClaims: unknown } = {
  userId: "user_coach",
  orgId: null,
  sessionClaims: undefined,
};
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(async () => authState) }));
const cookieStore = { get: vi.fn() };
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => cookieStore) }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`);
  }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: vi.fn(), update: vi.fn() }, organization: { findUnique: vi.fn(), findFirst: vi.fn() } },
}));

import { prisma } from "@/lib/prisma";
import { CLUB_ADMIN_COOKIE, signClubAdminMarker } from "@/lib/clubs/admin-session-token";
import { getCurrentUser } from "../current-user";

const coach = { id: "coach1", clerkId: "user_coach", role: "TRAINER", isActive: true, onboarded: true, clerkOrgId: "org_pine" };

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
  authState.userId = "user_coach";
  authState.sessionClaims = undefined;
  cookieStore.get.mockReturnValue(undefined);
  vi.mocked(prisma.user.findUnique).mockResolvedValue(coach as never);
  vi.mocked(prisma.organization.findFirst).mockResolvedValue(null);
});

describe("getCurrentUser house coach backstop", () => {
  it("bounces a house coach (claim) with no marker, without a DB lookup", async () => {
    authState.sessionClaims = { publicMetadata: { houseCoach: true } };
    await expect(getCurrentUser()).rejects.toThrow(/^REDIRECT:\/club-session\/ended$/);
    expect(prisma.organization.findFirst).not.toHaveBeenCalled();
  });

  it("bounces a house coach found only in the DB (claim missing) with no marker", async () => {
    vi.mocked(prisma.organization.findFirst).mockResolvedValue({ id: "o1" } as never);
    await expect(getCurrentUser()).rejects.toThrow(/^REDIRECT:\/club-session\/ended$/);
    expect(prisma.organization.findFirst).toHaveBeenCalledWith({
      where: { houseCoachUserId: "coach1" },
      select: { id: true },
    });
  });

  it("returns the house coach when the marker is valid for that coach", async () => {
    vi.mocked(prisma.organization.findFirst).mockResolvedValue({ id: "o1" } as never);
    cookieStore.get.mockReturnValue({ name: CLUB_ADMIN_COOKIE, value: await markerFor("user_coach") });
    await expect(getCurrentUser()).resolves.toMatchObject({ id: "coach1" });
  });

  it("bounces a house coach whose marker names another Clerk user", async () => {
    authState.sessionClaims = { publicMetadata: { houseCoach: true } };
    cookieStore.get.mockReturnValue({ name: CLUB_ADMIN_COOKIE, value: await markerFor("user_other") });
    await expect(getCurrentUser()).rejects.toThrow(/^REDIRECT:\/club-session\/ended$/);
  });

  it("leaves an ordinary trainer alone", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...coach, id: "t1", clerkId: "user_t" } as never);
    authState.userId = "user_t";
    await expect(getCurrentUser()).resolves.toMatchObject({ id: "t1" });
    expect(cookieStore.get).not.toHaveBeenCalled();
  });

  it("never checks house-coach status for a client", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...coach, id: "c1", role: "CLIENT" } as never);
    await expect(getCurrentUser()).resolves.toMatchObject({ id: "c1" });
    expect(prisma.organization.findFirst).not.toHaveBeenCalled();
  });
});
