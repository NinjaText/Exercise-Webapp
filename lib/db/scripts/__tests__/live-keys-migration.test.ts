import { describe, it, expect, vi } from "vitest";
import {
  migrateClerk,
  migrateStripe,
  remapIds,
  type ClerkOrgLike,
  type ClerkUserLike,
  type MigrationDb,
  type SourceClerk,
  type StripeSide,
  type TargetClerk,
  type TargetStripe,
} from "../live-keys-migration";

function clerkUser(id: string, email: string, publicMetadata: Record<string, unknown> = {}): ClerkUserLike {
  return {
    id,
    externalId: null,
    primaryEmailAddressId: `em_${id}`,
    emailAddresses: [{ id: `em_${id}`, emailAddress: email }],
    firstName: "F",
    lastName: "L",
    publicMetadata,
    privateMetadata: {},
    unsafeMetadata: {},
  };
}

function clerkOrg(id: string, name: string): ClerkOrgLike {
  return { id, name, maxAllowedMemberships: 0, publicMetadata: {}, privateMetadata: {} };
}

/** A tiny in-memory collection that supports the equality filters the migration uses. */
function collection<T extends Record<string, unknown>>(rows: T[]) {
  const matches = (row: T, where: Record<string, unknown>): boolean =>
    Object.entries(where).every(([k, v]) => {
      if (k === "OR") return (v as Record<string, unknown>[]).some((w) => matches(row, w));
      if (v && typeof v === "object" && "not" in v) return row[k] != null;
      return row[k] === v;
    });
  return {
    rows,
    count: vi.fn(async ({ where }: { where: Record<string, unknown> }) => rows.filter((r) => matches(r, where)).length),
    updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const hit = rows.filter((r) => matches(r, where));
      hit.forEach((r) => Object.assign(r, data));
      return { count: hit.length };
    }),
    findMany: vi.fn(async (args?: { where?: Record<string, unknown> }) =>
      rows.filter((r) => !args?.where || matches(r, args.where))
    ),
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => rows.find((r) => r.id === where.id) ?? null),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = rows.find((r) => r.id === where.id)!;
      Object.assign(row, data);
      return row;
    }),
  };
}

function fakeDb(seed: {
  users?: Record<string, unknown>[];
  orgs?: Record<string, unknown>[];
  trainerSubs?: Record<string, unknown>[];
  memberSubs?: Record<string, unknown>[];
  coaching?: Record<string, unknown>[];
  auditLogs?: Record<string, unknown>[];
}) {
  const db = {
    user: collection(seed.users ?? []),
    organization: collection(seed.orgs ?? []),
    adminClubSession: collection([]),
    memberSubscription: collection(seed.memberSubs ?? []),
    memberCoaching: collection(seed.coaching ?? []),
    programPurchase: collection([]),
    auditLog: collection(seed.auditLogs ?? []),
    trainerSubscription: collection(seed.trainerSubs ?? []),
  };
  return db as typeof db & MigrationDb;
}

function fakeSource(users: ClerkUserLike[], orgs: ClerkOrgLike[], memberships: Record<string, [string, string][]> = {}) {
  return {
    listAllUsers: vi.fn(async () => users),
    getOrg: vi.fn(async (id: string) => orgs.find((o) => o.id === id) ?? null),
    listMemberships: vi.fn(async (orgId: string) =>
      (memberships[orgId] ?? []).map(([userId, role]) => ({ userId, role }))
    ),
    countPendingInvitations: vi.fn(async () => 0),
  } satisfies SourceClerk;
}

function fakeTarget(existing: { users?: ClerkUserLike[]; orgs?: ClerkOrgLike[] } = {}) {
  const users = [...(existing.users ?? [])];
  const orgs = [...(existing.orgs ?? [])];
  const members = new Map<string, Set<string>>();
  let n = 0;
  const target = {
    users,
    orgs,
    members,
    findUserByExternalId: vi.fn(async (ext: string) => users.find((u) => u.externalId === ext) ?? null),
    findUserByEmail: vi.fn(async (email: string) =>
      users.find((u) => u.emailAddresses.some((e) => e.emailAddress === email)) ?? null
    ),
    createUser: vi.fn(async (input) => {
      const u = { ...clerkUser(`live_user_${++n}`, input.email, input.publicMetadata), externalId: input.externalId };
      users.push(u);
      return u;
    }),
    listMigratedOrgs: vi.fn(async () => {
      const map = new Map<string, ClerkOrgLike>();
      for (const o of orgs) if (typeof o.privateMetadata?.migratedFromOrgId === "string") map.set(o.privateMetadata.migratedFromOrgId, o);
      return map;
    }),
    createOrg: vi.fn(async (input) => {
      const o = { ...clerkOrg(`live_org_${++n}`, input.name), privateMetadata: input.privateMetadata };
      orgs.push(o);
      return o;
    }),
    listMemberUserIds: vi.fn(async (orgId: string) => new Set(members.get(orgId) ?? [])),
    createMembership: vi.fn(async (orgId: string, userId: string) => {
      members.set(orgId, new Set([...(members.get(orgId) ?? []), userId]));
    }),
  } satisfies TargetClerk & Record<string, unknown>;
  return target;
}

describe("remapIds", () => {
  it("replaces mapped ids anywhere in nested metadata and leaves the rest", () => {
    const map = new Map([["org_old", "org_new"]]);
    expect(remapIds({ houseCoach: true, clerkOrgId: "org_old", list: ["org_old", "x"], n: 3 }, map)).toEqual({
      houseCoach: true,
      clerkOrgId: "org_new",
      list: ["org_new", "x"],
      n: 3,
    });
  });
});

describe("migrateClerk", () => {
  const setup = () => {
    const db = fakeDb({
      users: [
        { id: "u1", clerkId: "user_trainer", clerkOrgId: "org_a", email: "t@x.com", firstName: "Tess", lastName: "T" },
        { id: "u2", clerkId: "user_client", clerkOrgId: "org_a", email: "c@x.com", firstName: "Cal", lastName: "C" },
        { id: "u3", clerkId: "user_coach", clerkOrgId: "org_club", email: "house-coach+org_club@x.com", firstName: "Coach", lastName: "Club" },
      ],
      orgs: [
        { id: "o1", clerkOrgId: "org_a", name: "Tess Training", stripePriceId: null, coachingStripePriceId: null },
        { id: "o2", clerkOrgId: "org_club", name: "Club", stripePriceId: null, coachingStripePriceId: null },
      ],
      auditLogs: [{ id: "a1", orgId: "org_a" }, { id: "a2", orgId: "org_a" }],
    });
    const source = fakeSource(
      [
        clerkUser("user_trainer", "t@x.com"),
        clerkUser("user_client", "c@x.com"),
        clerkUser("user_coach", "house-coach+org_club@x.com", { houseCoach: true, clerkOrgId: "org_club" }),
        clerkUser("user_admin", "admin@x.com", { superAdmin: true }),
        clerkUser("user_abandoned", "gone@x.com"),
      ],
      [clerkOrg("org_a", "Tess Training"), clerkOrg("org_club", "Club")],
      { org_a: [["user_trainer", "org:admin"], ["user_client", "org:member"]], org_club: [["user_coach", "org:admin"]] }
    );
    return { db, source };
  };

  it("dry run writes nothing anywhere but reports the plan", async () => {
    const { db, source } = setup();
    const target = fakeTarget();
    const r = await migrateClerk({ db, source, target, apply: false, orgMemberLimit: 20 });

    expect(target.createUser).not.toHaveBeenCalled();
    expect(target.createOrg).not.toHaveBeenCalled();
    expect(target.createMembership).not.toHaveBeenCalled();
    expect(db.user.updateMany).not.toHaveBeenCalled();
    expect(r.orgs.created).toBe(2);
    expect(r.users.created).toBe(4); // 3 DB users + the super admin
    expect(r.users.skippedNoDbRow).toBe(1);
    expect(r.memberships.created).toBe(3);
    expect(r.dbRewrites["AuditLog.orgId"]).toBe(2);
  });

  it("apply recreates orgs, users and memberships, then rewrites every Clerk id in the DB", async () => {
    const { db, source } = setup();
    const target = fakeTarget();
    const r = await migrateClerk({ db, source, target, apply: true, orgMemberLimit: 20 });

    expect(r.failures).toEqual([]);
    const newOrgA = r.orgMap.org_a;
    const newClub = r.orgMap.org_club;
    expect(target.orgs.find((o) => o.id === newOrgA)?.privateMetadata).toMatchObject({ migratedFromOrgId: "org_a" });
    // Dev's unlimited (0) cap is replaced by the live plan's limit.
    expect(target.createOrg).toHaveBeenCalledWith(expect.objectContaining({ maxAllowedMemberships: 20 }));

    // House coach points at the NEW org in both externalId and metadata.
    const coach = target.users.find((u) => u.id === r.userMap.user_coach)!;
    expect(coach.externalId).toBe(`house-coach:${newClub}`);
    expect(coach.publicMetadata).toMatchObject({ houseCoach: true, clerkOrgId: newClub });

    expect(target.createMembership).toHaveBeenCalledWith(newOrgA, r.userMap.user_trainer, "org:admin");
    expect(target.createMembership).toHaveBeenCalledWith(newOrgA, r.userMap.user_client, "org:member");

    expect(db.user.rows.map((u) => [u.clerkId, u.clerkOrgId])).toEqual([
      [r.userMap.user_trainer, newOrgA],
      [r.userMap.user_client, newOrgA],
      [r.userMap.user_coach, newClub],
    ]);
    expect(db.organization.rows.map((o) => o.clerkOrgId)).toEqual([newOrgA, newClub]);
    expect(db.auditLog.rows.every((a) => a.orgId === newOrgA)).toBe(true);
  });

  it("re-running after an aborted run creates nothing twice", async () => {
    const { db, source } = setup();
    const target = fakeTarget();
    await migrateClerk({ db, source, target, apply: true, orgMemberLimit: 20 });
    // e.g. the first run aborted before the DB rewrite: same DB, same dev instance.
    const again = setup();
    const r = await migrateClerk({ db: again.db, source: again.source, target, apply: true, orgMemberLimit: 20 });

    expect(r.orgs.created).toBe(0);
    expect(r.users.created).toBe(0);
    expect(r.memberships.created).toBe(0);
    expect(r.orgs.existing).toBe(2);
    expect(r.users.existing).toBe(4);
  });

  it("links a user who already signed up on the live instance instead of duplicating them", async () => {
    const { db, source } = setup();
    const target = fakeTarget({ users: [clerkUser("live_existing", "c@x.com")] });
    const r = await migrateClerk({ db, source, target, apply: true, orgMemberLimit: 20 });

    expect(r.userMap.user_client).toBe("live_existing");
    expect(r.users.linkedByEmail).toBe(1);
    expect(db.user.rows.find((u) => u.email === "c@x.com")?.clerkId).toBe("live_existing");
  });

  it("adds no members to an org whose creation failed", async () => {
    const { db, source } = setup();
    const target = fakeTarget();
    target.createOrg.mockRejectedValueOnce(new Error("Payment Required"));
    const r = await migrateClerk({ db, source, target, apply: true, orgMemberLimit: 20 });

    expect(r.failures.map((f) => f.step)).toEqual(["create org"]);
    expect(r.memberships.created).toBe(1); // only the club's house coach
    expect(target.createMembership).toHaveBeenCalledTimes(1);
  });

  it("leaves the DB untouched when any Clerk step fails", async () => {
    const { db, source } = setup();
    const target = fakeTarget();
    target.createUser.mockRejectedValueOnce(new Error("rate limited"));
    const r = await migrateClerk({ db, source, target, apply: true, orgMemberLimit: 20 });

    expect(r.failures).toHaveLength(1);
    expect(r.dbRewriteSkipped).toBe(true);
    expect(db.user.updateMany).not.toHaveBeenCalled();
    expect(db.user.rows[0].clerkId).toBe("user_trainer");
  });
});

describe("migrateStripe", () => {
  const now = new Date("2026-11-01T00:00:00Z");
  const days = (n: number) => new Date(now.getTime() + n * 86_400_000);

  function stripeFakes(live: { prices?: string[]; customers?: string[]; subs?: string[] } = {}) {
    const source: StripeSide = {
      getPrice: vi.fn(async (id: string) =>
        id === "price_test_m" ? { unitAmount: 4900, currency: "usd", interval: "month" as const, intervalCount: 1 } : null
      ),
      customerExists: vi.fn(async () => true),
      subscriptionExists: vi.fn(async () => true),
    };
    let n = 0;
    const target = {
      getPrice: vi.fn(async (id: string) =>
        live.prices?.includes(id) ? { unitAmount: 1, currency: "usd", interval: "month" as const, intervalCount: 1 } : null
      ),
      customerExists: vi.fn(async (id: string) => live.customers?.includes(id) ?? false),
      subscriptionExists: vi.fn(async (id: string) => live.subs?.includes(id) ?? false),
      createClubPrice: vi.fn(async () => `price_live_${++n}`),
      createCustomer: vi.fn(async () => `cus_live_${++n}`),
    } satisfies TargetStripe;
    return { source, target };
  }

  const seed = () =>
    fakeDb({
      users: [{ id: "u1", email: "t@x.com", firstName: "Tess", lastName: "T" }],
      orgs: [
        { id: "o1", clerkOrgId: "org_live", name: "Club", stripePriceId: "price_test_m", coachingStripePriceId: "price_gone" },
      ],
      trainerSubs: [{ id: "ts1", trainerId: "u1", stripeCustomerId: "cus_test", stripeSubscriptionId: "sub_test", status: "ACTIVE", trialEndsAt: days(-30) }],
      memberSubs: [
        { id: "ms1", stripeCustomerId: "cus_test_m", stripeSubscriptionId: "sub_test_m", status: "ACTIVE", trialEndsAt: days(-10), remindersSent: ["d3"] },
        { id: "ms2", stripeCustomerId: null, stripeSubscriptionId: null, status: "TRIALING", trialEndsAt: days(3), remindersSent: [] },
      ],
      coaching: [{ id: "mc1", status: "ACTIVE", stripeSubscriptionId: "sub_test_c" }],
    });

  it("dry run checks live mode but writes nothing", async () => {
    const db = seed();
    const { source, target } = stripeFakes();
    const r = await migrateStripe({ db, source, target, apply: false, graceDays: 14, now });

    expect(target.createClubPrice).not.toHaveBeenCalled();
    expect(target.createCustomer).not.toHaveBeenCalled();
    expect(db.organization.update).not.toHaveBeenCalled();
    expect(db.trainerSubscription.update).not.toHaveBeenCalled();
    expect(r.clubPrices.recreated).toBe(1);
    expect(r.trainers.migrated).toBe(1);
    expect(r.members.migrated).toBe(1);
    expect(r.coaching.migrated).toBe(1);
  });

  it("apply recreates club prices with the same amount and resets test billing to a grace trial", async () => {
    const db = seed();
    const { source, target } = stripeFakes();
    const r = await migrateStripe({ db, source, target, apply: true, graceDays: 14, now });

    expect(r.failures).toEqual([]);
    expect(target.createClubPrice).toHaveBeenCalledWith(
      expect.objectContaining({
        productName: "Club — Membership",
        metadata: { clerkOrgId: "org_live", kind: "membership", app: "club" },
        price: { unitAmount: 4900, currency: "usd", interval: "month", intervalCount: 1 },
      })
    );
    const org = db.organization.rows[0];
    expect(org.stripePriceId).toMatch(/^price_live_/);
    // Missing in both modes: kept (null would turn it into a free club) and reported.
    expect(org.coachingStripePriceId).toBe("price_gone");
    expect(r.clubPrices.missing).toEqual(["Club coaching (price_gone)"]);

    expect(db.trainerSubscription.rows[0]).toMatchObject({
      stripeCustomerId: expect.stringMatching(/^cus_live_/),
      stripeSubscriptionId: null,
      status: "TRIALING",
      trialEndsAt: days(14),
    });
    expect(db.memberSubscription.rows[0]).toMatchObject({
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      status: "TRIALING",
      trialEndsAt: days(14),
      remindersSent: [],
    });
    // A member still on a no-card trial is untouched.
    expect(db.memberSubscription.rows[1]).toMatchObject({ status: "TRIALING", trialEndsAt: days(3) });
    expect(db.memberCoaching.rows[0]).toMatchObject({ status: "ACCEPTED", stripeSubscriptionId: null });
  });

  it("keeps a trial that already ends after the grace period", async () => {
    const db = seed();
    db.trainerSubscription.rows[0].trialEndsAt = days(30);
    const { source, target } = stripeFakes();
    await migrateStripe({ db, source, target, apply: true, graceDays: 14, now });
    expect(db.trainerSubscription.rows[0].trialEndsAt).toEqual(days(30));
  });

  it("skips anything that already exists in live mode", async () => {
    const db = seed();
    const { source, target } = stripeFakes({
      prices: ["price_test_m", "price_gone"],
      customers: ["cus_test", "cus_test_m"],
      subs: ["sub_test_c"],
    });
    const r = await migrateStripe({ db, source, target, apply: true, graceDays: 14, now });

    expect(r.clubPrices.alreadyLive).toBe(2);
    expect(r.trainers.alreadyLive).toBe(1);
    expect(r.members.alreadyLive).toBe(1);
    expect(r.coaching.alreadyLive).toBe(1);
    expect(db.trainerSubscription.update).not.toHaveBeenCalled();
    expect(db.memberCoaching.update).not.toHaveBeenCalled();
  });
});
