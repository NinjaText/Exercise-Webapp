import { clerkClient } from "@clerk/nextjs/server";
import type { Organization, OrgType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getOrgType } from "@/lib/org-capabilities";
import { normalizeJoinCode } from "@/lib/clubs/join-token";
import { getProgramSchedulingType } from "@/lib/utils/program-scheduling";
import { ClubError } from "@/lib/services/club-error";
import { parseDollarsToCents } from "@/lib/utils/money";
import {
  disableClubPrice,
  ensureClubPrice,
  renameClubProducts,
  rollbackClubPrices,
  type ClubPriceKind,
  type EnsuredClubPrice,
} from "@/lib/services/club-pricing.service";
import {
  assertTrainerEmailFree,
  getClubTrainer,
  getPendingTrainerInvite,
  inviteClubTrainer,
  normalizeTrainerEmail,
} from "@/lib/services/club-trainer.service";

export { ClubError, type ClubErrorCode } from "@/lib/services/club-error";

/**
 * Edit only: the form couldn't show the current price (Stripe unreadable, or
 * not a USD monthly price) and the admin left the field empty, so the stored
 * price stays as is. Empty never means "remove" in that case.
 */
export const KEEP_PRICE = "keep" as const;
export type KeepPrice = typeof KEEP_PRICE;

export interface ClubInput {
  name: string;
  joinSlug: string;
  joinCode: string;
  trialDays: number;
  /** USD cents per month; we create the Stripe price (stored as `stripePriceId`). */
  membershipAmountCents: number;
  starterProgramIds: string[];
  /** Unordered; every member gets all of them at once. May be empty. */
  resourceProgramIds: string[];
  /** Create only: the invited club trainer. Never edited via updateClub. */
  trainerEmail: string;
  /** USD cents per month for the coaching add-on; null = coaching not offered. */
  coachingAmountCents: number | null;
}

export type ClubUpdateInput = Omit<ClubInput, "trainerEmail" | "membershipAmountCents" | "coachingAmountCents"> & {
  membershipAmountCents: number | KeepPrice;
  coachingAmountCents: number | null | KeepPrice;
};

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MIN_CENTS = 100;
const MAX_CENTS = 1_000_000;

/** "" -> null; otherwise integer cents in [$1, $10,000] or a ClubError. */
function parseAmount(raw: unknown, label: string): number | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const cents = parseDollarsToCents(text);
  if (cents === null) throw new ClubError("invalid_input", `${label} must be a dollar amount like 14.99.`);
  if (cents < MIN_CENTS || cents > MAX_CENTS)
    throw new ClubError("invalid_input", `${label} must be between $1 and $10,000.`);
  return cents;
}

function requiredMembership(raw: unknown): number {
  const cents = parseAmount(raw, "Membership price");
  if (cents === null) throw new ClubError("invalid_input", "Membership price is required.");
  return cents;
}

/** Create form: everything, including the required club trainer email. */
export function parseClubInput(raw: Record<string, unknown>): ClubInput {
  const settings = parseClubSettings(raw);
  const membershipAmountCents = requiredMembership(raw.membershipAmount);
  const starterProgramIds = parseStarters(raw);
  const resourceProgramIds = parseResources(raw);
  const coachingAmountCents = parseAmount(raw.coachingAmount, "Coaching price");
  const trainerEmail = normalizeTrainerEmail(String(raw.trainerEmail ?? ""));
  return { ...settings, membershipAmountCents, starterProgramIds, resourceProgramIds, trainerEmail, coachingAmountCents };
}

/**
 * Edit form: the trainer email is managed separately, so it isn't read here.
 * `keepMembershipPrice` / `keepCoachingPrice` with an empty field = KEEP_PRICE.
 */
export function parseClubUpdateInput(raw: Record<string, unknown>): ClubUpdateInput {
  const settings = parseClubSettings(raw);
  const isEmpty = (v: unknown) => !String(v ?? "").trim();
  const membershipAmountCents =
    raw.keepMembershipPrice === true && isEmpty(raw.membershipAmount) ? KEEP_PRICE : requiredMembership(raw.membershipAmount);
  const starterProgramIds = parseStarters(raw);
  const resourceProgramIds = parseResources(raw);
  const coachingAmountCents =
    raw.keepCoachingPrice === true && isEmpty(raw.coachingAmount)
      ? KEEP_PRICE
      : parseAmount(raw.coachingAmount, "Coaching price");
  return { ...settings, membershipAmountCents, starterProgramIds, resourceProgramIds, coachingAmountCents };
}

function parseClubSettings(raw: Record<string, unknown>) {
  const name = String(raw.name ?? "").trim();
  const joinSlug = String(raw.joinSlug ?? "").trim().toLowerCase();
  const joinCode = normalizeJoinCode(String(raw.joinCode ?? ""));
  const trialDays = Number(raw.trialDays);

  if (!name || name.length > 120) throw new ClubError("invalid_input", "Name is required (max 120 chars).");
  if (!SLUG_RE.test(joinSlug) || joinSlug.length > 60)
    throw new ClubError("invalid_input", "Join link may use lowercase letters, numbers and dashes.");
  if (!/^[A-Z0-9-]{4,32}$/.test(joinCode))
    throw new ClubError("invalid_input", "Access code must be 4–32 letters, numbers or dashes.");
  if (!Number.isInteger(trialDays) || trialDays < 1 || trialDays > 365)
    throw new ClubError("invalid_input", "Trial must be 1–365 days.");
  return { name, joinSlug, joinCode, trialDays };
}

function parseStarters(raw: Record<string, unknown>): string[] {
  const starterProgramIds = Array.isArray(raw.starterProgramIds)
    ? raw.starterProgramIds.map(String).filter(Boolean)
    : [];
  if (starterProgramIds.length === 0 || new Set(starterProgramIds).size !== starterProgramIds.length)
    throw new ClubError("invalid_input", "Pick at least one starter program (no duplicates).");
  return starterProgramIds;
}

function parseResources(raw: Record<string, unknown>): string[] {
  const resourceProgramIds = Array.isArray(raw.resourceProgramIds)
    ? raw.resourceProgramIds.map(String).filter(Boolean)
    : [];
  if (new Set(resourceProgramIds).size !== resourceProgramIds.length)
    throw new ClubError("invalid_input", "Each resource can only be added once.");
  return resourceProgramIds;
}

async function assertSlugFree(joinSlug: string, exceptClerkOrgId?: string) {
  const clash = await prisma.organization.findFirst({
    where: { joinSlug, ...(exceptClerkOrgId ? { clerkOrgId: { not: exceptClerkOrgId } } : {}) },
    select: { id: true },
  });
  if (clash) throw new ClubError("slug_taken", "That join link is already used by another club.");
}

/**
 * Club programs are Global Programs or the club trainer's own templates (D7):
 * starters are always Scheduled, resources always On-Demand. With no trainer
 * yet (create), Global only. A template is any program with no client.
 *
 * `alreadyOnClub`: the club's current ids of that kind. They were validated
 * when set, so keeping them unchanged passes the ownership rule even while the
 * club has no trainer (between Replace and the new trainer accepting), so an
 * admin can still edit the club. They must still exist and be the right type.
 */
async function assertClubPrograms(
  kind: "starter" | "resource",
  ids: string[],
  clubTrainerId: string | null,
  alreadyOnClub: string[] = []
) {
  if (ids.length === 0) return;
  const programs = await prisma.program.findMany({
    where: { id: { in: ids } },
    select: { id: true, isGlobal: true, trainerId: true, clientId: true, schedulingType: true },
  });
  const type = kind === "starter" ? "SCHEDULED" : "ON_DEMAND";
  const allowed = (p: (typeof programs)[number]) =>
    p.isGlobal ||
    alreadyOnClub.includes(p.id) ||
    (clubTrainerId !== null && p.trainerId === clubTrainerId && p.clientId == null);
  const ok =
    programs.length === ids.length && programs.every((p) => allowed(p) && getProgramSchedulingType(p) === type);
  if (!ok) {
    throw new ClubError(
      "starter_invalid",
      kind === "starter"
        ? "Starter programs must be scheduled Global Programs or the club trainer's own templates."
        : "Resources must be Global or club trainer Resources (not scheduled programs)."
    );
  }
}

function clubData(input: ClubUpdateInput, prices: { stripePriceId: string; coachingStripePriceId: string | null }) {
  return {
    name: input.name,
    joinSlug: input.joinSlug,
    joinCode: input.joinCode,
    trialDays: input.trialDays,
    starterProgramIds: input.starterProgramIds,
    resourceProgramIds: input.resourceProgramIds,
    ...prices,
  };
}

/** Archives replaced prices, unless another club still points at one (a shared pasted price). */
async function archiveReplacedPrices(clerkOrgId: string, priceIds: string[]) {
  for (const id of priceIds) {
    try {
      const usedElsewhere = await prisma.organization.count({
        where: { clerkOrgId: { not: clerkOrgId }, OR: [{ stripePriceId: id }, { coachingStripePriceId: id }] },
      });
      if (usedElsewhere === 0) await disableClubPrice(id);
    } catch (err) {
      // Leaving an old price active is harmless; never fail a saved edit over it.
      console.error("[club] couldn't check/archive replaced price", id, err);
    }
  }
}

async function deleteClerkOrg(client: Awaited<ReturnType<typeof clerkClient>>, clerkOrgId: string) {
  try {
    await client.organizations.deleteOrganization(clerkOrgId);
  } catch (err) {
    console.error("[club] rollback couldn't delete Clerk org; delete it by hand:", clerkOrgId, err);
  }
}

/**
 * Creates the Clerk org, its Stripe prices and its CLUB row, then invites the
 * club trainer. No `createdBy`: that would make the admin a member, and the
 * organizationMembership.created webhook would then move the admin's own DB
 * user into the club. Every check (including the trainer email, D4) runs
 * before anything is created. The Clerk org comes before the prices so their
 * metadata carries its id; any later failure archives the prices (and their
 * new products) and deletes the org.
 */
export async function createClub(input: ClubInput): Promise<Organization> {
  await assertSlugFree(input.joinSlug);
  await assertTrainerEmailFree(input.trainerEmail);
  await assertClubPrograms("starter", input.starterProgramIds, null);
  await assertClubPrograms("resource", input.resourceProgramIds, null);

  const client = await clerkClient();
  // 0 = no membership cap on this org. Confirm the Clerk plan allows it.
  const clerkOrg = await client.organizations.createOrganization({ name: input.name, maxAllowedMemberships: 0 });
  const created: EnsuredClubPrice[] = [];
  const price = async (kind: ClubPriceKind, amountCents: number) => {
    const r = await ensureClubPrice({
      clerkOrgId: clerkOrg.id, clubName: input.name, kind, amountCents, currentPriceId: null,
    });
    created.push(r);
    return r.priceId;
  };
  let org: Organization;
  try {
    const stripePriceId = await price("membership", input.membershipAmountCents);
    const coachingStripePriceId =
      input.coachingAmountCents === null ? null : await price("coaching", input.coachingAmountCents);
    org = await prisma.organization.create({
      // Branding on from day one: with no color/logo set, `resolveBranding`
      // keeps the product look and shows the club's name on /join, /billing
      // and trial emails.
      data: {
        clerkOrgId: clerkOrg.id,
        type: "CLUB",
        brandingEnabled: true,
        ...clubData(input, { stripePriceId, coachingStripePriceId }),
      },
    });
  } catch (err) {
    await rollbackClubPrices(created);
    await deleteClerkOrg(client, clerkOrg.id);
    throw err;
  }

  try {
    await inviteClubTrainer(clerkOrg.id, input.trainerEmail);
  } catch (err) {
    console.error("Club trainer invite failed; rolling back club", clerkOrg.id, err);
    await prisma.organization.delete({ where: { clerkOrgId: clerkOrg.id } }).catch(() => {});
    await deleteClerkOrg(client, clerkOrg.id);
    await rollbackClubPrices(created);
    if (err instanceof ClubError && err.code === "trainer_email_taken") throw err;
    throw new ClubError("trainer_invite_failed", "Couldn't send the club trainer invitation, so the club wasn't created.");
  }
  return org;
}

/**
 * Edits apply to future joiners only; existing trials keep their end date and
 * existing subscriptions stay on the price they started on (archiving a price
 * doesn't touch them). The trainer email isn't edited here (resend / replace
 * own that). New prices are created after every other check; replaced ones
 * are archived only once the DB write succeeded. Any Stripe failure fails the
 * whole edit, so an outage can never drop coaching.
 */
export async function updateClub(clerkOrgId: string, input: ClubUpdateInput): Promise<Organization> {
  const org = await prisma.organization.findUnique({ where: { clerkOrgId } });
  if (!org || getOrgType(org) !== "CLUB") throw new ClubError("not_found");
  await assertSlugFree(input.joinSlug, clerkOrgId);
  const trainer = await getClubTrainer(clerkOrgId);
  await assertClubPrograms("starter", input.starterProgramIds, trainer?.id ?? null, org.starterProgramIds);
  await assertClubPrograms("resource", input.resourceProgramIds, trainer?.id ?? null, org.resourceProgramIds ?? []);
  if (input.membershipAmountCents === KEEP_PRICE && !org.stripePriceId)
    throw new ClubError("invalid_input", "Membership price is required.");

  const created: EnsuredClubPrice[] = [];
  const replaced: string[] = [];
  const price = async (kind: ClubPriceKind, amountCents: number, currentPriceId: string | null) => {
    const r = await ensureClubPrice({
      clerkOrgId, clubName: input.name, kind, amountCents, currentPriceId,
    });
    if (r.created) {
      created.push(r);
      if (r.previousPriceId) replaced.push(r.previousPriceId);
    }
    return r.priceId;
  };

  let updated: Organization;
  try {
    const stripePriceId =
      input.membershipAmountCents === KEEP_PRICE
        ? org.stripePriceId!
        : await price("membership", input.membershipAmountCents, org.stripePriceId ?? null);
    let coachingStripePriceId = org.coachingStripePriceId ?? null;
    if (input.coachingAmountCents === null) {
      if (coachingStripePriceId) replaced.push(coachingStripePriceId);
      coachingStripePriceId = null;
    } else if (input.coachingAmountCents !== KEEP_PRICE) {
      coachingStripePriceId = await price("coaching", input.coachingAmountCents, coachingStripePriceId);
    }
    if (org.name !== input.name) {
      const client = await clerkClient();
      await client.organizations.updateOrganization(clerkOrgId, { name: input.name });
    }
    updated = await prisma.organization.update({
      where: { clerkOrgId },
      data: clubData(input, { stripePriceId, coachingStripePriceId }),
    });
  } catch (err) {
    await rollbackClubPrices(created);
    throw err;
  }

  await archiveReplacedPrices(clerkOrgId, replaced);
  if (org.name !== input.name) {
    const live = [updated.stripePriceId, updated.coachingStripePriceId].filter((id): id is string => Boolean(id));
    await renameClubProducts(live, input.name);
  }
  return updated;
}

/** Type is fixed once the org has clients: switching would break who is billed. */
export async function setOrgType(clerkOrgId: string, type: OrgType): Promise<void> {
  const clients = await prisma.user.count({ where: { clerkOrgId, role: "CLIENT" } });
  if (clients > 0) throw new ClubError("has_clients", "Org type can't change once it has clients.");
  await prisma.organization.update({ where: { clerkOrgId }, data: { type } });
}

export async function getClubBySlug(joinSlug: string): Promise<Organization | null> {
  // Slugs are stored lower-case (parseClubInput), so /join/PineValley still works.
  const org = await prisma.organization.findFirst({ where: { joinSlug: joinSlug.trim().toLowerCase() } });
  return org && getOrgType(org) === "CLUB" ? org : null;
}

export interface ClubStats {
  org: Organization;
  members: number;
  /** TRIALING and still inside the trial window. */
  trialing: number;
  /** TRIALING rows past `trialEndsAt` (the gate is date-based; status never flips). */
  expired: number;
  paying: number;
  /** paying / (members who are past their trial or paying); null when nobody is. */
  conversionRate: number | null;
  /** Members with a paid coaching add-on (ACTIVE, or PAST_DUE and still subscribed). */
  coached: number;
  trainer: ClubTrainerStatus;
}

export type ClubTrainerStatus =
  | { status: "active"; name: string }
  | { status: "pending"; email: string }
  | { status: "none" }
  /** The Clerk invite lookup failed, so pending vs none can't be told. */
  | { status: "unknown" };

export async function listClubsWithStats(now = new Date()): Promise<ClubStats[]> {
  const orgs = await prisma.organization.findMany({ where: { type: "CLUB" }, orderBy: { createdAt: "desc" } });
  const orgIds = { in: orgs.map((o) => o.clerkOrgId) };
  const groups = await prisma.memberSubscription.groupBy({
    by: ["clerkOrgId", "status"],
    where: { clerkOrgId: orgIds },
    _count: { _all: true },
  });
  const expiredGroups = await prisma.memberSubscription.groupBy({
    by: ["clerkOrgId", "status"],
    where: { clerkOrgId: orgIds, status: "TRIALING", trialEndsAt: { lt: now } },
    _count: { _all: true },
  });
  const [coachingGroups, trainers] = await Promise.all([
    prisma.memberCoaching.groupBy({
      by: ["clerkOrgId"],
      where: { clerkOrgId: orgIds, status: { in: ["ACTIVE", "PAST_DUE"] } },
      _count: { _all: true },
    }),
    prisma.user.findMany({
      where: { clerkOrgId: orgIds, role: "TRAINER" },
      select: { clerkOrgId: true, firstName: true, lastName: true, email: true, onboarded: true },
      orderBy: [{ onboarded: "desc" }, { createdAt: "desc" }],
    }),
  ]);
  // Only trainer-less clubs need a Clerk lookup to tell "invite pending" from "none".
  const trainerByOrg = new Map<string, ClubTrainerStatus>();
  for (const t of trainers) {
    if (t.clerkOrgId && !trainerByOrg.has(t.clerkOrgId)) {
      trainerByOrg.set(t.clerkOrgId, {
        status: "active",
        name: [t.firstName, t.lastName].filter(Boolean).join(" ") || t.email,
      });
    }
  }
  await Promise.all(
    orgs
      .filter((o) => !trainerByOrg.has(o.clerkOrgId))
      .map(async (o) => {
        try {
          const invite = await getPendingTrainerInvite(o.clerkOrgId);
          trainerByOrg.set(o.clerkOrgId, invite ? { status: "pending", email: invite.email } : { status: "none" });
        } catch (err) {
          console.error("Club trainer invite lookup failed:", o.clerkOrgId, err);
          trainerByOrg.set(o.clerkOrgId, { status: "unknown" });
        }
      })
  );
  return orgs.map((org) => {
    const rows = groups.filter((g) => g.clerkOrgId === org.clerkOrgId);
    const count = (s: string) => rows.find((r) => r.status === s)?._count._all ?? 0;
    const members = rows.reduce((n, r) => n + r._count._all, 0);
    const expired = expiredGroups.find((g) => g.clerkOrgId === org.clerkOrgId)?._count._all ?? 0;
    const trialing = count("TRIALING") - expired;
    const paying = count("ACTIVE") + count("PAST_DUE");
    const decided = members - trialing;
    return {
      org, members, trialing, expired, paying,
      conversionRate: decided > 0 ? paying / decided : null,
      coached: coachingGroups.find((g) => g.clerkOrgId === org.clerkOrgId)?._count._all ?? 0,
      trainer: trainerByOrg.get(org.clerkOrgId) ?? { status: "none" as const },
    };
  });
}
