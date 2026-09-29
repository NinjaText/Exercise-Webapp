import { describe, it, expect, vi, beforeEach } from "vitest";

const clerkMocks = vi.hoisted(() => ({
  createOrganization: vi.fn(async () => ({ id: "org_new" })),
  deleteOrganization: vi.fn(async () => ({})),
  updateOrganization: vi.fn(async () => ({})),
}));

vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: vi.fn(async () => ({ organizations: clerkMocks })),
}));
vi.mock("@/lib/stripe", () => ({
  stripe: { prices: { retrieve: vi.fn() } },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    organization: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    program: { findMany: vi.fn() },
    user: { count: vi.fn(), findFirst: vi.fn() },
    memberSubscription: { groupBy: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import {
  parseClubInput, createClub, updateClub, setOrgType, getClubBySlug, listClubsWithStats, ClubError,
} from "../club.service";

const valid = {
  name: "Pine Valley CC", joinSlug: "pine-valley", joinCode: "pinevalley24",
  trialDays: "14", stripePriceId: "price_123", starterProgramIds: ["p1", "p2"],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.organization.findFirst).mockResolvedValue(null);
  vi.mocked(stripe.prices.retrieve).mockResolvedValue({ active: true, recurring: { interval: "month" } } as any);
  vi.mocked(prisma.program.findMany).mockResolvedValue([
    { id: "p1", isGlobal: true, schedulingType: null },
    { id: "p2", isGlobal: true, schedulingType: "SCHEDULED" },
  ] as any);
  vi.mocked(prisma.organization.create).mockImplementation((async ({ data }: any) => ({ id: "db1", ...data })) as any);
});

describe("parseClubInput", () => {
  it("normalizes a valid form", () => {
    expect(parseClubInput(valid)).toEqual({
      name: "Pine Valley CC", joinSlug: "pine-valley", joinCode: "PINEVALLEY24",
      trialDays: 14, stripePriceId: "price_123", starterProgramIds: ["p1", "p2"],
    });
  });
  it.each([
    ["empty name", { name: " " }],
    ["bad slug", { joinSlug: "Pine Valley!" }],
    ["short code", { joinCode: "ab" }],
    ["zero trial", { trialDays: "0" }],
    ["huge trial", { trialDays: "400" }],
    ["non-price id", { stripePriceId: "prod_1" }],
    ["no starters", { starterProgramIds: [] }],
  ])("rejects %s", (_l, patch) => {
    expect(() => parseClubInput({ ...valid, ...patch })).toThrow(ClubError);
  });
});

describe("createClub", () => {
  it("creates the Clerk org without createdBy and a CLUB row", async () => {
    const org = await createClub(parseClubInput(valid));
    expect(clerkMocks.createOrganization).toHaveBeenCalledWith({ name: "Pine Valley CC", maxAllowedMemberships: 0 });
    expect(prisma.organization.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clerkOrgId: "org_new", type: "CLUB", brandingEnabled: true, joinSlug: "pine-valley", trialDays: 14,
      }),
    });
    expect(org.type).toBe("CLUB");
  });
  it("refuses a taken slug before touching Clerk", async () => {
    vi.mocked(prisma.organization.findFirst).mockResolvedValue({ id: "x" } as any);
    await expect(createClub(parseClubInput(valid))).rejects.toMatchObject({ code: "slug_taken" });
    expect(clerkMocks.createOrganization).not.toHaveBeenCalled();
  });
  it("refuses a non-recurring or inactive price", async () => {
    vi.mocked(stripe.prices.retrieve).mockResolvedValue({ active: true, recurring: null } as any);
    await expect(createClub(parseClubInput(valid))).rejects.toMatchObject({ code: "price_invalid" });
  });
  it("refuses starters that are not scheduled global programs", async () => {
    vi.mocked(prisma.program.findMany).mockResolvedValue([
      { id: "p1", isGlobal: true, schedulingType: "ON_DEMAND" },
      { id: "p2", isGlobal: true, schedulingType: null },
    ] as any);
    await expect(createClub(parseClubInput(valid))).rejects.toMatchObject({ code: "starter_invalid" });
  });
  it("deletes the Clerk org if the DB write fails", async () => {
    vi.mocked(prisma.organization.create).mockRejectedValue(new Error("db down"));
    await expect(createClub(parseClubInput(valid))).rejects.toThrow("db down");
    expect(clerkMocks.deleteOrganization).toHaveBeenCalledWith("org_new");
  });
});

describe("updateClub", () => {
  it("does not touch existing members' trials", async () => {
    vi.mocked(prisma.organization.findUnique).mockResolvedValue({ clerkOrgId: "org_1", type: "CLUB", joinSlug: "pine-valley" } as any);
    vi.mocked(prisma.organization.update).mockResolvedValue({} as any);
    await updateClub("org_1", parseClubInput({ ...valid, trialDays: "30" }));
    expect(prisma.memberSubscription.updateMany).not.toHaveBeenCalled();
    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: { clerkOrgId: "org_1" },
      data: expect.objectContaining({ trialDays: 30 }),
    });
  });
});

describe("setOrgType", () => {
  it("refuses when the org has clients", async () => {
    vi.mocked(prisma.user.count).mockResolvedValue(3);
    await expect(setOrgType("org_1", "TRAINER")).rejects.toMatchObject({ code: "has_clients" });
    expect(prisma.organization.update).not.toHaveBeenCalled();
  });
  it("changes the type of an empty org", async () => {
    vi.mocked(prisma.user.count).mockResolvedValue(0);
    await setOrgType("org_1", "CLUB");
    expect(prisma.organization.update).toHaveBeenCalledWith({ where: { clerkOrgId: "org_1" }, data: { type: "CLUB" } });
  });
});

describe("getClubBySlug", () => {
  it("ignores non-club orgs", async () => {
    vi.mocked(prisma.organization.findFirst).mockResolvedValue({ joinSlug: "x", type: null } as any);
    expect(await getClubBySlug("x")).toBeNull();
  });
});

describe("getClubBySlug slug normalisation", () => {
  it("lower-cases and trims the slug before lookup", async () => {
    vi.mocked(prisma.organization.findFirst).mockResolvedValue({ joinSlug: "pinevalley", type: "CLUB" } as any);
    expect(await getClubBySlug("  PineValley ")).toMatchObject({ joinSlug: "pinevalley" });
    expect(prisma.organization.findFirst).toHaveBeenCalledWith({ where: { joinSlug: "pinevalley" } });
  });
});

describe("listClubsWithStats", () => {
  const now = new Date("2026-09-29T12:00:00Z");
  const group = (clerkOrgId: string, status: string, n: number) => ({ clerkOrgId, status, _count: { _all: n } });

  beforeEach(() => {
    vi.mocked(prisma.organization.findMany).mockResolvedValue([{ clerkOrgId: "org_a" }, { clerkOrgId: "org_b" }] as any);
  });

  it("counts expired trials as decided (not trialing, not paying)", async () => {
    vi.mocked(prisma.memberSubscription.groupBy)
      .mockResolvedValueOnce([
        group("org_a", "TRIALING", 5), group("org_a", "ACTIVE", 2), group("org_a", "PAST_DUE", 1), group("org_a", "CANCELED", 1),
      ] as any)
      .mockResolvedValueOnce([group("org_a", "TRIALING", 3)] as any);

    const [a, b] = await listClubsWithStats(now);

    // Second query: TRIALING rows whose trial has ended.
    expect(prisma.memberSubscription.groupBy).toHaveBeenLastCalledWith({
      by: ["clerkOrgId", "status"],
      where: { clerkOrgId: { in: ["org_a", "org_b"] }, status: "TRIALING", trialEndsAt: { lt: now } },
      _count: { _all: true },
    });
    // 9 members: 2 still trialing, 3 expired, 3 paying, 1 canceled → decided = 7.
    expect(a).toMatchObject({ members: 9, trialing: 2, expired: 3, paying: 3 });
    expect(a.conversionRate).toBeCloseTo(3 / 7);
    expect(b).toMatchObject({ members: 0, trialing: 0, expired: 0, paying: 0, conversionRate: null });
  });

  it("returns a null conversion rate when everyone is still in an active trial", async () => {
    vi.mocked(prisma.memberSubscription.groupBy)
      .mockResolvedValueOnce([group("org_a", "TRIALING", 4)] as any)
      .mockResolvedValueOnce([] as any);
    const [a] = await listClubsWithStats(now);
    expect(a).toMatchObject({ members: 4, trialing: 4, expired: 0, paying: 0, conversionRate: null });
  });

  it("an all-expired club converts at 0%, not 100%", async () => {
    vi.mocked(prisma.memberSubscription.groupBy)
      .mockResolvedValueOnce([group("org_a", "TRIALING", 4)] as any)
      .mockResolvedValueOnce([group("org_a", "TRIALING", 4)] as any);
    const [a] = await listClubsWithStats(now);
    expect(a).toMatchObject({ trialing: 0, expired: 4, paying: 0, conversionRate: 0 });
  });
});
