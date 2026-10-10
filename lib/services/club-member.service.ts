import { clerkClient } from "@clerk/nextjs/server";
import type { Organization, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { duplicateProgram, assignProgram, assignOnDemandProgram } from "@/lib/services/program.service";
import { requireHouseCoach } from "@/lib/services/house-coach.service";
import { getOrgType } from "@/lib/org-capabilities";
import { nextStarterTemplateId, OPEN_SESSION_STATUSES } from "@/lib/clubs/starter-progression";

const DAY_MS = 24 * 60 * 60 * 1000;

export type EnrollResult = { ok: true; userId: string } | { ok: false; reason: "other_account" };

/** A trainer, or a client already attached to a different org. */
function isOtherAccount(user: Pick<User, "role" | "clerkOrgId">, club: Organization): boolean {
  return user.role === "TRAINER" || Boolean(user.clerkOrgId && user.clerkOrgId !== club.clerkOrgId);
}

/**
 * Adds a freshly signed-up (or returning) Clerk user to a club: Clerk
 * membership, CLIENT row, trial. Runs synchronously on /join/[slug]/complete so
 * the member never lands in the app before their row exists. Safe to repeat.
 *
 * A person belongs to exactly one org (User.clerkOrgId), so anyone already
 * attached elsewhere — a trainer, or a client of another org — is refused and
 * nothing is changed.
 */
export async function enrollClubMember(args: { clerkUserId: string; club: Organization }): Promise<EnrollResult> {
  const { clerkUserId, club } = args;
  const existing = await prisma.user.findUnique({ where: { clerkId: clerkUserId } });
  if (existing && isOtherAccount(existing, club)) {
    return { ok: false, reason: "other_account" };
  }

  const client = await clerkClient();
  const memberships = await client.users.getOrganizationMembershipList({ userId: clerkUserId });
  const alreadyMember = memberships.data.some((m) => m.organization.id === club.clerkOrgId);
  if (!alreadyMember) {
    await client.organizations.createOrganizationMembership({
      organizationId: club.clerkOrgId,
      userId: clerkUserId,
      role: "org:member",
    });
  }

  const clerkUser = await client.users.getUser(clerkUserId);
  const email =
    clerkUser.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId)?.emailAddress ??
    clerkUser.emailAddresses[0]?.emailAddress;
  if (!email) throw new Error(`Clerk user ${clerkUserId} has no email`);

  let user: { id: string };
  try {
    user = await prisma.user.upsert({
      where: { clerkId: clerkUserId },
      update: { clerkOrgId: club.clerkOrgId },
      create: {
        clerkId: clerkUserId,
        email,
        firstName: clerkUser.firstName ?? "",
        lastName: clerkUser.lastName ?? "",
        imageUrl: clerkUser.imageUrl,
        role: "CLIENT",
        clerkOrgId: club.clerkOrgId,
        onboarded: false,
      },
    });
  } catch (err) {
    // Mongo upserts aren't atomic: the Clerk membership webhook can create the
    // same clerkId between our find and insert. Re-read and carry on.
    if ((err as { code?: string }).code !== "P2002") throw err;
    const raced = await prisma.user.findUnique({ where: { clerkId: clerkUserId } });
    if (!raced) throw err;
    if (isOtherAccount(raced, club)) return { ok: false, reason: "other_account" };
    user = await prisma.user.update({ where: { clerkId: clerkUserId }, data: { clerkOrgId: club.clerkOrgId } });
  }

  await ensureMemberSubscription(user.id, club);
  return { ok: true, userId: user.id };
}

/** Creates the trial once. Never resets `trialEndsAt` for an existing row. */
export async function ensureMemberSubscription(userId: string, club: Organization, now = new Date()): Promise<void> {
  const existing = await prisma.memberSubscription.findUnique({ where: { userId }, select: { id: true } });
  if (existing) return;
  const trialDays = club.trialDays ?? 14;
  try {
    await prisma.memberSubscription.create({
      data: {
        userId,
        clerkOrgId: club.clerkOrgId,
        status: "TRIALING",
        trialEndsAt: new Date(now.getTime() + trialDays * DAY_MS),
        // Explicit nulls, not omitted: Mongo `{ field: null }` filters miss unwritten fields.
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        currentPeriodEnd: null,
      },
    });
  } catch (err) {
    // A concurrent enrollment (double submit / webhook) won the unique race.
    if ((err as { code?: string }).code !== "P2002") throw err;
  }
}

/**
 * Gives a member a copy of every club Resource they don't have yet. Resources
 * never finish, so unlike starters they are all handed out at once — and a
 * resource added to the club later reaches existing members on the next
 * sweep. Runs under the starter claim so concurrent callers can't each make a
 * copy. A failing resource is logged and retried next sweep rather than
 * blocking the member's starter programs.
 */
async function assignMissingClubResources(userId: string, club: Organization): Promise<void> {
  const ids = club.resourceProgramIds ?? [];
  if (ids.length === 0) return;
  const have = await prisma.program.findMany({
    where: { clientId: userId, sourceTemplateId: { in: ids } },
    select: { sourceTemplateId: true },
  });
  const owned = new Set(have.map((p) => p.sourceTemplateId));
  const missing = ids.filter((id) => !owned.has(id));
  if (missing.length === 0) return;

  // Copies belong to the club's house coach (D6).
  const trainer = await requireHouseCoach(club.clerkOrgId);
  for (const id of missing) {
    let copyId: string | null = null;
    try {
      const copy = await duplicateProgram(id, trainer.id, false);
      copyId = copy.id;
      await assignOnDemandProgram(copy.id, userId);
    } catch (err) {
      console.error("Failed to give club resource", id, "to member", userId, err);
      if (copyId) await prisma.program.delete({ where: { id: copyId } }).catch(() => {});
    }
  }
}

export type StarterOutcome = "assigned" | "in_progress" | "done" | "skipped";

/**
 * How long an ASSIGNING claim is honoured. Cloning can take ~20s; a claim older
 * than this belongs to a crashed worker and may be taken over.
 */
const CLAIM_STALE_MS = 10 * 60 * 1000;

/**
 * Gives a member their next starter program if their current one is finished.
 * Copy first, then assign — `assignProgram` mutates the program it is given, so
 * a template must never be assigned directly.
 *
 * An atomic ASSIGNING claim keeps concurrent callers (double submit, `after()`
 * job, overlapping sweeps) from each cloning a copy. Every exit after the claim
 * writes a final status, which also bumps `updatedAt` and rotates the sweep.
 */
export async function assignNextStarterProgram(userId: string): Promise<StarterOutcome> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.clerkOrgId || user.role !== "CLIENT") return "skipped";
  const club = await prisma.organization.findUnique({ where: { clerkOrgId: user.clerkOrgId } });
  if (!club || getOrgType(club) !== "CLUB") return "skipped";

  const claimed = await prisma.memberSubscription.updateMany({
    where: {
      userId,
      OR: [{ starterStatus: { not: "ASSIGNING" } }, { updatedAt: { lt: new Date(Date.now() - CLAIM_STALE_MS) } }],
    },
    data: { starterStatus: "ASSIGNING" },
  });
  if (claimed.count === 0) return "in_progress";

  try {
    await assignMissingClubResources(userId, club);

    const copies = await prisma.program.findMany({
      where: { clientId: userId, sourceTemplateId: { in: club.starterProgramIds } },
      select: { id: true, sourceTemplateId: true },
    });

    if (copies.length > 0) {
      const open = await prisma.workoutSessionV2.count({
        where: {
          clientId: userId,
          status: { in: [...OPEN_SESSION_STATUSES] },
          workout: { programId: { in: copies.map((c) => c.id) } },
        },
      });
      if (open > 0) {
        await prisma.memberSubscription.update({ where: { userId }, data: { starterStatus: "ASSIGNED" } });
        return "in_progress";
      }
    }

    const next = nextStarterTemplateId(
      club.starterProgramIds,
      copies.map((c) => c.sourceTemplateId).filter((id): id is string => Boolean(id))
    );
    if (!next) {
      await prisma.memberSubscription.update({ where: { userId }, data: { starterStatus: "ASSIGNED" } });
      return "done";
    }

    // Copies belong to the club's house coach (D6).
    const trainer = await requireHouseCoach(club.clerkOrgId);
    const copy = await duplicateProgram(next, trainer.id, false);
    try {
      await assignProgram(copy.id, userId, new Date());
    } catch (err) {
      // Don't leave an unassigned copy behind for every retry.
      try {
        await prisma.program.delete({ where: { id: copy.id } });
      } catch (deleteErr) {
        console.error("Failed to delete orphaned starter copy", copy.id, deleteErr);
      }
      throw err;
    }
    await prisma.memberSubscription.update({ where: { userId }, data: { starterStatus: "ASSIGNED" } });
    return "assigned";
  } catch (err) {
    try {
      await prisma.memberSubscription.update({ where: { userId }, data: { starterStatus: "FAILED" } });
    } catch {
      // Best effort: the original error is what the caller needs.
    }
    throw err;
  }
}

/** How many members are processed per sweep run (each may clone for ~20s). */
const SWEEP_BATCH = 5;
/** Leave freshly-joined members to the `after()` job for a moment. */
const PENDING_GRACE_MS = 2 * 60 * 1000;
/**
 * No new batch starts after this much wall time, so a run finishes well inside
 * the route's `maxDuration = 300` instead of being killed mid-clone. Members
 * not reached are picked up next run (oldest `updatedAt` first).
 */
const SWEEP_TIME_BUDGET_MS = 240_000;

/**
 * Cron body: retries PENDING/FAILED first assignments and advances members
 * whose current starter program is finished. Idempotent. Trials that have
 * ended are skipped (the billing gate is date-based, so their status stays
 * TRIALING); ACTIVE members are always included.
 */
export async function sweepClubStarterPrograms(now = new Date(), clock: () => number = Date.now) {
  const startedAt = clock();
  const subs = await prisma.memberSubscription.findMany({
    where: {
      AND: [{ OR: [{ status: "ACTIVE" }, { status: "TRIALING", trialEndsAt: { gte: now } }] }],
      OR: [
        { starterStatus: { in: ["PENDING", "FAILED"] }, updatedAt: { lt: new Date(now.getTime() - PENDING_GRACE_MS) } },
        { starterStatus: "ASSIGNED" },
        { starterStatus: "ASSIGNING", updatedAt: { lt: new Date(now.getTime() - CLAIM_STALE_MS) } },
      ],
    },
    select: { userId: true },
    orderBy: { updatedAt: "asc" },
    take: 200,
  });

  let processed = 0;
  let assigned = 0;
  let failed = 0;
  let stoppedEarly = false;
  for (let i = 0; i < subs.length; i += SWEEP_BATCH) {
    if (clock() - startedAt > SWEEP_TIME_BUDGET_MS) {
      stoppedEarly = true;
      break;
    }
    const batch = subs.slice(i, i + SWEEP_BATCH);
    const results = await Promise.allSettled(batch.map((s) => assignNextStarterProgram(s.userId)));
    processed += batch.length;
    for (const r of results) {
      if (r.status === "rejected") failed += 1;
      else if (r.value === "assigned") assigned += 1;
    }
  }
  return { processed, assigned, failed, stoppedEarly };
}
