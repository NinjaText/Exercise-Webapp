import { clerkClient } from "@clerk/nextjs/server";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { nullOrUnset } from "@/lib/db/mongo-null";
import { isSuperAdminEmail } from "@/lib/auth/super-admin-emails";

/** Registers a super admin for club coaching alerts. Never changes `muted`. */
export async function ensureClubAlertSubscriber(admin: Pick<User, "id" | "email">): Promise<void> {
  await prisma.clubAlertSubscriber.upsert({
    where: { userId: admin.id },
    update: { email: admin.email },
    create: { userId: admin.id, email: admin.email },
  });
}

export async function setClubAlertsMuted(userId: string, muted: boolean): Promise<void> {
  await prisma.clubAlertSubscriber.update({ where: { userId }, data: { muted } });
}

export async function isClubAlertsMuted(userId: string): Promise<boolean> {
  const row = await prisma.clubAlertSubscriber.findUnique({ where: { userId }, select: { muted: true } });
  return row?.muted ?? false;
}

/** Clerk user ids whose publicMetadata.superAdmin is true, or null when Clerk can't be read. */
async function clerkSuperAdminIds(clerkIds: string[]): Promise<Set<string> | null> {
  if (clerkIds.length === 0) return new Set();
  try {
    const client = await clerkClient();
    const { data } = await client.users.getUserList({ userId: clerkIds, limit: clerkIds.length });
    return new Set(
      data.filter((u) => (u.publicMetadata as { superAdmin?: boolean } | null)?.superAdmin === true).map((u) => u.id)
    );
  } catch (err) {
    console.error("[club-alerts] Clerk super admin lookup failed; using SUPER_ADMIN_EMAILS only:", err);
    return null;
  }
}

/**
 * Unmuted subscribers who are still super admins right now (SUPER_ADMIN_EMAILS
 * or Clerk publicMetadata.superAdmin). Rows that fail are deleted; if Clerk
 * can't be read only env-listed admins are returned and nothing is deleted.
 */
export async function getClubAlertRecipients(): Promise<{ userId: string; email: string }[]> {
  const rows = await prisma.clubAlertSubscriber.findMany({
    where: { muted: false },
    select: { userId: true, email: true },
  });
  if (rows.length === 0) return [];

  const users = await prisma.user.findMany({
    where: { id: { in: rows.map((r) => r.userId) } },
    select: { id: true, clerkId: true, email: true },
  });
  const userById = new Map(users.map((u) => [u.id, u]));
  const clerkAdmins = await clerkSuperAdminIds(users.map((u) => u.clerkId));

  const verified: { userId: string; email: string }[] = [];
  const failed: string[] = [];
  for (const row of rows) {
    const user = userById.get(row.userId);
    const ok = !!user && (isSuperAdminEmail(user.email) || !!clerkAdmins?.has(user.clerkId));
    if (ok) verified.push(row);
    else failed.push(row.userId);
  }

  if (clerkAdmins && failed.length > 0) {
    await prisma.clubAlertSubscriber.deleteMany({ where: { userId: { in: failed } } });
  }
  return verified;
}

/**
 * Per-club count of things waiting on the house coach: unread member messages,
 * unreviewed check-in responses and pending coaching requests. One batched
 * query per source across all clubs. Keyed by clerkOrgId; clubs with nothing
 * waiting are present with 0.
 */
export async function getClubAttentionCounts(): Promise<Map<string, number>> {
  const orgs = await prisma.organization.findMany({
    where: { NOT: nullOrUnset("houseCoachUserId") },
    select: { clerkOrgId: true, houseCoachUserId: true },
  });
  const counts = new Map<string, number>(orgs.map((o) => [o.clerkOrgId, 0]));
  if (orgs.length === 0) return counts;

  const orgByCoach = new Map<string, string>();
  for (const o of orgs) if (o.houseCoachUserId) orgByCoach.set(o.houseCoachUserId, o.clerkOrgId);
  const coachIds = [...orgByCoach.keys()];
  const bump = (clerkOrgId: string | undefined, n: number) => {
    if (clerkOrgId) counts.set(clerkOrgId, (counts.get(clerkOrgId) ?? 0) + n);
  };

  const [messages, responses, requests] = await Promise.all([
    prisma.message.groupBy({
      by: ["recipientId"],
      where: { recipientId: { in: coachIds }, isRead: false, isInternal: false, ...nullOrUnset("deletedAt") },
      _count: { _all: true },
    }),
    prisma.checkInResponse.findMany({
      where: { isReviewed: false, assignment: { trainerId: { in: coachIds } } },
      select: { assignment: { select: { trainerId: true } } },
    }),
    prisma.memberCoaching.groupBy({
      by: ["clerkOrgId"],
      where: { clerkOrgId: { in: orgs.map((o) => o.clerkOrgId) }, status: "REQUESTED" },
      _count: { _all: true },
    }),
  ]);

  for (const m of messages) bump(orgByCoach.get(m.recipientId), m._count._all);
  for (const r of responses) bump(orgByCoach.get(r.assignment.trainerId), 1);
  for (const c of requests) bump(c.clerkOrgId, c._count._all);
  return counts;
}

export async function getTotalClubAttention(): Promise<number> {
  const counts = await getClubAttentionCounts();
  let total = 0;
  for (const n of counts.values()) total += n;
  return total;
}
