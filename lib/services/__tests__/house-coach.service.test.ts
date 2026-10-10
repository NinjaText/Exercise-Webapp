import { describe, it, expect, vi, beforeEach } from "vitest";

const clerk = vi.hoisted(() => ({
  getUserList: vi.fn(async (_p?: any) => ({ data: [] as any[] })),
  createUser: vi.fn(async (_p?: any) => ({ id: "clerk_hc", imageUrl: "https://img/default" })),
  updateUser: vi.fn(async (..._a: any[]) => ({})),
  updateUserProfileImage: vi.fn(async (..._a: any[]) => ({})),
  createOrganizationMembership: vi.fn(async (_p?: any) => ({})),
}));

vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: vi.fn(async () => ({
    users: {
      getUserList: clerk.getUserList,
      createUser: clerk.createUser,
      updateUser: clerk.updateUser,
      updateUserProfileImage: clerk.updateUserProfileImage,
    },
    organizations: { createOrganizationMembership: clerk.createOrganizationMembership },
  })),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
    organization: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  HOUSE_COACH_FIRST_NAME,
  houseCoachEmail,
  ensureHouseCoach,
  getHouseCoach,
  requireHouseCoach,
  isHouseCoach,
  syncHouseCoachProfile,
} from "../house-coach.service";

const club = { id: "o1", clerkOrgId: "org_club", name: "Iron Club", type: "CLUB", houseCoachUserId: null } as any;
const trainerOrg = { id: "o2", clerkOrgId: "org_t", name: "T", type: null, houseCoachUserId: null } as any;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.RESEND_FROM_EMAIL = "Athos <hello@useathos.ai>";
  vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
  vi.mocked(prisma.user.upsert).mockImplementation((async ({ create }: any) => ({ id: "u_hc", ...create })) as any);
  vi.mocked(prisma.user.update).mockResolvedValue({} as any);
  vi.mocked(prisma.organization.findUnique).mockResolvedValue(club);
  vi.mocked(prisma.organization.update).mockResolvedValue({} as any);
});

describe("houseCoachEmail", () => {
  it("lowercases the org id and uses the sender domain", () => {
    expect(houseCoachEmail("org_ABC")).toBe("house-coach+org_abc@useathos.ai");
  });
  it("handles a bare address and the default sender", () => {
    process.env.RESEND_FROM_EMAIL = "x@mail.test";
    expect(houseCoachEmail("org_1")).toBe("house-coach+org_1@mail.test");
    delete process.env.RESEND_FROM_EMAIL;
    expect(houseCoachEmail("org_1")).toMatch(/^house-coach\+org_1@.+\..+/);
  });
});

describe("ensureHouseCoach", () => {
  it("returns the linked user without calling Clerk", async () => {
    const existing = { id: "u_old" };
    vi.mocked(prisma.user.findUnique).mockResolvedValue(existing as any);
    const out = await ensureHouseCoach({ ...club, houseCoachUserId: "u_old" });
    expect(out).toBe(existing);
    expect(clerk.getUserList).not.toHaveBeenCalled();
    expect(clerk.createUser).not.toHaveBeenCalled();
  });

  it("creates the Clerk user, DB user, membership and link for a fresh club", async () => {
    const out = await ensureHouseCoach(club);
    expect(clerk.createUser).toHaveBeenCalledTimes(1);
    const args = clerk.createUser.mock.calls[0][0];
    expect(args.externalId).toBe("house-coach:org_club");
    expect(args.publicMetadata.houseCoach).toBe(true);
    expect(args.firstName).toBe(HOUSE_COACH_FIRST_NAME);
    const upsert = vi.mocked(prisma.user.upsert).mock.calls[0][0] as any;
    expect(upsert.create).toMatchObject({ role: "TRAINER", onboarded: true, clerkOrgId: "org_club", clerkId: "clerk_hc" });
    expect(clerk.createOrganizationMembership).toHaveBeenCalledWith({
      organizationId: "org_club", userId: "clerk_hc", role: "org:admin",
    });
    expect(prisma.organization.update).toHaveBeenCalledWith({ where: { id: "o1" }, data: { houseCoachUserId: "u_hc" } });
    expect(out.id).toBe("u_hc");
  });

  it("reuses a Clerk user left by a crashed attempt", async () => {
    clerk.getUserList.mockResolvedValueOnce({ data: [{ id: "clerk_prev", imageUrl: "i" }] });
    await ensureHouseCoach(club);
    expect(clerk.getUserList).toHaveBeenCalledWith({ externalId: ["house-coach:org_club"], limit: 1 });
    expect(clerk.createUser).not.toHaveBeenCalled();
    expect((vi.mocked(prisma.user.upsert).mock.calls[0][0] as any).where).toEqual({ clerkId: "clerk_prev" });
    expect(clerk.createOrganizationMembership).toHaveBeenCalled();
    expect(prisma.organization.update).toHaveBeenCalled();
  });

  it("tolerates an existing membership", async () => {
    clerk.createOrganizationMembership.mockRejectedValueOnce({ errors: [{ code: "already_a_member_in_organization" }] });
    await expect(ensureHouseCoach(club)).resolves.toMatchObject({ id: "u_hc" });
    expect(prisma.organization.update).toHaveBeenCalled();
  });

  it("rethrows other membership errors", async () => {
    clerk.createOrganizationMembership.mockRejectedValueOnce(new Error("boom"));
    await expect(ensureHouseCoach(club)).rejects.toThrow("boom");
    expect(prisma.organization.update).not.toHaveBeenCalled();
  });

  it("rejects non-club orgs with not_found", async () => {
    await expect(ensureHouseCoach(trainerOrg)).rejects.toMatchObject({ name: "ClubError", code: "not_found" });
  });
});

describe("getHouseCoach / requireHouseCoach", () => {
  it("returns null for a trainer org", async () => {
    vi.mocked(prisma.organization.findUnique).mockResolvedValue(trainerOrg);
    expect(await getHouseCoach("org_t")).toBeNull();
  });
  it("returns the linked user for a club", async () => {
    vi.mocked(prisma.organization.findUnique).mockResolvedValue({ ...club, houseCoachUserId: "u1" });
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "u1" } as any);
    expect((await getHouseCoach("org_club"))?.id).toBe("u1");
  });
  it("requireHouseCoach ensures one for a club and throws for a non-club", async () => {
    expect((await requireHouseCoach("org_club")).id).toBe("u_hc");
    vi.mocked(prisma.organization.findUnique).mockResolvedValue(trainerOrg);
    await expect(requireHouseCoach("org_t")).rejects.toMatchObject({ code: "not_found" });
    vi.mocked(prisma.organization.findUnique).mockResolvedValue(null);
    await expect(requireHouseCoach("org_x")).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("isHouseCoach", () => {
  it("is true only when the org's houseCoachUserId matches", async () => {
    const org = { ...club, houseCoachUserId: "u1" };
    expect(await isHouseCoach({ id: "u1", clerkOrgId: "org_club" }, org)).toBe(true);
    expect(await isHouseCoach({ id: "u2", clerkOrgId: "org_club" }, org)).toBe(false);
  });
  it("loads the org by clerkOrgId when not given", async () => {
    vi.mocked(prisma.organization.findUnique).mockResolvedValue({ ...club, houseCoachUserId: "u1" });
    expect(await isHouseCoach({ id: "u1", clerkOrgId: "org_club" })).toBe(true);
    expect(await isHouseCoach({ id: "u1", clerkOrgId: null })).toBe(false);
  });
});

describe("syncHouseCoachProfile", () => {
  it("sets names in Clerk and DB, and the DB logo", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "u_hc", clerkId: "clerk_hc" } as any);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
    await syncHouseCoachProfile({ ...club, houseCoachUserId: "u_hc", brandLogoOnLightUrl: "https://r2/logo.png" });
    expect(clerk.updateUser).toHaveBeenCalledWith("clerk_hc", { firstName: "Coach", lastName: "Iron Club" });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "u_hc" },
      data: { firstName: "Coach", lastName: "Iron Club", imageUrl: "https://r2/logo.png" },
    });
    vi.unstubAllGlobals();
  });
  it("is a no-op without a house coach", async () => {
    await syncHouseCoachProfile(club);
    expect(clerk.updateUser).not.toHaveBeenCalled();
  });
});
