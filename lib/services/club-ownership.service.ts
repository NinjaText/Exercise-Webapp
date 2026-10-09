import { clerkClient } from "@clerk/nextjs/server";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ClubError } from "@/lib/services/club-error";
import { nullOrUnset } from "@/lib/db/mongo-null";

function isNotFoundError(err: unknown): boolean {
  const e = err as { status?: number; errors?: { code?: string }[] } | null;
  return e?.status === 404 || !!e?.errors?.some((x) => x.code === "resource_not_found");
}

/**
 * Removes a trainer from their org. The membership webhook also nulls
 * `clerkOrgId`; doing it here too means the org reads as trainer-less at once.
 * The account is also deactivated: the removed trainer still owns the org's
 * programs until ownership is transferred, so they must not keep working
 * through program actions in the meantime.
 */
export async function removeOrgTrainer(clerkOrgId: string, trainer: User): Promise<void> {
  const client = await clerkClient();
  try {
    await client.organizations.deleteOrganizationMembership({ organizationId: clerkOrgId, userId: trainer.clerkId });
  } catch (err) {
    // Already gone (e.g. a prior partial run): still deactivate the DB row below.
    if (!isNotFoundError(err)) throw err;
  }
  try {
    await prisma.user.update({ where: { id: trainer.id }, data: { clerkOrgId: null, isActive: false } });
  } catch (err) {
    // The Clerk membership is already gone; the caller must know the DB row is stale.
    console.error("Trainer removed in Clerk but the DB update failed:", { clerkOrgId, trainerId: trainer.id }, err);
    throw new ClubError(
      "trainer_remove_failed",
      "The trainer was removed from the org in Clerk, but their account record could not be updated. Check the account in the database."
    );
  }
}

/**
 * Hands the club to a (new) trainer: members' programs, and the club's
 * non-global starter templates. Starters may only be Global Programs or the
 * house coach's own templates (assertStarters), so any non-global starter not
 * owned by `toTrainerId` was authored by a previous owner. Idempotent.
 */
export async function transferClubOwnership(
  clerkOrgId: string,
  toTrainerId: string
): Promise<{ programs: number; templates: number }> {
  const org = await prisma.organization.findUnique({ where: { clerkOrgId } });
  if (!org) return { programs: 0, templates: 0 };

  const members = await prisma.user.findMany({ where: { clerkOrgId, role: "CLIENT" }, select: { id: true } });
  let programs = 0;
  if (members.length > 0) {
    const res = await prisma.program.updateMany({
      where: { clientId: { in: members.map((m) => m.id) }, NOT: { trainerId: toTrainerId } },
      data: { trainerId: toTrainerId },
    });
    programs = res.count;
  }

  let templates = 0;
  const clubProgramIds = [...org.starterProgramIds, ...(org.resourceProgramIds ?? [])];
  if (clubProgramIds.length > 0) {
    const res = await prisma.program.updateMany({
      where: {
        id: { in: clubProgramIds },
        ...nullOrUnset("clientId"),
        isGlobal: false,
        trainerId: { not: null },
        NOT: { trainerId: toTrainerId },
      },
      data: { trainerId: toTrainerId },
    });
    templates = res.count;
  }
  return { programs, templates };
}
