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
  stripe: {
    prices: { retrieve: vi.fn(), create: vi.fn(), update: vi.fn() },
    products: { create: vi.fn(), update: vi.fn() },
  },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    organization: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn(), delete: vi.fn(async () => ({})), count: vi.fn(async () => 0) },
    program: { findMany: vi.fn() },
    user: { count: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    memberCoaching: { groupBy: vi.fn() },
    memberSubscription: { groupBy: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
  },
}));

vi.mock("@/lib/services/club-trainer.service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/services/club-trainer.service")>(
    "@/lib/services/club-trainer.service"
  );
  return { ...actual, inviteClubTrainer: vi.fn(async () => {}), getClubTrainer: vi.fn(async () => null), getPendingTrainerInvite: vi.fn(async () => null) };
});

import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { inviteClubTrainer, getClubTrainer, getPendingTrainerInvite } from "@/lib/services/club-trainer.service";
import {
  parseClubInput, parseClubUpdateInput, createClub, updateClub, setOrgType, getClubBySlug, listClubsWithStats, ClubError,
  KEEP_PRICE,
} from "../club.service";

const valid = {
  name: "Pine Valley CC", joinSlug: "pine-valley", joinCode: "pinevalley24",
  trialDays: "14", membershipAmount: "14.99", starterProgramIds: ["p1", "p2"],
  trainerEmail: " Coach@Pine.com ", coachingAmount: "",
};

const outage = Object.assign(new Error("connection error"), { type: "StripeConnectionError" });
/** A stored USD monthly price, returned by prices.retrieve. */
const storedPrice = (id: string, unit_amount: number) => ({
  id, active: true, unit_amount, currency: "usd", recurring: { interval: "month", interval_count: 1 },
  product: { id: `prod_${id}`, active: true, metadata: { app: "club", kind: "membership" } },
});
let priceSeq = 0;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.organization.findFirst).mockResolvedValue(null);
  vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
  vi.mocked(getClubTrainer).mockResolvedValue(null);
  priceSeq = 0;
  vi.mocked(stripe.prices.retrieve).mockImplementation((async (id: string) =>
    id === "price_member" ? storedPrice(id, 1499) : storedPrice(id, 3000)) as any);
  vi.mocked(stripe.products.create).mockImplementation((async (p: any) => ({ id: `prod_${p.metadata.kind}` })) as any);
  vi.mocked(stripe.prices.create).mockImplementation((async (p: any) => ({ id: `price_new_${p.metadata.kind}_${++priceSeq}` })) as any);
  vi.mocked(stripe.prices.update).mockResolvedValue({} as any);
  vi.mocked(stripe.products.update).mockResolvedValue({} as any);
  vi.mocked(prisma.organization.count).mockResolvedValue(0);
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
      trialDays: 14, membershipAmountCents: 1499, starterProgramIds: ["p1", "p2"], resourceProgramIds: [],
      trainerEmail: "coach@pine.com", coachingAmountCents: null,
    });
  });
  it.each([
    ["14.99", 1499],
    ["14.9", 1490],
    ["$30", 3000],
    ["1", 100],
    ["10000", 1_000_000],
  ])("converts membership %s to %i cents", (membershipAmount, cents) => {
    expect(parseClubInput({ ...valid, membershipAmount }).membershipAmountCents).toBe(cents);
  });
  it("keeps a coaching amount when given", () => {
    expect(parseClubInput({ ...valid, coachingAmount: " 30 " }).coachingAmountCents).toBe(3000);
  });
  it("ignores any client-supplied request id", () => {
    expect(parseClubInput({ ...valid, requestId: "req-1234abcd" })).not.toHaveProperty("requestId");
  });
  it("create ignores keep flags (there is nothing to keep)", () => {
    expect(() => parseClubInput({ ...valid, membershipAmount: "", keepMembershipPrice: true })).toThrow(ClubError);
  });
  it("update input has no trainer email and does not require one", () => {
    const { trainerEmail: _t, ...rest } = valid;
    const parsed = parseClubUpdateInput(rest);
    expect(parsed).not.toHaveProperty("trainerEmail");
    expect(parsed.coachingAmountCents).toBeNull();
  });
  it("update: an empty field with its keep flag keeps the stored price", () => {
    const parsed = parseClubUpdateInput({
      ...valid, membershipAmount: "", coachingAmount: " ", keepMembershipPrice: true, keepCoachingPrice: true,
    });
    expect(parsed.membershipAmountCents).toBe(KEEP_PRICE);
    expect(parsed.coachingAmountCents).toBe(KEEP_PRICE);
  });
  it("update: a typed amount wins over the keep flag", () => {
    const parsed = parseClubUpdateInput({ ...valid, coachingAmount: "25", keepCoachingPrice: true });
    expect(parsed.coachingAmountCents).toBe(2500);
  });
  it.each([
    ["empty name", { name: " " }],
    ["bad slug", { joinSlug: "Pine Valley!" }],
    ["short code", { joinCode: "ab" }],
    ["zero trial", { trialDays: "0" }],
    ["huge trial", { trialDays: "400" }],
    ["missing membership amount", { membershipAmount: "" }],
    ["membership under $1", { membershipAmount: "0.5" }],
    ["membership over $10,000", { membershipAmount: "10000.01" }],
    ["non-numeric membership", { membershipAmount: "abc" }],
    ["3-decimal membership", { membershipAmount: "14.999" }],
    ["negative membership", { membershipAmount: "-5" }],
    ["no starters", { starterProgramIds: [] }],
    ["missing trainer email", { trainerEmail: "" }],
    ["bad trainer email", { trainerEmail: "coach@" }],
    ["non-numeric coaching", { coachingAmount: "abc" }],
    ["coaching under $1", { coachingAmount: "0.99" }],
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
  it("invites the club trainer after creating the row", async () => {
    await createClub(parseClubInput(valid));
    expect(inviteClubTrainer).toHaveBeenCalledWith("org_new", "coach@pine.com");
    expect(prisma.organization.delete).not.toHaveBeenCalled();
  });
  it("refuses a trainer email that already has an account before creating anything", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: "u_existing" } as any);
    await expect(createClub(parseClubInput(valid))).rejects.toMatchObject({ code: "trainer_email_taken" });
    expect(clerkMocks.createOrganization).not.toHaveBeenCalled();
    expect(prisma.organization.create).not.toHaveBeenCalled();
    expect(inviteClubTrainer).not.toHaveBeenCalled();
  });
  it("rolls back the DB row and Clerk org when the invite fails", async () => {
    vi.mocked(inviteClubTrainer).mockRejectedValueOnce(new Error("clerk down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(createClub(parseClubInput(valid))).rejects.toMatchObject({ code: "trainer_invite_failed" });
    expect(prisma.organization.delete).toHaveBeenCalledWith({ where: { clerkOrgId: "org_new" } });
    expect(clerkMocks.deleteOrganization).toHaveBeenCalledWith("org_new");
  });
  it("only allows Global starters on create (no trainer yet)", async () => {
    vi.mocked(prisma.program.findMany).mockResolvedValue([
      { id: "p1", isGlobal: true, clientId: null, trainerId: null, schedulingType: null },
      { id: "p2", isGlobal: false, clientId: null, trainerId: "t1", schedulingType: "SCHEDULED" },
    ] as any);
    await expect(createClub(parseClubInput(valid))).rejects.toMatchObject({ code: "starter_invalid" });
  });
});

describe("createClub prices", () => {
  it("creates the membership product + price and stores the price id", async () => {
    await createClub(parseClubInput(valid));
    expect(stripe.products.create).toHaveBeenCalledWith(
      { name: "Pine Valley CC — Membership", metadata: { clerkOrgId: "org_new", kind: "membership", app: "club" } },
      expect.objectContaining({ idempotencyKey: expect.stringMatching(/^club:org_new:membership:product:/) })
    );
    expect(stripe.prices.create).toHaveBeenCalledTimes(1);
    expect(stripe.prices.create).toHaveBeenCalledWith(
      expect.objectContaining({ unit_amount: 1499, currency: "usd", recurring: { interval: "month" }, product: "prod_membership" }),
      expect.anything()
    );
    expect(prisma.organization.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ stripePriceId: "price_new_membership_1", coachingStripePriceId: null }),
    });
  });
  it("creates a coaching price too when an amount is given", async () => {
    await createClub(parseClubInput({ ...valid, coachingAmount: "30" }));
    expect(stripe.prices.create).toHaveBeenCalledWith(
      expect.objectContaining({ unit_amount: 3000, product: "prod_coaching", metadata: { clerkOrgId: "org_new", kind: "coaching" } }),
      expect.anything()
    );
    expect(prisma.organization.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ stripePriceId: "price_new_membership_1", coachingStripePriceId: "price_new_coaching_2" }),
    });
  });
  it.each([
    ["a taken slug", () => vi.mocked(prisma.organization.findFirst).mockResolvedValue({ id: "x" } as any)],
    ["a taken trainer email", () => vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: "u" } as any)],
    ["invalid starters", () => vi.mocked(prisma.program.findMany).mockResolvedValue([] as any)],
  ])("creates no Stripe objects when validation fails (%s)", async (_l, arrange) => {
    arrange();
    await expect(createClub(parseClubInput({ ...valid, coachingAmount: "30" }))).rejects.toBeInstanceOf(ClubError);
    expect(stripe.products.create).not.toHaveBeenCalled();
    expect(stripe.prices.create).not.toHaveBeenCalled();
  });
  it("deletes the Clerk org and archives the membership price when the coaching price fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(stripe.prices.create).mockImplementation((async (p: any) => {
      if (p.metadata.kind === "coaching") throw outage;
      return { id: "price_new_membership" };
    }) as any);
    await expect(createClub(parseClubInput({ ...valid, coachingAmount: "30" }))).rejects.toMatchObject({
      code: "stripe_unavailable",
    });
    expect(stripe.prices.update).toHaveBeenCalledWith("price_new_membership", { active: false });
    expect(stripe.products.update).toHaveBeenCalledWith("prod_membership", { active: false });
    expect(stripe.products.update).toHaveBeenCalledWith("prod_coaching", { active: false });
    expect(clerkMocks.deleteOrganization).toHaveBeenCalledWith("org_new");
    expect(prisma.organization.create).not.toHaveBeenCalled();
  });
  it("archives the created prices and products when the DB write fails", async () => {
    vi.mocked(prisma.organization.create).mockRejectedValue(new Error("db down"));
    await expect(createClub(parseClubInput({ ...valid, coachingAmount: "30" }))).rejects.toThrow("db down");
    expect(vi.mocked(stripe.prices.update).mock.calls).toEqual([
      ["price_new_membership_1", { active: false }],
      ["price_new_coaching_2", { active: false }],
    ]);
    expect(vi.mocked(stripe.products.update).mock.calls.map((c) => c[0])).toEqual(["prod_membership", "prod_coaching"]);
    expect(clerkMocks.deleteOrganization).toHaveBeenCalledWith("org_new");
  });
  it("archives the created prices when the trainer invite fails", async () => {
    vi.mocked(inviteClubTrainer).mockRejectedValueOnce(new Error("clerk down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(createClub(parseClubInput(valid))).rejects.toMatchObject({ code: "trainer_invite_failed" });
    expect(stripe.prices.update).toHaveBeenCalledWith("price_new_membership_1", { active: false });
    expect(stripe.products.update).toHaveBeenCalledWith("prod_membership", { active: false });
  });
  it("logs (doesn't swallow) a failed Clerk org rollback", async () => {
    vi.mocked(prisma.organization.create).mockRejectedValue(new Error("db down"));
    clerkMocks.deleteOrganization.mockRejectedValueOnce(new Error("clerk down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(createClub(parseClubInput(valid))).rejects.toThrow("db down");
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("Clerk org"), "org_new", expect.any(Error));
  });
  it("does not archive anything on success", async () => {
    await createClub(parseClubInput({ ...valid, coachingAmount: "30" }));
    expect(stripe.prices.update).not.toHaveBeenCalled();
    expect(stripe.products.update).not.toHaveBeenCalled();
  });
});

describe("updateClub prices", () => {
  const { trainerEmail: _t, ...updateForm } = valid;
  const existing = {
    clerkOrgId: "org_1", type: "CLUB", name: "Pine Valley CC", starterProgramIds: ["p1", "p2"],
    stripePriceId: "price_member", coachingStripePriceId: "price_coach",
  };
  beforeEach(() => {
    vi.mocked(prisma.organization.findUnique).mockResolvedValue(existing as any);
    vi.mocked(prisma.organization.update).mockImplementation((async ({ data }: any) => ({ ...existing, ...data })) as any);
  });
  const lastUpdateData = () => (vi.mocked(prisma.organization.update).mock.calls.at(-1)![0] as any).data;

  it("is a no-op in Stripe when the amounts are unchanged", async () => {
    await updateClub("org_1", parseClubUpdateInput({ ...updateForm, coachingAmount: "30" }));
    expect(stripe.prices.create).not.toHaveBeenCalled();
    expect(stripe.prices.update).not.toHaveBeenCalled();
    expect(lastUpdateData()).toMatchObject({ stripePriceId: "price_member", coachingStripePriceId: "price_coach" });
  });

  it("creates a new price on the existing product and archives the old one only after the DB write", async () => {
    const order: string[] = [];
    vi.mocked(prisma.organization.update).mockImplementation((async ({ data }: any) => {
      order.push("db");
      return { ...existing, ...data };
    }) as any);
    vi.mocked(stripe.prices.update).mockImplementation((async (id: string) => {
      order.push(`archive:${id}`);
      return {};
    }) as any);
    await updateClub("org_1", parseClubUpdateInput({ ...updateForm, membershipAmount: "19.99", coachingAmount: "30" }));
    expect(stripe.products.create).not.toHaveBeenCalled();
    expect(stripe.prices.create).toHaveBeenCalledWith(
      expect.objectContaining({ unit_amount: 1999, product: "prod_price_member" }),
      expect.anything()
    );
    expect(lastUpdateData()).toMatchObject({ stripePriceId: "price_new_membership_1", coachingStripePriceId: "price_coach" });
    expect(order).toEqual(["db", "archive:price_member"]);
  });

  it("does not archive the old price when the DB write fails, and archives the new one", async () => {
    vi.mocked(prisma.organization.update).mockRejectedValue(new Error("db down"));
    await expect(
      updateClub("org_1", parseClubUpdateInput({ ...updateForm, membershipAmount: "19.99", coachingAmount: "30" }))
    ).rejects.toThrow("db down");
    expect(vi.mocked(stripe.prices.update).mock.calls).toEqual([["price_new_membership_1", { active: false }]]);
  });

  it("does not archive an old price another club still uses", async () => {
    vi.mocked(prisma.organization.count).mockResolvedValue(1);
    await updateClub("org_1", parseClubUpdateInput({ ...updateForm, membershipAmount: "19.99", coachingAmount: "30" }));
    expect(prisma.organization.count).toHaveBeenCalledWith({
      where: {
        clerkOrgId: { not: "org_1" },
        OR: [{ stripePriceId: "price_member" }, { coachingStripePriceId: "price_member" }],
      },
    });
    expect(stripe.prices.update).not.toHaveBeenCalled();
  });

  it("removes coaching when the amount is cleared, archiving the old price after the DB write", async () => {
    await updateClub("org_1", parseClubUpdateInput({ ...updateForm, coachingAmount: "" }));
    expect(lastUpdateData()).toMatchObject({ coachingStripePriceId: null });
    expect(stripe.prices.update).toHaveBeenCalledWith("price_coach", { active: false });
    expect(stripe.prices.create).not.toHaveBeenCalled();
  });

  it("adds coaching to a club that had none", async () => {
    vi.mocked(prisma.organization.findUnique).mockResolvedValue({ ...existing, coachingStripePriceId: null } as any);
    await updateClub("org_1", parseClubUpdateInput({ ...updateForm, coachingAmount: "45" }));
    expect(stripe.products.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Pine Valley CC — Coaching" }),
      expect.anything()
    );
    expect(lastUpdateData()).toMatchObject({ coachingStripePriceId: "price_new_coaching_1" });
  });

  it("keeps both stored prices (no Stripe call) when the form sends keep flags", async () => {
    await updateClub(
      "org_1",
      parseClubUpdateInput({ ...updateForm, membershipAmount: "", coachingAmount: "", keepMembershipPrice: true, keepCoachingPrice: true })
    );
    expect(stripe.prices.retrieve).not.toHaveBeenCalled();
    expect(lastUpdateData()).toMatchObject({ stripePriceId: "price_member", coachingStripePriceId: "price_coach" });
    expect(stripe.prices.update).not.toHaveBeenCalled();
  });

  it("a Stripe outage during save fails the edit and never removes coaching", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(stripe.prices.retrieve).mockRejectedValue(outage);
    await expect(
      updateClub("org_1", parseClubUpdateInput({ ...updateForm, coachingAmount: "30" }))
    ).rejects.toMatchObject({ code: "stripe_unavailable" });
    expect(prisma.organization.update).not.toHaveBeenCalled();
    expect(stripe.prices.update).not.toHaveBeenCalled();
  });

  it("a club whose membership couldn't be loaded saves the other fields while keeping its prices", async () => {
    vi.mocked(stripe.prices.retrieve).mockRejectedValue(outage);
    await updateClub(
      "org_1",
      parseClubUpdateInput({ ...updateForm, trialDays: "30", membershipAmount: "", coachingAmount: "", keepMembershipPrice: true, keepCoachingPrice: true })
    );
    expect(lastUpdateData()).toMatchObject({ trialDays: 30, stripePriceId: "price_member", coachingStripePriceId: "price_coach" });
  });

  it("refuses keep when the club has no membership price stored", async () => {
    vi.mocked(prisma.organization.findUnique).mockResolvedValue({ ...existing, stripePriceId: null } as any);
    await expect(
      updateClub("org_1", parseClubUpdateInput({ ...updateForm, membershipAmount: "", keepMembershipPrice: true }))
    ).rejects.toMatchObject({ code: "invalid_input" });
    expect(prisma.organization.update).not.toHaveBeenCalled();
  });

  it("validates slug and starters before any Stripe call", async () => {
    vi.mocked(prisma.organization.findFirst).mockResolvedValue({ id: "x" } as any);
    await expect(
      updateClub("org_1", parseClubUpdateInput({ ...updateForm, membershipAmount: "19.99" }))
    ).rejects.toMatchObject({ code: "slug_taken" });
    expect(stripe.prices.retrieve).not.toHaveBeenCalled();
    expect(stripe.prices.create).not.toHaveBeenCalled();
  });

  it("a rolled-back edit retried with the same form never stores an archived price", async () => {
    // Minimal Stripe model: idempotency keys replay the first response; update archives.
    const byKey = new Map<string, any>();
    const archived = new Set<string>();
    let n = 0;
    vi.mocked(stripe.prices.create).mockImplementation((async (_p: any, opts: any) => {
      const hit = byKey.get(opts.idempotencyKey);
      if (hit) return { ...hit, lastResponse: { headers: { "idempotent-replayed": "true" } } };
      const created = { id: `price_try_${++n}`, active: true };
      byKey.set(opts.idempotencyKey, created);
      return created;
    }) as any);
    vi.mocked(stripe.prices.update).mockImplementation((async (id: string) => {
      archived.add(id);
      return {};
    }) as any);
    const retrieveStored = vi.mocked(stripe.prices.retrieve).getMockImplementation()!;
    vi.mocked(stripe.prices.retrieve).mockImplementation((async (id: string, ...rest: any[]) =>
      id.startsWith("price_try_") ? { id, active: !archived.has(id) } : retrieveStored(id, ...rest)) as any);
    const form = { ...updateForm, membershipAmount: "19.99", coachingAmount: "30", requestId: "req-1234abcd" };

    vi.mocked(prisma.organization.update).mockRejectedValueOnce(new Error("db down"));
    await expect(updateClub("org_1", parseClubUpdateInput(form))).rejects.toThrow("db down");
    expect(archived.has("price_try_1")).toBe(true);

    await updateClub("org_1", parseClubUpdateInput(form));
    const stored = lastUpdateData().stripePriceId;
    expect(stored).not.toBe("price_try_1");
    expect(archived.has(stored)).toBe(false);
  });

  it("renames the club's products after a rename", async () => {
    await updateClub("org_1", parseClubUpdateInput({ ...updateForm, name: "Pine Ridge", coachingAmount: "30" }));
    expect(stripe.products.update).toHaveBeenCalledWith("prod_price_member", { name: "Pine Ridge — Membership" });
  });
});

describe("updateClub starters", () => {
  const { trainerEmail: _t, ...updateForm } = valid;
  beforeEach(() => {
    vi.mocked(prisma.organization.findUnique).mockResolvedValue({ clerkOrgId: "org_1", type: "CLUB", name: "Pine Valley CC" } as any);
    vi.mocked(prisma.organization.update).mockResolvedValue({} as any);
  });
  it("allows the club trainer's own scheduled templates", async () => {
    vi.mocked(getClubTrainer).mockResolvedValue({ id: "t1" } as any);
    vi.mocked(prisma.program.findMany).mockResolvedValue([
      { id: "p1", isGlobal: true, clientId: null, trainerId: null, schedulingType: null },
      { id: "p2", isGlobal: false, clientId: null, trainerId: "t1", schedulingType: "SCHEDULED" },
    ] as any);
    await updateClub("org_1", parseClubUpdateInput(updateForm));
    expect(getClubTrainer).toHaveBeenCalledWith("org_1");
    expect(prisma.organization.update).toHaveBeenCalled();
  });
  it.each([
    ["another trainer's template", { isGlobal: false, clientId: null, trainerId: "t_other", schedulingType: "SCHEDULED" }],
    ["the trainer's assigned (non-template) program", { isGlobal: false, clientId: "c1", trainerId: "t1", schedulingType: "SCHEDULED" }],
    ["the trainer's on-demand template", { isGlobal: false, clientId: null, trainerId: "t1", schedulingType: "ON_DEMAND" }],
  ])("refuses %s", async (_l, p2) => {
    vi.mocked(getClubTrainer).mockResolvedValue({ id: "t1" } as any);
    vi.mocked(prisma.program.findMany).mockResolvedValue([
      { id: "p1", isGlobal: true, clientId: null, trainerId: null, schedulingType: null },
      { id: "p2", ...p2 },
    ] as any);
    await expect(updateClub("org_1", parseClubUpdateInput(updateForm))).rejects.toMatchObject({ code: "starter_invalid" });
    expect(prisma.organization.update).not.toHaveBeenCalled();
  });
  // Between Replace and the new trainer accepting, the club has no trainer;
  // the admin must still be able to edit it without re-picking starters.
  it("keeps the club's existing trainer-template starters while it has no trainer", async () => {
    vi.mocked(getClubTrainer).mockResolvedValue(null);
    vi.mocked(prisma.organization.findUnique).mockResolvedValue({
      clerkOrgId: "org_1", type: "CLUB", name: "Pine Valley CC", starterProgramIds: ["p1", "p2"],
    } as any);
    vi.mocked(prisma.program.findMany).mockResolvedValue([
      { id: "p1", isGlobal: true, clientId: null, trainerId: null, schedulingType: null },
      { id: "p2", isGlobal: false, clientId: null, trainerId: "t_old", schedulingType: "SCHEDULED" },
    ] as any);
    await updateClub("org_1", parseClubUpdateInput(updateForm));
    expect(prisma.organization.update).toHaveBeenCalled();
  });
  it("still refuses a newly added trainer template while the club has no trainer", async () => {
    vi.mocked(getClubTrainer).mockResolvedValue(null);
    vi.mocked(prisma.organization.findUnique).mockResolvedValue({
      clerkOrgId: "org_1", type: "CLUB", name: "Pine Valley CC", starterProgramIds: ["p1"],
    } as any);
    vi.mocked(prisma.program.findMany).mockResolvedValue([
      { id: "p1", isGlobal: true, clientId: null, trainerId: null, schedulingType: null },
      { id: "p2", isGlobal: false, clientId: null, trainerId: "t_old", schedulingType: "SCHEDULED" },
    ] as any);
    await expect(updateClub("org_1", parseClubUpdateInput(updateForm))).rejects.toMatchObject({ code: "starter_invalid" });
    expect(prisma.organization.update).not.toHaveBeenCalled();
  });
  it("an unchanged starter that is no longer scheduled is still refused", async () => {
    vi.mocked(prisma.organization.findUnique).mockResolvedValue({
      clerkOrgId: "org_1", type: "CLUB", name: "Pine Valley CC", starterProgramIds: ["p1", "p2"],
    } as any);
    vi.mocked(prisma.program.findMany).mockResolvedValue([
      { id: "p1", isGlobal: true, clientId: null, trainerId: null, schedulingType: null },
      { id: "p2", isGlobal: false, clientId: null, trainerId: "t_old", schedulingType: "ON_DEMAND" },
    ] as any);
    await expect(updateClub("org_1", parseClubUpdateInput(updateForm))).rejects.toMatchObject({ code: "starter_invalid" });
  });
  it("accepts Global and club trainer resources", async () => {
    vi.mocked(getClubTrainer).mockResolvedValue({ id: "t1" } as any);
    vi.mocked(prisma.program.findMany)
      .mockResolvedValueOnce([
        { id: "p1", isGlobal: true, clientId: null, trainerId: null, schedulingType: null },
        { id: "p2", isGlobal: true, clientId: null, trainerId: null, schedulingType: "SCHEDULED" },
      ] as any)
      .mockResolvedValueOnce([
        { id: "r1", isGlobal: true, clientId: null, trainerId: null, schedulingType: "ON_DEMAND" },
        { id: "r2", isGlobal: false, clientId: null, trainerId: "t1", schedulingType: "ON_DEMAND" },
      ] as any);
    await updateClub("org_1", parseClubUpdateInput({ ...updateForm, resourceProgramIds: ["r1", "r2"] }));
    expect(prisma.organization.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ resourceProgramIds: ["r1", "r2"] }) })
    );
  });
  it("refuses a scheduled program as a resource", async () => {
    vi.mocked(prisma.program.findMany)
      .mockResolvedValueOnce([
        { id: "p1", isGlobal: true, clientId: null, trainerId: null, schedulingType: null },
        { id: "p2", isGlobal: true, clientId: null, trainerId: null, schedulingType: "SCHEDULED" },
      ] as any)
      .mockResolvedValueOnce([{ id: "r1", isGlobal: true, clientId: null, trainerId: null, schedulingType: "SCHEDULED" }] as any);
    await expect(
      updateClub("org_1", parseClubUpdateInput({ ...updateForm, resourceProgramIds: ["r1"] }))
    ).rejects.toMatchObject({ code: "starter_invalid" });
    expect(prisma.organization.update).not.toHaveBeenCalled();
  });
  it("refuses duplicate resources", () => {
    expect(() => parseClubUpdateInput({ ...updateForm, resourceProgramIds: ["r1", "r1"] })).toThrow(/only be added once/);
  });
  it("never writes a trainer email on update", async () => {
    await updateClub("org_1", parseClubUpdateInput(updateForm));
    expect(prisma.organization.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.not.objectContaining({ trainerEmail: expect.anything() }) })
    );
  });
});

describe("updateClub", () => {
  it("does not touch existing members' trials", async () => {
    vi.mocked(prisma.organization.findUnique).mockResolvedValue({ clerkOrgId: "org_1", type: "CLUB", joinSlug: "pine-valley" } as any);
    vi.mocked(prisma.organization.update).mockResolvedValue({} as any);
    await updateClub("org_1", parseClubUpdateInput({ ...valid, trialDays: "30" }));
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
    vi.mocked(prisma.memberCoaching.groupBy).mockResolvedValue([] as any);
    vi.mocked(prisma.user.findMany).mockResolvedValue([] as any);
    vi.mocked(getPendingTrainerInvite).mockResolvedValue(null);
  });

  it("adds the coached count and the trainer status per club", async () => {
    vi.mocked(prisma.memberSubscription.groupBy).mockResolvedValue([] as any);
    vi.mocked(prisma.memberCoaching.groupBy).mockResolvedValue([{ clerkOrgId: "org_a", _count: { _all: 3 } }] as any);
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { clerkOrgId: "org_a", firstName: "Sam", lastName: "Coach", email: "s@x.com", onboarded: true },
    ] as any);
    const [a, b] = await listClubsWithStats(now);
    expect(prisma.memberCoaching.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { clerkOrgId: { in: ["org_a", "org_b"] }, status: { in: ["ACTIVE", "PAST_DUE"] } } })
    );
    expect(a).toMatchObject({ coached: 3, trainer: { status: "active", name: "Sam Coach" } });
    expect(b).toMatchObject({ coached: 0, trainer: { status: "none" } });
    // Only the trainer-less club needs the Clerk invite lookup.
    expect(getPendingTrainerInvite).toHaveBeenCalledTimes(1);
    expect(getPendingTrainerInvite).toHaveBeenCalledWith("org_b");
  });

  it("reports unknown (and logs) when the Clerk invite lookup fails", async () => {
    vi.mocked(prisma.memberSubscription.groupBy).mockResolvedValue([] as any);
    vi.mocked(getPendingTrainerInvite).mockRejectedValue(new Error("clerk down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const [a] = await listClubsWithStats(now);
    expect(a.trainer).toEqual({ status: "unknown" });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("reports a pending invite for a trainer-less club", async () => {
    vi.mocked(prisma.memberSubscription.groupBy).mockResolvedValue([] as any);
    vi.mocked(getPendingTrainerInvite).mockResolvedValue({ email: "new@x.com", createdAt: new Date() });
    const [a] = await listClubsWithStats(now);
    expect(a.trainer).toEqual({ status: "pending", email: "new@x.com" });
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
