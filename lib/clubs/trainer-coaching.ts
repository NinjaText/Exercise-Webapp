import type { CoachingStatus, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCapabilitiesForUser } from "@/lib/org-capabilities.server";
import { listCoachingRequests } from "@/lib/services/coaching.service";

type Trainer = Pick<User, "id" | "role" | "clerkOrgId">;

export interface CoachingRequestItem {
  memberId: string;
  name: string;
  email: string;
  note: string;
  requestedAt: Date | null;
}

/**
 * True for any TRAINER in a member-billed (club) org — i.e. the club's house
 * coach. Trainer-org trainers return before any coaching query.
 */
async function isClubTrainer(trainer: Trainer): Promise<boolean> {
  if (trainer.role !== "TRAINER" || !trainer.clerkOrgId) return false;
  return (await getCapabilitiesForUser(trainer)).billing === "member";
}

/** Pending coaching requests for the house coach's dashboard; null for any other trainer. */
export async function getTrainerCoachingRequests(trainer: Trainer): Promise<CoachingRequestItem[] | null> {
  if (!(await isClubTrainer(trainer))) return null;
  const rows = await listCoachingRequests(trainer.clerkOrgId!);
  return rows.map((r) => ({
    memberId: r.userId,
    name: `${r.user.firstName} ${r.user.lastName}`.trim() || r.user.email,
    email: r.user.email,
    note: r.requestNote ?? "",
    requestedAt: r.requestedAt ?? null,
  }));
}

/** Coaching status per member for the clients list; null for any other trainer. */
export async function getTrainerCoachingStatuses(
  trainer: Trainer
): Promise<Record<string, CoachingStatus> | null> {
  if (!(await isClubTrainer(trainer))) return null;
  const rows = await prisma.memberCoaching.findMany({
    where: { clerkOrgId: trainer.clerkOrgId!, status: { in: ["REQUESTED", "ACCEPTED", "ACTIVE", "PAST_DUE"] } },
    select: { userId: true, status: true },
  });
  return Object.fromEntries(rows.map((r) => [r.userId, r.status]));
}

export interface ClientCoachingPanelData {
  memberId: string;
  status: CoachingStatus | null;
  note: string | null;
  cancelAtPeriodEnd: boolean;
  periodEnd: Date | null;
}

/** One member's coaching state for the client detail panel; null for any other trainer. */
export async function getClientCoachingPanel(
  trainer: Trainer,
  memberId: string
): Promise<ClientCoachingPanelData | null> {
  if (!(await isClubTrainer(trainer))) return null;
  const row = await prisma.memberCoaching.findUnique({ where: { userId: memberId } });
  if (row && row.clerkOrgId !== trainer.clerkOrgId) return null;
  return {
    memberId,
    status: row?.status ?? null,
    note: row?.requestNote ?? null,
    cancelAtPeriodEnd: row?.cancelAtPeriodEnd ?? false,
    periodEnd: row?.currentPeriodEnd ?? null,
  };
}
