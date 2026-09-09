import { prisma } from "@/lib/prisma";
import * as programService from "@/lib/services/program.service";
import { getProgramSchedulingType } from "@/lib/utils/program-scheduling";

/**
 * Deferred program assignment for invited-but-not-yet-registered clients.
 *
 * A trainer can pick a program at the moment they send an invite, but no
 * `User` row exists for the invitee until they accept the Clerk invitation and
 * the webhook creates them. Rather than block that UX, the intent is parked in
 * `PendingProgramAssignment` (keyed by invited email) and applied on account
 * creation.
 */

export const PENDING_ASSIGNMENT_STATUS = {
  pending: "PENDING",
  applied: "APPLIED",
  failed: "FAILED",
} as const;

/** Emails are stored lowercased so a case-different signup still matches the invite. */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function createPendingAssignment(
  trainerId: string,
  invitedEmail: string,
  programId: string,
  startDate: Date | null
) {
  return prisma.pendingProgramAssignment.create({
    data: {
      trainerId,
      invitedEmail: normalizeEmail(invitedEmail),
      programId,
      startDate,
      status: PENDING_ASSIGNMENT_STATUS.pending,
    },
  });
}

export async function getPendingAssignmentsForEmail(invitedEmail: string) {
  return prisma.pendingProgramAssignment.findMany({
    where: {
      invitedEmail: normalizeEmail(invitedEmail),
      status: PENDING_ASSIGNMENT_STATUS.pending,
    },
    orderBy: { createdAt: "asc" },
  });
}

export interface ApplyPendingAssignmentsResult {
  applied: number;
  failed: number;
}

/**
 * Applies every pending assignment queued for a newly created client.
 *
 * Mirrors `assignProgramAction` exactly: the source program is cloned first
 * (so assigning a template never mutates the template row), then the clone is
 * attached to the client via the scheduling-type-appropriate path. Duplicating
 * that branching here would risk the two drifting apart, so both go through the
 * same `programService` functions.
 *
 * Called from the Clerk webhook, which must stay resilient: a single bad row is
 * marked FAILED and skipped rather than aborting the remaining assignments or
 * the account creation that triggered them.
 */
export async function applyPendingAssignmentsForNewClient(
  trainerId: string,
  email: string,
  newClientId: string
): Promise<ApplyPendingAssignmentsResult> {
  const pending = await prisma.pendingProgramAssignment.findMany({
    where: {
      trainerId,
      invitedEmail: normalizeEmail(email),
      status: PENDING_ASSIGNMENT_STATUS.pending,
    },
    orderBy: { createdAt: "asc" },
  });

  let applied = 0;
  let failed = 0;

  for (const row of pending) {
    try {
      const source = await prisma.program.findUnique({
        where: { id: row.programId },
        select: { id: true, trainerId: true, schedulingType: true },
      });
      if (!source || source.trainerId !== trainerId) {
        throw new Error(`Program ${row.programId} is no longer assignable by trainer ${trainerId}`);
      }

      const copy = await programService.duplicateProgram(row.programId, trainerId, false);

      if (getProgramSchedulingType(source) === "ON_DEMAND") {
        await programService.assignOnDemandProgram(copy.id, newClientId);
      } else {
        // A Scheduled program needs a concrete start date to generate sessions
        // from. The trainer may have queued this weeks before the client
        // accepted, so a start date already in the past would back-date (and
        // immediately miss) sessions — fall back to today instead.
        const startDate = row.startDate && row.startDate > new Date() ? row.startDate : new Date();
        await programService.assignProgram(copy.id, newClientId, startDate);
      }

      await prisma.pendingProgramAssignment.update({
        where: { id: row.id },
        data: { status: PENDING_ASSIGNMENT_STATUS.applied, appliedAt: new Date() },
      });
      applied += 1;
    } catch (error) {
      console.error(`Failed to apply pending program assignment ${row.id}:`, error);
      await prisma.pendingProgramAssignment
        .update({
          where: { id: row.id },
          data: { status: PENDING_ASSIGNMENT_STATUS.failed },
        })
        .catch((updateError) =>
          console.error(`Failed to mark pending assignment ${row.id} as FAILED:`, updateError)
        );
      failed += 1;
    }
  }

  return { applied, failed };
}
