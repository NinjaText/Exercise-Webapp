import { clerkClient } from "@clerk/nextjs/server";
import type { Organization, OrgType, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { getOrgType } from "@/lib/org-capabilities";
import { normalizeJoinCode } from "@/lib/clubs/join-token";
import { getProgramSchedulingType } from "@/lib/utils/program-scheduling";

export type ClubErrorCode =
  | "invalid_input" | "slug_taken" | "price_invalid" | "starter_invalid" | "has_clients" | "not_found";

export class ClubError extends Error {
  constructor(public code: ClubErrorCode, message?: string) {
    super(message ?? code);
    this.name = "ClubError";
  }
}

export interface ClubInput {
  name: string;
  joinSlug: string;
  joinCode: string;
  trialDays: number;
  stripePriceId: string;
  starterProgramIds: string[];
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function parseClubInput(raw: Record<string, unknown>): ClubInput {
  const name = String(raw.name ?? "").trim();
  const joinSlug = String(raw.joinSlug ?? "").trim().toLowerCase();
  const joinCode = normalizeJoinCode(String(raw.joinCode ?? ""));
  const trialDays = Number(raw.trialDays);
  const stripePriceId = String(raw.stripePriceId ?? "").trim();
  const starterProgramIds = Array.isArray(raw.starterProgramIds)
    ? raw.starterProgramIds.map(String).filter(Boolean)
    : [];

  if (!name || name.length > 120) throw new ClubError("invalid_input", "Name is required (max 120 chars).");
  if (!SLUG_RE.test(joinSlug) || joinSlug.length > 60)
    throw new ClubError("invalid_input", "Join link may use lowercase letters, numbers and dashes.");
  if (!/^[A-Z0-9-]{4,32}$/.test(joinCode))
    throw new ClubError("invalid_input", "Access code must be 4–32 letters, numbers or dashes.");
  if (!Number.isInteger(trialDays) || trialDays < 1 || trialDays > 365)
    throw new ClubError("invalid_input", "Trial must be 1–365 days.");
  if (!stripePriceId.startsWith("price_"))
    throw new ClubError("invalid_input", "Stripe price id must start with price_.");
  if (starterProgramIds.length === 0 || new Set(starterProgramIds).size !== starterProgramIds.length)
    throw new ClubError("invalid_input", "Pick at least one starter program (no duplicates).");

  return { name, joinSlug, joinCode, trialDays, stripePriceId, starterProgramIds };
}

async function assertSlugFree(joinSlug: string, exceptClerkOrgId?: string) {
  const clash = await prisma.organization.findFirst({
    where: { joinSlug, ...(exceptClerkOrgId ? { clerkOrgId: { not: exceptClerkOrgId } } : {}) },
    select: { id: true },
  });
  if (clash) throw new ClubError("slug_taken", "That join link is already used by another club.");
}

async function assertPrice(stripePriceId: string) {
  try {
    const price = await stripe.prices.retrieve(stripePriceId);
    if (!price.active || !price.recurring) throw new Error("not an active recurring price");
  } catch {
    throw new ClubError("price_invalid", "Stripe price must exist, be active and recurring.");
  }
}

async function assertStarters(ids: string[]) {
  const programs = await prisma.program.findMany({
    where: { id: { in: ids } },
    select: { id: true, isGlobal: true, schedulingType: true },
  });
  const ok =
    programs.length === ids.length &&
    programs.every((p) => p.isGlobal && getProgramSchedulingType(p) === "SCHEDULED");
  if (!ok) throw new ClubError("starter_invalid", "Starter programs must be scheduled Global Programs.");
}

function clubData(input: ClubInput) {
  return {
    name: input.name,
    joinSlug: input.joinSlug,
    joinCode: input.joinCode,
    trialDays: input.trialDays,
    stripePriceId: input.stripePriceId,
    starterProgramIds: input.starterProgramIds,
  };
}

/**
 * Creates the Clerk org and its CLUB row. No `createdBy`: that would make the
 * admin a member, and the organizationMembership.created webhook would then
 * move the admin's own DB user into the club.
 */
export async function createClub(input: ClubInput): Promise<Organization> {
  await assertSlugFree(input.joinSlug);
  await assertPrice(input.stripePriceId);
  await assertStarters(input.starterProgramIds);

  const client = await clerkClient();
  // 0 = no membership cap on this org. Confirm the Clerk plan allows it.
  const clerkOrg = await client.organizations.createOrganization({ name: input.name, maxAllowedMemberships: 0 });
  try {
    return await prisma.organization.create({
      // Branding on from day one: with no color/logo set, `resolveBranding`
      // keeps the product look and shows the club's name on /join, /billing
      // and trial emails.
      data: { clerkOrgId: clerkOrg.id, type: "CLUB", brandingEnabled: true, ...clubData(input) },
    });
  } catch (err) {
    await client.organizations.deleteOrganization(clerkOrg.id).catch(() => {});
    throw err;
  }
}

/** Edits apply to future joiners only; existing trials keep their end date. */
export async function updateClub(clerkOrgId: string, input: ClubInput): Promise<Organization> {
  const org = await prisma.organization.findUnique({ where: { clerkOrgId } });
  if (!org || getOrgType(org) !== "CLUB") throw new ClubError("not_found");
  await assertSlugFree(input.joinSlug, clerkOrgId);
  await assertPrice(input.stripePriceId);
  await assertStarters(input.starterProgramIds);
  if (org.name !== input.name) {
    const client = await clerkClient();
    await client.organizations.updateOrganization(clerkOrgId, { name: input.name });
  }
  return prisma.organization.update({ where: { clerkOrgId }, data: clubData(input) });
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
}

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
  return orgs.map((org) => {
    const rows = groups.filter((g) => g.clerkOrgId === org.clerkOrgId);
    const count = (s: string) => rows.find((r) => r.status === s)?._count._all ?? 0;
    const members = rows.reduce((n, r) => n + r._count._all, 0);
    const expired = expiredGroups.find((g) => g.clerkOrgId === org.clerkOrgId)?._count._all ?? 0;
    const trialing = count("TRIALING") - expired;
    const paying = count("ACTIVE") + count("PAST_DUE");
    const decided = members - trialing;
    return { org, members, trialing, expired, paying, conversionRate: decided > 0 ? paying / decided : null };
  });
}

/** The TRAINER user that owns every club program copy (env PLATFORM_STAFF_EMAIL). */
export async function getPlatformStaffUser(): Promise<User> {
  const email = process.env.PLATFORM_STAFF_EMAIL?.trim().toLowerCase();
  if (!email) throw new Error("PLATFORM_STAFF_EMAIL is not set");
  const user = await prisma.user.findFirst({ where: { email, role: "TRAINER" } });
  if (!user) throw new Error(`Platform staff user ${email} not found (must be a TRAINER)`);
  return user;
}
