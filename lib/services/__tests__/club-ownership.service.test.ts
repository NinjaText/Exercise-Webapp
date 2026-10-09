import { describe, it, expect, vi, beforeEach } from "vitest";

const clerk = vi.hoisted(() => ({
  deleteOrganizationMembership: vi.fn(async () => ({})),
}));

vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: vi.fn(async () => ({
    organizations: { deleteOrganizationMembership: clerk.deleteOrganizationMembership },
  })),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findMany: vi.fn(), update: vi.fn() },
    organization: { findUnique: vi.fn() },
    program: { updateMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { removeOrgTrainer, transferClubOwnership } from "../club-ownership.service";

const club = { clerkOrgId: "org_club", type: "CLUB", starterProgramIds: ["s1", "s2"] } as any;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.user.findMany).mockResolvedValue([]);
  vi.mocked(prisma.organization.findUnique).mockResolvedValue(club);
  vi.mocked(prisma.program.updateMany).mockResolvedValue({ count: 0 });
});

describe("removeOrgTrainer", () => {
  const trainer = { id: "t1", clerkId: "clerk_t" } as any;
  it("deletes the trainer's Clerk membership and detaches their row", async () => {
    await removeOrgTrainer("org_club", trainer);
    expect(clerk.deleteOrganizationMembership).toHaveBeenCalledWith({ organizationId: "org_club", userId: "clerk_t" });
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "t1" }, data: { clerkOrgId: null, isActive: false } });
  });
  it("still deactivates the row when the Clerk membership is already gone (404)", async () => {
    clerk.deleteOrganizationMembership.mockRejectedValueOnce({ status: 404, errors: [{ code: "resource_not_found" }] });
    await removeOrgTrainer("org_club", trainer);
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "t1" }, data: { clerkOrgId: null, isActive: false } });
  });
  it("rethrows other Clerk failures without touching the row", async () => {
    clerk.deleteOrganizationMembership.mockRejectedValueOnce({ status: 500 });
    await expect(removeOrgTrainer("org_club", trainer)).rejects.toMatchObject({ status: 500 });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
  it("throws a ClubError when the DB update fails after the Clerk delete", async () => {
    vi.mocked(prisma.user.update).mockRejectedValueOnce(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(removeOrgTrainer("org_club", trainer)).rejects.toMatchObject({ code: "trainer_remove_failed" });
    expect(clerk.deleteOrganizationMembership).toHaveBeenCalled();
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
        OR: [{ clientId: null }, { clientId: { isSet: false } }],
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
