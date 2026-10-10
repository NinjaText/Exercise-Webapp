import { describe, it, expect, vi, beforeEach } from "vitest";

const calls: string[] = [];
const m = vi.hoisted(() => ({
  prisma: {
    organization: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
    checkInTemplate: { updateMany: vi.fn(), count: vi.fn() },
    checkInAssignment: { updateMany: vi.fn(), count: vi.fn() },
    message: { updateMany: vi.fn(), count: vi.fn() },
    program: { updateMany: vi.fn(), count: vi.fn() },
    clinicalNote: { updateMany: vi.fn(), count: vi.fn() },
    pendingProgramAssignment: { updateMany: vi.fn(), count: vi.fn() },
    habitDefinition: { updateMany: vi.fn(), count: vi.fn() },
    collection: { findMany: vi.fn(), update: vi.fn(), count: vi.fn() },
  },
  ensureHouseCoach: vi.fn(),
  transferClubOwnership: vi.fn(),
  removeOrgTrainer: vi.fn(),
  getInvites: vi.fn(),
  revoke: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: m.prisma }));
vi.mock("@/lib/services/house-coach.service", () => ({ ensureHouseCoach: m.ensureHouseCoach }));
vi.mock("@/lib/services/club-ownership.service", () => ({
  transferClubOwnership: m.transferClubOwnership,
  removeOrgTrainer: m.removeOrgTrainer,
}));
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: async () => ({
    organizations: { getOrganizationInvitationList: m.getInvites, revokeOrganizationInvitation: m.revoke },
  }),
}));

import { migrateClubTrainers } from "../migrate-club-trainers";

const org = { id: "o1", clerkOrgId: "org_1", name: "Club", type: "CLUB", houseCoachUserId: null };
const coach = { id: "hc", clerkId: "clerk_hc" };
const old = { id: "t1", clerkId: "clerk_t1", firstName: "Tom", lastName: "Old", email: "tom@x.test" };

function track(name: string, fn: ReturnType<typeof vi.fn>, result: unknown) {
  fn.mockImplementation(async () => {
    calls.push(name);
    return result;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  m.prisma.organization.findMany.mockResolvedValue([org]);
  m.prisma.user.findMany.mockResolvedValue([old]);
  m.ensureHouseCoach.mockResolvedValue(coach);
  track("transfer", m.transferClubOwnership, { programs: 3, templates: 1 });
  track("tpl", m.prisma.checkInTemplate.updateMany, { count: 2 });
  track("asg", m.prisma.checkInAssignment.updateMany, { count: 4 });
  track("sent", m.prisma.message.updateMany, { count: 5 });
  track("programs", m.prisma.program.updateMany, { count: 7 });
  track("notes", m.prisma.clinicalNote.updateMany, { count: 2 });
  track("pending", m.prisma.pendingProgramAssignment.updateMany, { count: 1 });
  track("habits", m.prisma.habitDefinition.updateMany, { count: 3 });
  m.prisma.collection.findMany.mockImplementation(async (args: { where: { trainerId: string } }) => {
    calls.push("collections");
    return args.where.trainerId === "t1"
      ? [
          { id: "c1", name: "Rehab" },
          { id: "c2", name: "Strength" },
        ]
      : [{ name: "Rehab" }];
  });
  track("collection", m.prisma.collection.update, {});
  track("remove", m.removeOrgTrainer, undefined);
  m.prisma.program.count.mockResolvedValue(7);
  m.prisma.clinicalNote.count.mockResolvedValue(2);
  m.prisma.pendingProgramAssignment.count.mockResolvedValue(1);
  m.prisma.habitDefinition.count.mockResolvedValue(3);
  m.prisma.collection.count.mockResolvedValue(2);
  m.prisma.checkInTemplate.count.mockResolvedValue(2);
  m.prisma.checkInAssignment.count.mockResolvedValue(4);
  m.prisma.message.count.mockResolvedValue(5);
  m.getInvites.mockResolvedValue({
    data: [
      { id: "i1", publicMetadata: { invitedRole: "TRAINER" } },
      { id: "i2", publicMetadata: { invitedRole: "CLIENT" } },
    ],
    totalCount: 2,
  });
  track("revoke", m.revoke, undefined);
});

describe("migrateClubTrainers", () => {
  it("dry run writes nothing and reports counts", async () => {
    const report = await migrateClubTrainers({ apply: false });

    expect(m.ensureHouseCoach).not.toHaveBeenCalled();
    expect(m.transferClubOwnership).not.toHaveBeenCalled();
    expect(m.prisma.message.updateMany).not.toHaveBeenCalled();
    for (const model of ["program", "clinicalNote", "pendingProgramAssignment", "habitDefinition"] as const) {
      expect(m.prisma[model].updateMany).not.toHaveBeenCalled();
    }
    expect(m.prisma.collection.update).not.toHaveBeenCalled();
    expect(m.removeOrgTrainer).not.toHaveBeenCalled();
    expect(m.revoke).not.toHaveBeenCalled();
    expect(report.failed).toBe(0);
    expect(report.clubs[0]).toMatchObject({
      clerkOrgId: "org_1",
      houseCoach: "would create",
      oldTrainers: 1,
      checkInRows: 6,
      messages: 10,
      ownedPrograms: 7,
      clinicalNotes: 2,
      pendingAssignments: 1,
      collections: 2,
      habits: 3,
      invitationsRevoked: 1,
    });
    expect(m.prisma.program.count).toHaveBeenCalledWith({ where: { trainerId: "t1" } });
  });

  it("apply runs the steps in order and revokes only trainer invitations", async () => {
    const report = await migrateClubTrainers({ apply: true });

    expect(calls).toEqual([
      "revoke",
      "transfer",
      "tpl",
      "asg",
      "sent",
      "sent",
      "programs",
      "notes",
      "pending",
      "habits",
      "collections",
      "collections",
      "collection",
      "collection",
      "remove",
    ]);
    const toHouse = { where: { trainerId: "t1" }, data: { trainerId: "hc" } };
    for (const model of ["program", "clinicalNote", "pendingProgramAssignment", "habitDefinition"] as const) {
      expect(m.prisma[model].updateMany).toHaveBeenCalledWith(toHouse);
    }
    // A name clash with the house coach's own collection is renamed, not merged.
    expect(m.prisma.collection.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { trainerId: "hc", name: "Rehab (Tom Old)" },
    });
    expect(m.prisma.collection.update).toHaveBeenCalledWith({
      where: { id: "c2" },
      data: { trainerId: "hc", name: "Strength" },
    });
    expect(m.transferClubOwnership).toHaveBeenCalledWith("org_1", "hc");
    expect(m.prisma.message.updateMany).toHaveBeenCalledWith({ where: { senderId: "t1" }, data: { senderId: "hc" } });
    expect(m.prisma.message.updateMany).toHaveBeenCalledWith({
      where: { recipientId: "t1" },
      data: { recipientId: "hc" },
    });
    expect(m.removeOrgTrainer).toHaveBeenCalledWith("org_1", old);
    expect(m.revoke).toHaveBeenCalledTimes(1);
    expect(m.revoke).toHaveBeenCalledWith({ organizationId: "org_1", invitationId: "i1" });
    expect(report.clubs[0]).toMatchObject({
      programsTransferred: 3,
      templatesTransferred: 1,
      checkInRows: 6,
      messages: 10,
      ownedPrograms: 7,
      clinicalNotes: 2,
      pendingAssignments: 1,
      collections: 2,
      habits: 3,
      trainersRemoved: 1,
      invitationsRevoked: 1,
    });
  });

  it("second apply with no old trainers or invitations changes nothing", async () => {
    m.prisma.user.findMany.mockResolvedValue([]);
    m.getInvites.mockResolvedValue({ data: [], totalCount: 0 });
    const report = await migrateClubTrainers({ apply: true });

    expect(m.transferClubOwnership).not.toHaveBeenCalled();
    expect(m.removeOrgTrainer).not.toHaveBeenCalled();
    expect(m.revoke).not.toHaveBeenCalled();
    expect(report.clubs[0]).toMatchObject({
      oldTrainers: 0,
      programsTransferred: 0,
      messages: 0,
      trainersRemoved: 0,
      invitationsRevoked: 0,
    });
  });

  it("paginates pending invitations and revokes trainer invites from every page", async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({ id: `a${i}`, publicMetadata: { invitedRole: "TRAINER" } }));
    const page2 = [{ id: "b1", publicMetadata: { invitedRole: "TRAINER" } }];
    m.getInvites
      .mockResolvedValueOnce({ data: page1, totalCount: 101 })
      .mockResolvedValueOnce({ data: page2, totalCount: 101 });
    const report = await migrateClubTrainers({ apply: true });

    expect(m.getInvites).toHaveBeenNthCalledWith(2, expect.objectContaining({ limit: 100, offset: 100 }));
    expect(m.revoke).toHaveBeenCalledTimes(101);
    expect(m.revoke).toHaveBeenCalledWith({ organizationId: "org_1", invitationId: "b1" });
    expect(report.clubs[0].invitationsRevoked).toBe(101);
  });

  it("one club failing is recorded and the rest continue", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    m.prisma.organization.findMany.mockResolvedValue([org, { ...org, clerkOrgId: "org_2", name: "Two" }]);
    m.ensureHouseCoach.mockRejectedValueOnce(new Error("clerk down"));
    const report = await migrateClubTrainers({ apply: true });

    expect(report.failed).toBe(1);
    expect(report.clubs[0].error).toBe("clerk down");
    expect(report.clubs[1].error).toBeUndefined();
    expect(report.clubs[1].trainersRemoved).toBe(1);
  });
});
