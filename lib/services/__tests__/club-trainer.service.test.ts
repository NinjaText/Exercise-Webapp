import { describe, it, expect, vi, beforeEach } from "vitest";

const clerk = vi.hoisted(() => ({
  getOrganizationInvitationList: vi.fn(async () => ({ data: [] as any[] })),
  revokeOrganizationInvitation: vi.fn(async () => ({})),
  createOrganizationInvitation: vi.fn(async () => ({ id: "inv_new" })),
  deleteOrganizationMembership: vi.fn(async () => ({})),
  getUser: vi.fn(async () => ({
    id: "clerk_t", firstName: "Tia", lastName: "Coach", imageUrl: "img",
    primaryEmailAddressId: "e1", emailAddresses: [{ id: "e1", emailAddress: "Tia@Club.com" }],
  })),
  getUserMemberships: vi.fn(async () => ({ data: [] as any[] })),
}));

vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: vi.fn(async () => ({
    organizations: {
      getOrganizationInvitationList: clerk.getOrganizationInvitationList,
      revokeOrganizationInvitation: clerk.revokeOrganizationInvitation,
      createOrganizationInvitation: clerk.createOrganizationInvitation,
      deleteOrganizationMembership: clerk.deleteOrganizationMembership,
    },
    users: { getUser: clerk.getUser, getOrganizationMembershipList: clerk.getUserMemberships },
  })),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    organization: { findUnique: vi.fn() },
    program: { updateMany: vi.fn() },
    memberSubscription: { create: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  CLUB_TRAINER_INVITE_ROLE,
  getClubTrainer,
  inviteClubTrainer,
  getPendingTrainerInvite,
  removeClubTrainer,
  ensureClubTrainerUser,
  transferClubOwnership,
  resolveClubTrainerInvite,
  revokeRefusedTrainerMembership,
  hasClubTrainerInvite,
} from "../club-trainer.service";

const club = { clerkOrgId: "org_club", type: "CLUB", starterProgramIds: ["s1", "s2"] } as any;
const trainerOrg = { clerkOrgId: "org_t", type: null, starterProgramIds: [] } as any;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_APP_URL = "https://app.test";
  vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
  vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
  vi.mocked(prisma.user.findMany).mockResolvedValue([]);
  vi.mocked(prisma.organization.findUnique).mockResolvedValue(club);
  vi.mocked(prisma.program.updateMany).mockResolvedValue({ count: 0 });
  vi.mocked(prisma.user.create).mockImplementation((async ({ data }: any) => ({ id: "t1", ...data })) as any);
});

describe("getClubTrainer", () => {
  it("returns the org's TRAINER, onboarded first then newest", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: "t1" } as any);
    expect(await getClubTrainer("org_club")).toEqual({ id: "t1" });
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { clerkOrgId: "org_club", role: "TRAINER" },
      orderBy: [{ onboarded: "desc" }, { createdAt: "desc" }],
    });
  });
  it("returns null when the club has no trainer yet", async () => {
    expect(await getClubTrainer("org_club")).toBeNull();
  });
});

describe("inviteClubTrainer", () => {
  it("revokes pending trainer invites and sends an org:admin invite with invitedRole TRAINER", async () => {
    clerk.getOrganizationInvitationList.mockResolvedValueOnce({
      data: [
        { id: "inv_old", emailAddress: "old@club.com", publicMetadata: { invitedRole: "TRAINER" } },
        { id: "inv_client", emailAddress: "c@club.com", publicMetadata: {} },
      ],
    });
    await inviteClubTrainer("org_club", " Tia@Club.com ");
    expect(clerk.getOrganizationInvitationList).toHaveBeenCalledWith({
      organizationId: "org_club", status: ["pending"], limit: 100,
    });
    expect(clerk.revokeOrganizationInvitation).toHaveBeenCalledTimes(1);
    expect(clerk.revokeOrganizationInvitation).toHaveBeenCalledWith({ organizationId: "org_club", invitationId: "inv_old" });
    expect(clerk.createOrganizationInvitation).toHaveBeenCalledWith({
      organizationId: "org_club",
      emailAddress: "tia@club.com",
      role: "org:admin",
      publicMetadata: { invitedRole: CLUB_TRAINER_INVITE_ROLE },
      redirectUrl: "https://app.test/onboarding/club-trainer",
    });
  });

  it("refuses an email that already belongs to an app user before touching Clerk", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: "someone" } as any);
    await expect(inviteClubTrainer("org_club", "tia@club.com")).rejects.toMatchObject({ code: "trainer_email_taken" });
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { email: { equals: "tia@club.com", mode: "insensitive" } },
      select: { id: true },
    });
    expect(clerk.getOrganizationInvitationList).not.toHaveBeenCalled();
    expect(clerk.createOrganizationInvitation).not.toHaveBeenCalled();
  });

  it("refuses a malformed email", async () => {
    await expect(inviteClubTrainer("org_club", "not-an-email")).rejects.toMatchObject({ code: "invalid_input" });
    expect(clerk.createOrganizationInvitation).not.toHaveBeenCalled();
  });

  it("wraps a Clerk failure in trainer_invite_failed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    clerk.createOrganizationInvitation.mockRejectedValueOnce(new Error("clerk down"));
    await expect(inviteClubTrainer("org_club", "tia@club.com")).rejects.toMatchObject({ code: "trainer_invite_failed" });
  });
});

describe("getPendingTrainerInvite", () => {
  it("returns the newest pending TRAINER invite", async () => {
    clerk.getOrganizationInvitationList.mockResolvedValueOnce({
      data: [
        { emailAddress: "c@club.com", createdAt: 300, publicMetadata: {} },
        { emailAddress: "a@club.com", createdAt: 100, publicMetadata: { invitedRole: "TRAINER" } },
        { emailAddress: "b@club.com", createdAt: 200, publicMetadata: { invitedRole: "TRAINER" } },
      ],
    });
    expect(await getPendingTrainerInvite("org_club")).toEqual({ email: "b@club.com", createdAt: new Date(200) });
  });
  it("returns null without one", async () => {
    expect(await getPendingTrainerInvite("org_club")).toBeNull();
  });
});

describe("removeClubTrainer", () => {
  it("deletes the trainer's Clerk membership and detaches their row", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: "t1", clerkId: "clerk_t" } as any);
    await removeClubTrainer("org_club");
    expect(clerk.deleteOrganizationMembership).toHaveBeenCalledWith({ organizationId: "org_club", userId: "clerk_t" });
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "t1" }, data: { clerkOrgId: null, isActive: false } });
  });
  it("throws a ClubError when the DB update fails after the Clerk delete", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: "t1", clerkId: "clerk_t" } as any);
    vi.mocked(prisma.user.update).mockRejectedValueOnce(new Error("db down"));
    await expect(removeClubTrainer("org_club")).rejects.toMatchObject({ code: "trainer_remove_failed" });
    expect(clerk.deleteOrganizationMembership).toHaveBeenCalled();
  });
  it("is a no-op with no trainer", async () => {
    await removeClubTrainer("org_club");
    expect(clerk.deleteOrganizationMembership).not.toHaveBeenCalled();
  });
});

describe("transferClubOwnership", () => {
  it("moves member programs and the previous trainer's starter templates to the new trainer", async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: "m1" }, { id: "m2" }] as any);
    vi.mocked(prisma.program.updateMany)
      .mockResolvedValueOnce({ count: 3 })
      .mockResolvedValueOnce({ count: 1 });

    expect(await transferClubOwnership("org_club", "t2")).toEqual({ programs: 3, templates: 1 });

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { clerkOrgId: "org_club", role: "CLIENT" },
      select: { id: true },
    });
    expect(prisma.program.updateMany).toHaveBeenNthCalledWith(1, {
      where: { clientId: { in: ["m1", "m2"] }, NOT: { trainerId: "t2" } },
      data: { trainerId: "t2" },
    });
    expect(prisma.program.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: { in: ["s1", "s2"] },
        isTemplate: true,
        isGlobal: false,
        trainerId: { not: null },
        NOT: { trainerId: "t2" },
      },
      data: { trainerId: "t2" },
    });
  });

  it("skips the member update when the club has no members", async () => {
    vi.mocked(prisma.program.updateMany).mockResolvedValueOnce({ count: 0 });
    expect(await transferClubOwnership("org_club", "t2")).toEqual({ programs: 0, templates: 0 });
    expect(prisma.program.updateMany).toHaveBeenCalledTimes(1);
  });

  it("does nothing for an unknown org", async () => {
    vi.mocked(prisma.organization.findUnique).mockResolvedValue(null);
    expect(await transferClubOwnership("org_x", "t2")).toEqual({ programs: 0, templates: 0 });
    expect(prisma.program.updateMany).not.toHaveBeenCalled();
  });
});

describe("ensureClubTrainerUser", () => {
  it("creates a TRAINER (not onboarded, no member subscription) and transfers ownership", async () => {
    const user = await ensureClubTrainerUser("clerk_t", club);
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: {
        clerkId: "clerk_t",
        email: "tia@club.com",
        firstName: "Tia",
        lastName: "Coach",
        imageUrl: "img",
        role: "TRAINER",
        clerkOrgId: "org_club",
        onboarded: false,
      },
    });
    expect(user.role).toBe("TRAINER");
    expect(prisma.memberSubscription.create).not.toHaveBeenCalled();
    // transferClubOwnership ran for the new trainer
    expect(prisma.organization.findUnique).toHaveBeenCalledWith({ where: { clerkOrgId: "org_club" } });
    expect(prisma.program.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { trainerId: "t1" } }));
  });

  it("is idempotent for the same club trainer", async () => {
    const existing = { id: "t1", role: "TRAINER", clerkOrgId: "org_club" };
    vi.mocked(prisma.user.findUnique).mockResolvedValue(existing as any);
    expect(await ensureClubTrainerUser("clerk_t", club)).toBe(existing);
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("re-runs the ownership transfer on the reuse path (repairs a crash after create)", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "t1", role: "TRAINER", clerkOrgId: "org_club" } as any);
    await ensureClubTrainerUser("clerk_t", club);
    expect(prisma.program.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { trainerId: "t1" } }));
  });

  it.each([
    ["a trainer of another org", { role: "TRAINER", clerkOrgId: "org_other" }],
    ["a trainer with no org", { role: "TRAINER", clerkOrgId: null }],
    ["a client of this club", { role: "CLIENT", clerkOrgId: "org_club" }],
    ["a client elsewhere", { role: "CLIENT", clerkOrgId: "org_other" }],
  ])("never moves %s", async (_l, row) => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "x", ...row } as any);
    await expect(ensureClubTrainerUser("clerk_t", club)).rejects.toMatchObject({ code: "trainer_email_taken" });
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.program.updateMany).not.toHaveBeenCalled();
  });

  it("refuses when the email already belongs to another app user", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: "other" } as any);
    await expect(ensureClubTrainerUser("clerk_t", club)).rejects.toMatchObject({ code: "trainer_email_taken" });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("recovers from a concurrent create of the same club trainer", async () => {
    const raced = { id: "t1", role: "TRAINER", clerkOrgId: "org_club" };
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null).mockResolvedValueOnce(raced as any);
    vi.mocked(prisma.user.create).mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "P2002" }));
    expect(await ensureClubTrainerUser("clerk_t", club)).toBe(raced);
  });

  it("refuses a trainer org", async () => {
    await expect(ensureClubTrainerUser("clerk_t", trainerOrg)).rejects.toMatchObject({ code: "not_found" });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
});

describe("resolveClubTrainerInvite", () => {
  it("finds the club whose accepted invite for this email is a TRAINER invite", async () => {
    clerk.getUserMemberships.mockResolvedValueOnce({ data: [{ organization: { id: "org_club" }, publicMetadata: {} }] });
    clerk.getOrganizationInvitationList.mockResolvedValueOnce({
      data: [{ emailAddress: "tia@club.com", publicMetadata: { invitedRole: "TRAINER" } }],
    });
    expect(await resolveClubTrainerInvite("clerk_t")).toBe(club);
    expect(clerk.getOrganizationInvitationList).toHaveBeenCalledWith({
      organizationId: "org_club", status: ["accepted"], limit: 100,
    });
  });

  it("ignores trainer orgs and client invitations", async () => {
    clerk.getUserMemberships.mockResolvedValueOnce({
      data: [{ organization: { id: "org_t" }, publicMetadata: { invitedRole: "TRAINER" } }, { organization: { id: "org_club" }, publicMetadata: {} }],
    });
    vi.mocked(prisma.organization.findUnique).mockImplementation((async ({ where }: any) =>
      where.clerkOrgId === "org_t" ? trainerOrg : club) as any);
    clerk.getOrganizationInvitationList.mockResolvedValueOnce({
      data: [{ emailAddress: "tia@club.com", publicMetadata: {} }],
    });
    expect(await resolveClubTrainerInvite("clerk_t")).toBeNull();
  });
});

describe("revokeRefusedTrainerMembership", () => {
  it("deletes the Clerk membership of a refused account", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ clerkOrgId: "org_other" } as any);
    await revokeRefusedTrainerMembership("clerk_x", "org_club");
    expect(clerk.deleteOrganizationMembership).toHaveBeenCalledWith({ organizationId: "org_club", userId: "clerk_x" });
  });
  it("never removes someone whose row already belongs to this org", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ clerkOrgId: "org_club" } as any);
    await revokeRefusedTrainerMembership("clerk_x", "org_club");
    expect(clerk.deleteOrganizationMembership).not.toHaveBeenCalled();
  });
  it("swallows a Clerk failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    clerk.deleteOrganizationMembership.mockRejectedValueOnce(new Error("clerk down"));
    await expect(revokeRefusedTrainerMembership("clerk_x", "org_club")).resolves.toBeUndefined();
  });
});

describe("hasClubTrainerInvite", () => {
  it("is true for a pending or accepted TRAINER invite to this email in a club", async () => {
    clerk.getOrganizationInvitationList.mockResolvedValueOnce({
      data: [{ emailAddress: "tia@club.com", publicMetadata: { invitedRole: "TRAINER" } }],
    });
    expect(await hasClubTrainerInvite("clerk_t", "org_club")).toBe(true);
    expect(clerk.getOrganizationInvitationList).toHaveBeenCalledWith({
      organizationId: "org_club", status: ["pending", "accepted"], limit: 100,
    });
  });
  it("is false for a client invite", async () => {
    clerk.getOrganizationInvitationList.mockResolvedValueOnce({
      data: [{ emailAddress: "tia@club.com", publicMetadata: {} }],
    });
    expect(await hasClubTrainerInvite("clerk_t", "org_club")).toBe(false);
  });
  it("is false for a trainer org without asking Clerk", async () => {
    vi.mocked(prisma.organization.findUnique).mockResolvedValue(trainerOrg);
    expect(await hasClubTrainerInvite("clerk_t", "org_t")).toBe(false);
    expect(clerk.getOrganizationInvitationList).not.toHaveBeenCalled();
  });
});
