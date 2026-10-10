import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

const cookieStore = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => cookieStore) }));
vi.mock("@/lib/current-user", () => ({ requireSuperAdmin: vi.fn() }));
vi.mock("@/lib/services/audit-log.service", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/services/house-coach.service", () => ({ ensureHouseCoach: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    organization: { findUnique: vi.fn() },
    adminClubSession: { create: vi.fn(), updateMany: vi.fn() },
  },
}));
const createSignInToken = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: vi.fn(async () => ({ signInTokens: { createSignInToken } })),
}));

import { prisma } from "@/lib/prisma";
import { clerkClient } from "@clerk/nextjs/server";
import { requireSuperAdmin } from "@/lib/current-user";
import { logAudit } from "@/lib/services/audit-log.service";
import { ensureHouseCoach } from "@/lib/services/house-coach.service";
import { CLUB_ADMIN_COOKIE, signClubAdminMarker, verifyClubAdminMarker } from "@/lib/clubs/admin-session-token";
import { enterClubAction, exitClubAction } from "../admin-club-session-actions";

const admin = { id: "admin1", firstName: "Ada", lastName: "Admin", email: "ada@x.com", role: "TRAINER", clerkOrgId: null };
const club = { id: "o1", clerkOrgId: "org_pine", name: "Pine", type: "CLUB" };
const coach = { id: "coach1", clerkId: "user_coach", clerkOrgId: "org_pine" };
const EIGHT_HOURS = 8 * 60 * 60 * 1000;

beforeAll(() => {
  process.env.CLERK_SECRET_KEY ??= "sk_test_0123456789abcdefghijklmnop";
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireSuperAdmin).mockResolvedValue(admin as never);
  vi.mocked(prisma.organization.findUnique).mockResolvedValue(club as never);
  vi.mocked(ensureHouseCoach).mockResolvedValue(coach as never);
  vi.mocked(prisma.adminClubSession.create).mockResolvedValue({ id: "sess1" } as never);
  vi.mocked(prisma.adminClubSession.updateMany).mockResolvedValue({ count: 1 } as never);
  createSignInToken.mockResolvedValue({ token: "tok/+=" });
});

describe("enterClubAction", () => {
  it("does nothing when the caller is not a super admin", async () => {
    vi.mocked(requireSuperAdmin).mockRejectedValueOnce(new Error("NEXT_REDIRECT"));
    await expect(enterClubAction("org_pine")).rejects.toThrow("NEXT_REDIRECT");
    expect(prisma.organization.findUnique).not.toHaveBeenCalled();
    expect(prisma.adminClubSession.create).not.toHaveBeenCalled();
    expect(clerkClient).not.toHaveBeenCalled();
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("refuses an org that is not a club", async () => {
    vi.mocked(prisma.organization.findUnique).mockResolvedValueOnce({ ...club, type: "TRAINER" } as never);
    expect(await enterClubAction("org_pine")).toEqual({ ok: false, error: expect.any(String) });
    expect(ensureHouseCoach).not.toHaveBeenCalled();
    expect(createSignInToken).not.toHaveBeenCalled();
  });

  it("refuses an unknown org", async () => {
    vi.mocked(prisma.organization.findUnique).mockResolvedValueOnce(null);
    expect(await enterClubAction("org_nope")).toEqual({ ok: false, error: expect.any(String) });
    expect(createSignInToken).not.toHaveBeenCalled();
  });

  it("opens a session, sets the marker cookie and returns a ticket url", async () => {
    const before = Date.now();
    const res = await enterClubAction("org_pine");
    const after = Date.now();

    expect(res).toEqual({ ok: true, url: "/club-session/enter?ticket=" + encodeURIComponent("tok/+=") });

    const data = vi.mocked(prisma.adminClubSession.create).mock.calls[0][0].data;
    expect(data).toMatchObject({
      adminUserId: "admin1",
      clerkOrgId: "org_pine",
      houseCoachUserId: "coach1",
      endedAt: null,
    });
    const expiresAt = (data.expiresAt as Date).getTime();
    expect(expiresAt).toBeGreaterThanOrEqual(before + EIGHT_HOURS);
    expect(expiresAt).toBeLessThanOrEqual(after + EIGHT_HOURS);

    expect(cookieStore.set).toHaveBeenCalledTimes(1);
    const [name, value, options] = cookieStore.set.mock.calls[0];
    expect(name).toBe(CLUB_ADMIN_COOKIE);
    expect(options).toEqual({
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 8 * 60 * 60,
    });
    const marker = await verifyClubAdminMarker(value);
    expect(marker).toEqual({
      sid: "sess1",
      adminUserId: "admin1",
      adminName: "Ada Admin",
      clerkOrgId: "org_pine",
      houseCoachClerkId: "user_coach",
      exp: expiresAt,
    });

    expect(createSignInToken).toHaveBeenCalledWith({ userId: "user_coach", expiresInSeconds: 60 });

    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "CLUB_SESSION_STARTED",
        actorId: "admin1",
        actorType: "SUPER_ADMIN",
        actorName: "Ada Admin",
        orgId: "org_pine",
      }),
    );
  });

  it("leaves no session row, cookie or audit when the sign-in token cannot be created", async () => {
    createSignInToken.mockRejectedValueOnce(new Error("clerk down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await enterClubAction("org_pine")).toEqual({ ok: false, error: expect.any(String) });
    expect(prisma.adminClubSession.create).not.toHaveBeenCalled();
    expect(cookieStore.set).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("exitClubAction", () => {
  it("ends the session row, deletes the cookie and audits", async () => {
    const value = await signClubAdminMarker({
      sid: "sess1",
      adminUserId: "admin1",
      adminName: "Ada Admin",
      clerkOrgId: "org_pine",
      houseCoachClerkId: "user_coach",
      exp: Date.now() + 60_000,
    });
    cookieStore.get.mockReturnValue({ name: CLUB_ADMIN_COOKIE, value });

    await exitClubAction();

    const call = vi.mocked(prisma.adminClubSession.updateMany).mock.calls[0][0];
    expect(call.where).toMatchObject({ id: "sess1" });
    expect(call.data.endedAt).toBeInstanceOf(Date);
    expect(cookieStore.delete).toHaveBeenCalledWith(CLUB_ADMIN_COOKIE);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "CLUB_SESSION_ENDED",
        actorId: "admin1",
        actorType: "SUPER_ADMIN",
        orgId: "org_pine",
      }),
    );
  });

  it("still clears the cookie when there is no valid marker", async () => {
    cookieStore.get.mockReturnValue(undefined);
    await exitClubAction();
    expect(prisma.adminClubSession.updateMany).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
    expect(cookieStore.delete).toHaveBeenCalledWith(CLUB_ADMIN_COOKIE);
  });
});
