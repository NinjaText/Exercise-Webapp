import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { memberCoaching: { findMany: vi.fn(), findUnique: vi.fn() } },
}));
vi.mock("@/lib/org-capabilities.server", () => ({ getCapabilitiesForUser: vi.fn() }));
vi.mock("@/lib/services/coaching.service", () => ({ listCoachingRequests: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getCapabilitiesForUser } from "@/lib/org-capabilities.server";
import { listCoachingRequests } from "@/lib/services/coaching.service";
import {
  getClientCoachingPanel,
  getTrainerCoachingRequests,
  getTrainerCoachingStatuses,
} from "../trainer-coaching";

const clubTrainer = { id: "t1", role: "TRAINER", clerkOrgId: "org_club" } as any;
const orgTrainer = { id: "t2", role: "TRAINER", clerkOrgId: "org_pt" } as any;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCapabilitiesForUser).mockImplementation(
    async (u: any) => ({ billing: u.clerkOrgId === "org_club" ? "member" : "trainer" }) as any
  );
});

describe("trainer-org trainers (regression)", () => {
  it("fetch no coaching data at all", async () => {
    expect(await getTrainerCoachingRequests(orgTrainer)).toBeNull();
    expect(await getTrainerCoachingStatuses(orgTrainer)).toBeNull();
    expect(await getClientCoachingPanel(orgTrainer, "m1")).toBeNull();
    expect(listCoachingRequests).not.toHaveBeenCalled();
    expect(prisma.memberCoaching.findMany).not.toHaveBeenCalled();
    expect(prisma.memberCoaching.findUnique).not.toHaveBeenCalled();
  });
});

describe("club trainers", () => {
  it("lists pending requests with member notes", async () => {
    vi.mocked(listCoachingRequests).mockResolvedValue([
      { userId: "m1", requestNote: "bad knee", requestedAt: new Date(0), user: { firstName: "Ada", lastName: "L", email: "a@x.io" } },
    ] as any);
    expect(await getTrainerCoachingRequests(clubTrainer)).toEqual([
      { memberId: "m1", name: "Ada L", email: "a@x.io", note: "bad knee", requestedAt: new Date(0) },
    ]);
    expect(listCoachingRequests).toHaveBeenCalledWith("org_club");
  });

  it("maps statuses by member id, scoped to the trainer's org", async () => {
    vi.mocked(prisma.memberCoaching.findMany).mockResolvedValue([{ userId: "m1", status: "ACTIVE" }] as any);
    expect(await getTrainerCoachingStatuses(clubTrainer)).toEqual({ m1: "ACTIVE" });
    expect(vi.mocked(prisma.memberCoaching.findMany).mock.calls[0][0]!.where).toMatchObject({ clerkOrgId: "org_club" });
  });

  it("returns the panel data, or null when the row belongs to another org", async () => {
    vi.mocked(prisma.memberCoaching.findUnique).mockResolvedValue({
      clerkOrgId: "org_club", status: "ACTIVE", requestNote: "n", cancelAtPeriodEnd: true, currentPeriodEnd: new Date(0),
    } as any);
    expect(await getClientCoachingPanel(clubTrainer, "m1")).toEqual({
      memberId: "m1", status: "ACTIVE", note: "n", cancelAtPeriodEnd: true, periodEnd: new Date(0),
    });
    vi.mocked(prisma.memberCoaching.findUnique).mockResolvedValue({ clerkOrgId: "other", status: "ACTIVE" } as any);
    expect(await getClientCoachingPanel(clubTrainer, "m1")).toBeNull();
  });

  it("shows an empty panel for a member with no coaching row", async () => {
    vi.mocked(prisma.memberCoaching.findUnique).mockResolvedValue(null);
    expect(await getClientCoachingPanel(clubTrainer, "m1")).toEqual({
      memberId: "m1", status: null, note: null, cancelAtPeriodEnd: false, periodEnd: null,
    });
  });
});
