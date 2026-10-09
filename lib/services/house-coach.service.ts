import { clerkClient } from "@clerk/nextjs/server";
import type { Organization, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getOrgType } from "@/lib/org-capabilities";
import { emailFrom } from "@/lib/email/send";
import { ClubError } from "@/lib/services/club-error";

export const HOUSE_COACH_FIRST_NAME = "Coach";

/** `Name <a@b.com>` or `a@b.com` → `b.com`. */
function senderDomain(): string {
  const from = emailFrom();
  const address = /<([^<>\s]+)>\s*$/.exec(from)?.[1] ?? from.trim();
  return address.slice(address.lastIndexOf("@") + 1);
}

/** Synthetic, never-emailed address; `+<org>` keeps it unique per club. */
export function houseCoachEmail(clerkOrgId: string): string {
  return `house-coach+${clerkOrgId.toLowerCase()}@${senderDomain()}`;
}

function isAlreadyMemberError(err: unknown): boolean {
  const errors = (err as { errors?: { code?: string }[] } | null)?.errors;
  return !!errors?.some((e) => e.code === "already_a_member_in_organization");
}

function clubLogoUrl(org: Organization): string | null {
  return org.brandMarkUrl ?? org.brandLogoOnLightUrl ?? null;
}

/**
 * Idempotent: creates (or finishes creating) the club's house coach: Clerk user,
 * DB user, org membership and the `houseCoachUserId` link.
 */
export async function ensureHouseCoach(org: Organization): Promise<User> {
  if (getOrgType(org) !== "CLUB") throw new ClubError("not_found", "Not a club.");
  if (org.houseCoachUserId) {
    const existing = await prisma.user.findUnique({ where: { id: org.houseCoachUserId } });
    if (existing) return existing;
  }
  const client = await clerkClient();
  const externalId = `house-coach:${org.clerkOrgId}`;
  // Reuse a Clerk user left by a crashed earlier attempt.
  const found = await client.users.getUserList({ externalId: [externalId], limit: 1 });
  const clerkUser =
    found.data[0] ??
    (await client.users.createUser({
      externalId,
      emailAddress: [houseCoachEmail(org.clerkOrgId)],
      firstName: HOUSE_COACH_FIRST_NAME,
      lastName: org.name,
      skipPasswordRequirement: true,
      publicMetadata: { houseCoach: true, clerkOrgId: org.clerkOrgId },
    }));
  const user = await prisma.user.upsert({
    where: { clerkId: clerkUser.id },
    update: {},
    create: {
      clerkId: clerkUser.id,
      email: houseCoachEmail(org.clerkOrgId),
      firstName: HOUSE_COACH_FIRST_NAME,
      lastName: org.name,
      imageUrl: clubLogoUrl(org) ?? clerkUser.imageUrl,
      role: "TRAINER",
      clerkOrgId: org.clerkOrgId,
      onboarded: true,
    },
  });
  try {
    await client.organizations.createOrganizationMembership({
      organizationId: org.clerkOrgId,
      userId: clerkUser.id,
      role: "org:admin",
    });
  } catch (err) {
    if (!isAlreadyMemberError(err)) throw err;
  }
  await prisma.organization.update({ where: { id: org.id }, data: { houseCoachUserId: user.id } });
  return user;
}

/** The club's house coach, or null for non-clubs / clubs without one yet. */
export async function getHouseCoach(clerkOrgId: string): Promise<User | null> {
  const org = await prisma.organization.findUnique({ where: { clerkOrgId } });
  if (!org || getOrgType(org) !== "CLUB" || !org.houseCoachUserId) return null;
  return prisma.user.findUnique({ where: { id: org.houseCoachUserId } });
}

/** The club's house coach, created on demand. */
export async function requireHouseCoach(clerkOrgId: string): Promise<User> {
  const org = await prisma.organization.findUnique({ where: { clerkOrgId } });
  if (!org || getOrgType(org) !== "CLUB") throw new ClubError("not_found", "Not a club.");
  return ensureHouseCoach(org);
}

export async function isHouseCoach(
  user: Pick<User, "id" | "clerkOrgId">,
  org?: Organization | null,
): Promise<boolean> {
  const resolved =
    org ??
    (user.clerkOrgId
      ? await prisma.organization.findUnique({ where: { clerkOrgId: user.clerkOrgId } })
      : null);
  return !!resolved?.houseCoachUserId && resolved.houseCoachUserId === user.id;
}

/** Pushes "Coach <club name>" and the club logo to Clerk and the DB. */
export async function syncHouseCoachProfile(org: Organization): Promise<void> {
  if (!org.houseCoachUserId) return;
  const user = await prisma.user.findUnique({ where: { id: org.houseCoachUserId } });
  if (!user) return;
  const client = await clerkClient();
  const names = { firstName: HOUSE_COACH_FIRST_NAME, lastName: org.name };
  await client.users.updateUser(user.clerkId, names);
  const logo = clubLogoUrl(org);
  if (logo) {
    // Best effort: a failed logo fetch must not block the name sync.
    try {
      const res = await fetch(logo);
      if (res.ok) {
        await client.users.updateUserProfileImage(user.clerkId, { file: await res.blob() });
      }
    } catch {
      /* keep the previous Clerk image */
    }
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { ...names, ...(logo ? { imageUrl: logo } : {}) },
  });
}
