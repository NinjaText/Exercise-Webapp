import type { SubStatus } from "@prisma/client";

/**
 * Moves the app from the Clerk dev instance + Stripe test mode to the Clerk
 * production instance + Stripe live mode WITHOUT losing any data.
 *
 * Every row is keyed to Clerk ids (User.clerkId, *.clerkOrgId) and Stripe test
 * ids. A Clerk production instance is a separate user pool with new ids, and
 * test-mode Stripe ids don't exist in live mode, so a plain key swap orphans
 * everything. This module:
 *
 *   1. Clerk  — recreates every org, user and membership in the live instance
 *               (idempotent: users are found again by externalId/email, orgs by
 *               privateMetadata.migratedFromOrgId), then rewrites every Clerk id
 *               in the DB from the old id to the new one.
 *   2. Stripe — recreates club membership/coaching prices in live mode with the
 *               same amounts, gives trainers a live customer, and clears
 *               test-mode subscription ids. Anyone on a test subscription gets a
 *               grace trial (status TRIALING) so nobody is locked out at launch;
 *               they subscribe for real before it ends.
 *
 * Nothing is deleted anywhere. All I/O is injected so the logic is testable;
 * the CLI runner is migrate-to-live-keys.ts.
 */

// ── Clerk shapes (the subset of @clerk/backend resources we use) ────────────

type Metadata = Record<string, unknown>;

export interface ClerkUserLike {
  id: string;
  externalId: string | null;
  primaryEmailAddressId: string | null;
  emailAddresses: { id: string; emailAddress: string }[];
  firstName: string | null;
  lastName: string | null;
  publicMetadata: Metadata | null;
  privateMetadata: Metadata | null;
  unsafeMetadata: Metadata | null;
}

export interface ClerkOrgLike {
  id: string;
  name: string;
  maxAllowedMemberships: number;
  publicMetadata: Metadata | null;
  privateMetadata: Metadata | null;
}

export interface ClerkMembershipLike {
  role: string;
  userId: string | null;
}

export interface CreateUserInput {
  externalId: string;
  email: string;
  firstName: string;
  lastName: string;
  publicMetadata: Metadata;
  privateMetadata: Metadata;
  unsafeMetadata: Metadata;
}

/** No slug: the app never uses Clerk org slugs, and the live instance has them disabled. */
export interface CreateOrgInput {
  name: string;
  maxAllowedMemberships: number;
  publicMetadata: Metadata;
  privateMetadata: Metadata;
}

/** The Clerk dev instance. Read-only. */
export interface SourceClerk {
  listAllUsers(): Promise<ClerkUserLike[]>;
  getOrg(orgId: string): Promise<ClerkOrgLike | null>;
  listMemberships(orgId: string): Promise<ClerkMembershipLike[]>;
  countPendingInvitations(orgId: string): Promise<number>;
}

/** The Clerk production instance. Only `create*` write. */
export interface TargetClerk {
  findUserByExternalId(externalId: string): Promise<ClerkUserLike | null>;
  findUserByEmail(email: string): Promise<ClerkUserLike | null>;
  createUser(input: CreateUserInput): Promise<ClerkUserLike>;
  /** Target orgs keyed by privateMetadata.migratedFromOrgId (orgs this script made). */
  listMigratedOrgs(): Promise<Map<string, ClerkOrgLike>>;
  createOrg(input: CreateOrgInput): Promise<ClerkOrgLike>;
  listMemberUserIds(orgId: string): Promise<Set<string>>;
  createMembership(orgId: string, userId: string, role: string): Promise<void>;
}

// ── DB shape (the subset of PrismaClient we use) ────────────────────────────

type Where = Record<string, unknown>;
type Data = Record<string, unknown>;
interface CountAndUpdate {
  count(args: { where: Where }): Promise<number>;
  updateMany(args: { where: Where; data: Data }): Promise<{ count: number }>;
}

export interface MigrationDb {
  user: CountAndUpdate & {
    findMany(args: {
      select: { clerkId: true; clerkOrgId: true; email: true; firstName: true; lastName: true };
    }): Promise<{ clerkId: string; clerkOrgId: string | null; email: string; firstName: string; lastName: string }[]>;
    findUnique(args: { where: { id: string }; select: { email: true; firstName: true; lastName: true } }): Promise<{
      email: string;
      firstName: string;
      lastName: string;
    } | null>;
  };
  organization: CountAndUpdate & {
    findMany(args: { select: Record<string, true> }): Promise<{
      id: string;
      clerkOrgId: string;
      name: string;
      stripePriceId: string | null;
      coachingStripePriceId: string | null;
    }[]>;
    update(args: { where: { id: string }; data: Data }): Promise<unknown>;
  };
  adminClubSession: CountAndUpdate;
  memberSubscription: CountAndUpdate & {
    findMany(args: { where: Where }): Promise<{
      id: string;
      stripeCustomerId: string | null;
      stripeSubscriptionId: string | null;
      trialEndsAt: Date;
    }[]>;
    update(args: { where: { id: string }; data: Data }): Promise<unknown>;
  };
  memberCoaching: CountAndUpdate & {
    findMany(args: { where: Where }): Promise<{ id: string; status: string; stripeSubscriptionId: string | null }[]>;
    update(args: { where: { id: string }; data: Data }): Promise<unknown>;
  };
  programPurchase: CountAndUpdate;
  auditLog: CountAndUpdate;
  trainerSubscription: {
    findMany(args: Record<string, never>): Promise<{
      id: string;
      trainerId: string;
      stripeCustomerId: string;
      trialEndsAt: Date;
    }[]>;
    update(args: { where: { id: string }; data: Data }): Promise<unknown>;
  };
}

// ── Stripe shape ────────────────────────────────────────────────────────────

export interface PriceInfo {
  unitAmount: number;
  currency: string;
  interval: "day" | "week" | "month" | "year";
  intervalCount: number;
}

export interface StripeSide {
  /** null when the id doesn't exist in this mode (e.g. a test id on the live key). */
  getPrice(priceId: string): Promise<PriceInfo | null>;
  customerExists(customerId: string): Promise<boolean>;
  subscriptionExists(subscriptionId: string): Promise<boolean>;
}

export interface TargetStripe extends StripeSide {
  createClubPrice(args: {
    productName: string;
    metadata: Record<string, string>;
    price: PriceInfo;
    idempotencyKey: string;
  }): Promise<string>;
  createCustomer(args: {
    email: string;
    name: string;
    metadata: Record<string, string>;
    idempotencyKey: string;
  }): Promise<string>;
}

// ── Report ──────────────────────────────────────────────────────────────────

export interface Failure {
  step: string;
  id: string;
  error: string;
}

export interface ClerkReport {
  orgs: { created: number; existing: number; missingInSource: string[] };
  users: { created: number; existing: number; linkedByEmail: number; missingInSource: string[]; skippedNoDbRow: number };
  memberships: { created: number; existing: number; skippedUnmappedUser: number };
  pendingInvitations: number;
  userMap: Record<string, string>;
  orgMap: Record<string, string>;
  /** Rows (would be) rewritten per DB field. */
  dbRewrites: Record<string, number>;
  dbRewriteSkipped: boolean;
  failures: Failure[];
}

export interface StripeReport {
  clubPrices: { recreated: number; alreadyLive: number; missing: string[] };
  trainers: { migrated: number; alreadyLive: number };
  members: { migrated: number; alreadyLive: number };
  coaching: { migrated: number; alreadyLive: number };
  failures: Failure[];
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Recursively replaces any string equal to an old Clerk id with its new id. */
export function remapIds<T>(value: T, map: Map<string, string>): T {
  if (typeof value === "string") return (map.get(value) ?? value) as T;
  if (Array.isArray(value)) return value.map((v) => remapIds(v, map)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, remapIds(v, map)])) as T;
  }
  return value;
}

function primaryEmail(user: ClerkUserLike): string | null {
  return (
    user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress ??
    user.emailAddresses[0]?.emailAddress ??
    null
  );
}

// ── Phase 1: Clerk ──────────────────────────────────────────────────────────

export async function migrateClerk(args: {
  db: MigrationDb;
  source: SourceClerk;
  target: TargetClerk;
  apply: boolean;
  /** Member cap for every recreated org (the live plan may not allow the dev values). */
  orgMemberLimit: number;
  log?: (line: string) => void;
}): Promise<ClerkReport> {
  const { db, source, target, apply, orgMemberLimit } = args;
  const log = args.log ?? (() => {});
  const report: ClerkReport = {
    orgs: { created: 0, existing: 0, missingInSource: [] },
    users: { created: 0, existing: 0, linkedByEmail: 0, missingInSource: [], skippedNoDbRow: 0 },
    memberships: { created: 0, existing: 0, skippedUnmappedUser: 0 },
    pendingInvitations: 0,
    userMap: {},
    orgMap: {},
    dbRewrites: {},
    dbRewriteSkipped: !apply,
    failures: [],
  };

  const dbUsers = await db.user.findMany({
    select: { clerkId: true, clerkOrgId: true, email: true, firstName: true, lastName: true },
  });
  const dbUserByClerkId = new Map(dbUsers.map((u) => [u.clerkId, u]));
  const dbOrgs = await db.organization.findMany({
    select: { id: true, clerkOrgId: true, name: true, stripePriceId: true, coachingStripePriceId: true },
  });

  // ── Orgs: every org the DB knows about ──
  const orgIds = new Set<string>(dbOrgs.map((o) => o.clerkOrgId));
  for (const u of dbUsers) if (u.clerkOrgId) orgIds.add(u.clerkOrgId);

  const migratedOrgs = await target.listMigratedOrgs();
  const orgMap = new Map<string, string>();
  const sourceOrgs: ClerkOrgLike[] = [];
  for (const orgId of orgIds) {
    const src = await source.getOrg(orgId);
    if (!src) {
      report.orgs.missingInSource.push(orgId);
      continue;
    }
    sourceOrgs.push(src);
    report.pendingInvitations += await source.countPendingInvitations(orgId);
    const existing = migratedOrgs.get(orgId);
    if (existing) {
      orgMap.set(orgId, existing.id);
      report.orgs.existing++;
      continue;
    }
    if (!apply) {
      report.orgs.created++;
      continue;
    }
    try {
      const created = await target.createOrg({
        name: src.name,
        maxAllowedMemberships: orgMemberLimit,
        publicMetadata: src.publicMetadata ?? {},
        privateMetadata: { ...(src.privateMetadata ?? {}), migratedFromOrgId: src.id },
      });
      orgMap.set(orgId, created.id);
      report.orgs.created++;
      log(`  org   ${src.name}: ${orgId} → ${created.id}`);
    } catch (err) {
      report.failures.push({ step: "create org", id: orgId, error: errorText(err) });
    }
  }

  // ── Users: everyone with a DB row, plus super admins (who may have none) ──
  const sourceUsers = await source.listAllUsers();
  const sourceUserIds = new Set(sourceUsers.map((u) => u.id));
  report.users.missingInSource = dbUsers.filter((u) => !sourceUserIds.has(u.clerkId)).map((u) => u.email);

  const userMap = new Map<string, string>();
  for (const src of sourceUsers) {
    const dbUser = dbUserByClerkId.get(src.id);
    const isSuperAdmin = src.publicMetadata?.superAdmin === true;
    if (!dbUser && !isSuperAdmin) {
      report.users.skippedNoDbRow++;
      continue;
    }
    const email = dbUser?.email ?? primaryEmail(src);
    if (!email) {
      report.failures.push({ step: "create user", id: src.id, error: "no email address" });
      continue;
    }

    // A house coach's externalId and metadata embed its org id; both must point at the new org.
    const isHouseCoach = src.publicMetadata?.houseCoach === true;
    const houseCoachOrg = isHouseCoach ? (dbUser?.clerkOrgId ?? null) : null;
    if (isHouseCoach && (!houseCoachOrg || !orgMap.has(houseCoachOrg)) && apply) {
      report.failures.push({ step: "create user", id: src.id, error: "house coach's org was not migrated" });
      continue;
    }
    const externalId = isHouseCoach ? `house-coach:${orgMap.get(houseCoachOrg!) ?? houseCoachOrg}` : src.id;

    try {
      const byExternalId = await target.findUserByExternalId(externalId);
      if (byExternalId) {
        userMap.set(src.id, byExternalId.id);
        report.users.existing++;
        continue;
      }
      // Someone already signed up on the live instance with this email: link, don't duplicate.
      const byEmail = await target.findUserByEmail(email);
      if (byEmail) {
        userMap.set(src.id, byEmail.id);
        report.users.linkedByEmail++;
        continue;
      }
      if (!apply) {
        report.users.created++;
        continue;
      }
      const created = await target.createUser({
        externalId,
        email,
        firstName: dbUser?.firstName || src.firstName || "",
        lastName: dbUser?.lastName || src.lastName || "",
        publicMetadata: remapIds(src.publicMetadata ?? {}, orgMap),
        privateMetadata: remapIds(src.privateMetadata ?? {}, orgMap),
        unsafeMetadata: remapIds(src.unsafeMetadata ?? {}, orgMap),
      });
      userMap.set(src.id, created.id);
      report.users.created++;
      log(`  user  ${email}: ${src.id} → ${created.id}`);
    } catch (err) {
      report.failures.push({ step: "create user", id: `${src.id} (${email})`, error: errorText(err) });
    }
  }

  // ── Memberships, with the same role ──
  for (const src of sourceOrgs) {
    const newOrgId = orgMap.get(src.id);
    // Its creation failed (already in report.failures): nothing to add members to.
    if (apply && !newOrgId) continue;
    const memberships = await source.listMemberships(src.id);
    const present = newOrgId ? await target.listMemberUserIds(newOrgId) : new Set<string>();
    for (const m of memberships) {
      const newUserId = m.userId ? userMap.get(m.userId) : undefined;
      if (!m.userId || (apply && !newUserId)) {
        report.memberships.skippedUnmappedUser++;
        continue;
      }
      if (newUserId && present.has(newUserId)) {
        report.memberships.existing++;
        continue;
      }
      // On apply both ids are set by now (checked above); this also narrows them.
      if (!apply || !newOrgId || !newUserId) {
        report.memberships.created++;
        continue;
      }
      try {
        await target.createMembership(newOrgId, newUserId, m.role);
        report.memberships.created++;
      } catch (err) {
        report.failures.push({ step: "create membership", id: `${src.id}/${m.userId}`, error: errorText(err) });
      }
    }
  }

  report.userMap = Object.fromEntries(userMap);
  report.orgMap = Object.fromEntries(orgMap);

  // ── DB rewrite: old Clerk id → new Clerk id. Only once Clerk is complete. ──
  if (apply && report.failures.length > 0) {
    report.dbRewriteSkipped = true;
    return report;
  }
  const userFields: [CountAndUpdate, string, string][] = [
    [db.user, "clerkId", "User.clerkId"],
    [db.programPurchase, "buyerClerkId", "ProgramPurchase.buyerClerkId"],
  ];
  const orgFields: [CountAndUpdate, string, string][] = [
    [db.organization, "clerkOrgId", "Organization.clerkOrgId"],
    [db.user, "clerkOrgId", "User.clerkOrgId"],
    [db.adminClubSession, "clerkOrgId", "AdminClubSession.clerkOrgId"],
    [db.memberSubscription, "clerkOrgId", "MemberSubscription.clerkOrgId"],
    [db.memberCoaching, "clerkOrgId", "MemberCoaching.clerkOrgId"],
    [db.programPurchase, "orgId", "ProgramPurchase.orgId"],
    [db.auditLog, "orgId", "AuditLog.orgId"],
  ];
  // Dry run: count the rows each mapping would touch (unmapped ids count against the old id).
  const plannedUsers = apply ? userMap : new Map(sourceUsers.map((u) => [u.id, u.id]));
  const plannedOrgs = apply ? orgMap : new Map(sourceOrgs.map((o) => [o.id, o.id]));
  const rewrite = async (fields: [CountAndUpdate, string, string][], map: Map<string, string>) => {
    for (const [model, field, label] of fields) {
      let total = 0;
      for (const [oldId, newId] of map) {
        total += apply
          ? (await model.updateMany({ where: { [field]: oldId }, data: { [field]: newId } })).count
          : await model.count({ where: { [field]: oldId } });
      }
      report.dbRewrites[label] = total;
    }
  };
  await rewrite(userFields, plannedUsers);
  await rewrite(orgFields, plannedOrgs);
  return report;
}

// ── Phase 2: Stripe ─────────────────────────────────────────────────────────

const KIND_LABEL = { membership: "Membership", coaching: "Coaching" } as const;

function graceTrialEnd(current: Date, graceDays: number, now: Date): Date {
  const grace = new Date(now.getTime() + graceDays * 24 * 60 * 60 * 1000);
  return current > grace ? current : grace;
}

export async function migrateStripe(args: {
  db: MigrationDb;
  source: StripeSide;
  target: TargetStripe;
  apply: boolean;
  graceDays: number;
  now?: Date;
  log?: (line: string) => void;
}): Promise<StripeReport> {
  const { db, source, target, apply, graceDays } = args;
  const now = args.now ?? new Date();
  const log = args.log ?? (() => {});
  const report: StripeReport = {
    clubPrices: { recreated: 0, alreadyLive: 0, missing: [] },
    trainers: { migrated: 0, alreadyLive: 0 },
    members: { migrated: 0, alreadyLive: 0 },
    coaching: { migrated: 0, alreadyLive: 0 },
    failures: [],
  };
  const attempt = async (step: string, id: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      report.failures.push({ step, id, error: errorText(err) });
    }
  };

  // Club prices: same amount/interval, new live product + price.
  const orgs = await db.organization.findMany({
    select: { id: true, clerkOrgId: true, name: true, stripePriceId: true, coachingStripePriceId: true },
  });
  for (const org of orgs) {
    for (const [kind, field] of [
      ["membership", "stripePriceId"],
      ["coaching", "coachingStripePriceId"],
    ] as const) {
      const priceId = org[field];
      if (!priceId) continue;
      await attempt(`club ${kind} price`, `${org.name} (${priceId})`, async () => {
        if (await target.getPrice(priceId)) {
          report.clubPrices.alreadyLive++;
          return;
        }
        const price = await source.getPrice(priceId);
        if (!price) {
          // Never null it out: a null membership price means "free club".
          report.clubPrices.missing.push(`${org.name} ${kind} (${priceId})`);
          return;
        }
        report.clubPrices.recreated++;
        if (!apply) return;
        const newId = await target.createClubPrice({
          productName: `${org.name} — ${KIND_LABEL[kind]}`,
          metadata: { clerkOrgId: org.clerkOrgId, kind, app: "club" },
          price,
          idempotencyKey: `live-migration:${org.id}:${kind}`,
        });
        await db.organization.update({ where: { id: org.id }, data: { [field]: newId } });
        log(`  price ${org.name} ${kind}: ${priceId} → ${newId}`);
      });
    }
  }

  // Trainers: stripeCustomerId is required, so give each a live customer.
  for (const sub of await db.trainerSubscription.findMany({})) {
    await attempt("trainer subscription", sub.trainerId, async () => {
      if (await target.customerExists(sub.stripeCustomerId)) {
        report.trainers.alreadyLive++;
        return;
      }
      report.trainers.migrated++;
      if (!apply) return;
      const trainer = await db.user.findUnique({
        where: { id: sub.trainerId },
        select: { email: true, firstName: true, lastName: true },
      });
      if (!trainer) throw new Error("trainer user not found");
      const customerId = await target.createCustomer({
        email: trainer.email,
        name: `${trainer.firstName} ${trainer.lastName}`.trim(),
        metadata: { trainerId: sub.trainerId },
        idempotencyKey: `live-migration:trainer-customer:${sub.id}`,
      });
      await db.trainerSubscription.update({
        where: { id: sub.id },
        data: {
          stripeCustomerId: customerId,
          stripeSubscriptionId: null,
          stripePriceId: null,
          status: "TRIALING" satisfies SubStatus,
          trialEndsAt: graceTrialEnd(sub.trialEndsAt, graceDays, now),
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
        },
      });
    });
  }

  // Club members: the live customer is created lazily at checkout, so just clear test ids.
  const members = await db.memberSubscription.findMany({
    where: { OR: [{ stripeCustomerId: { not: null } }, { stripeSubscriptionId: { not: null } }] },
  });
  // `{ not: null }` may also match never-written fields on Mongo; re-check here.
  for (const sub of members.filter((m) => m.stripeCustomerId || m.stripeSubscriptionId)) {
    await attempt("member subscription", sub.id, async () => {
      const live = sub.stripeCustomerId
        ? await target.customerExists(sub.stripeCustomerId)
        : await target.subscriptionExists(sub.stripeSubscriptionId!);
      if (live) {
        report.members.alreadyLive++;
        return;
      }
      report.members.migrated++;
      if (!apply) return;
      await db.memberSubscription.update({
        where: { id: sub.id },
        data: {
          stripeCustomerId: null,
          stripeSubscriptionId: null,
          status: "TRIALING" satisfies SubStatus,
          trialEndsAt: graceTrialEnd(sub.trialEndsAt, graceDays, now),
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
          remindersSent: [],
        },
      });
    });
  }

  // Coaching add-on: a paid (test) coaching sub goes back to "accepted, awaiting payment".
  const coaching = await db.memberCoaching.findMany({ where: { stripeSubscriptionId: { not: null } } });
  for (const row of coaching.filter((c) => c.stripeSubscriptionId)) {
    await attempt("member coaching", row.id, async () => {
      if (await target.subscriptionExists(row.stripeSubscriptionId!)) {
        report.coaching.alreadyLive++;
        return;
      }
      report.coaching.migrated++;
      if (!apply) return;
      const paid = row.status === "ACTIVE" || row.status === "PAST_DUE";
      await db.memberCoaching.update({
        where: { id: row.id },
        data: {
          stripeSubscriptionId: null,
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
          ...(paid ? { status: "ACCEPTED" } : {}),
        },
      });
    });
  }

  return report;
}
