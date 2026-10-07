"use server";

import { revalidatePath } from "next/cache";
import type { OrgType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { nullOrUnset } from "@/lib/db/mongo-null";
import { requireSuperAdmin } from "@/lib/current-user";
import { logUserAudit, diffFields } from "@/lib/services/audit-log.service";
import { AUDIT_ACTIONS } from "@/lib/audit/catalog";
import {
  ClubError,
  createClub,
  parseClubInput,
  parseClubUpdateInput,
  setOrgType,
  updateClub,
} from "@/lib/services/club.service";
import {
  assertTrainerEmailFree,
  getClubTrainer,
  getPendingTrainerInvite,
  inviteClubTrainer,
  normalizeTrainerEmail,
  removeClubTrainer,
} from "@/lib/services/club-trainer.service";
import { getOrgType } from "@/lib/org-capabilities";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const DAY_MS = 86400_000;

function toError(err: unknown): { ok: false; error: string } {
  if (err instanceof ClubError) return { ok: false, error: err.message };
  console.error("admin club action failed:", err);
  return { ok: false, error: "Something went wrong. Please try again." };
}

export async function createClubAction(raw: Record<string, unknown>): Promise<Result<{ clerkOrgId: string }>> {
  const admin = await requireSuperAdmin();
  try {
    const input = parseClubInput(raw);
    const org = await createClub(input);
    await logUserAudit(admin, () => ({
      action: AUDIT_ACTIONS.CLUB_CREATED,
      targetType: "Organization",
      targetId: org.clerkOrgId,
      targetLabel: org.name,
      orgId: org.clerkOrgId,
      metadata: {
        name: org.name,
        joinSlug: org.joinSlug,
        membershipAmountCents: input.membershipAmountCents,
        coachingAmountCents: input.coachingAmountCents,
        stripePriceId: org.stripePriceId,
        coachingStripePriceId: org.coachingStripePriceId,
      },
    }));
    await logUserAudit(admin, () => ({
      action: AUDIT_ACTIONS.CLUB_TRAINER_INVITED,
      targetType: "Organization",
      targetId: org.clerkOrgId,
      targetLabel: input.trainerEmail,
      orgId: org.clerkOrgId,
      metadata: { email: input.trainerEmail },
    }));
    revalidatePath("/admin/clubs");
    return { ok: true, clerkOrgId: org.clerkOrgId };
  } catch (err) {
    return toError(err);
  }
}

export async function updateClubAction(clerkOrgId: string, raw: Record<string, unknown>): Promise<Result> {
  const admin = await requireSuperAdmin();
  try {
    const before = await prisma.organization.findUnique({ where: { clerkOrgId } });
    const input = parseClubUpdateInput(raw);
    const after = await updateClub(clerkOrgId, input);
    await logUserAudit(admin, () => ({
      action: AUDIT_ACTIONS.CLUB_UPDATED,
      targetType: "Organization",
      targetId: clerkOrgId,
      targetLabel: input.name,
      orgId: clerkOrgId,
      metadata: {
        // "keep" = the stored price was left as is (the form couldn't show it).
        membershipAmountCents: input.membershipAmountCents,
        coachingAmountCents: input.coachingAmountCents,
        // Diffed against the saved row, so old/new price ids are included.
        changes: before
          ? diffFields(
              before as unknown as Record<string, unknown>,
              after as unknown as Record<string, unknown>,
              [
                "name",
                "joinSlug",
                "joinCode",
                "trialDays",
                "stripePriceId",
                "coachingStripePriceId",
                "starterProgramIds",
                "resourceProgramIds",
              ]
            )
          : undefined,
      },
    }));
    revalidatePath(`/admin/clubs/${clerkOrgId}`);
    revalidatePath("/admin/clubs");
    return { ok: true };
  } catch (err) {
    return toError(err);
  }
}

export async function extendMemberTrialAction(userId: string, days: number): Promise<Result> {
  const admin = await requireSuperAdmin();
  if (!Number.isInteger(days) || days < 1 || days > 90) return { ok: false, error: "Extend by 1–90 days." };
  try {
    const sub = await prisma.memberSubscription.findUnique({ where: { userId } });
    if (!sub) return { ok: false, error: "Member not found." };
    const extendable = sub.status === "TRIALING" || (sub.status === "CANCELED" && !sub.stripeSubscriptionId);
    if (!extendable) return { ok: false, error: "Only trial members can be extended; paid billing is managed in Stripe." };

    const base = Math.max(Date.now(), sub.trialEndsAt.getTime());
    const trialEndsAt = new Date(base + days * DAY_MS);
    // Conditional write: a webhook that activated the sub since the read must not be overwritten.
    const { count } = await prisma.memberSubscription.updateMany({
      where: {
        userId,
        trialEndsAt: sub.trialEndsAt,
        OR: [{ status: "TRIALING" }, { status: "CANCELED", ...nullOrUnset("stripeSubscriptionId") }],
      },
      data: { trialEndsAt, status: "TRIALING", remindersSent: [] },
    });
    if (count !== 1) return { ok: false, error: "This member's billing changed — refresh and try again." };
    await logUserAudit(admin, () => ({
      action: AUDIT_ACTIONS.MEMBER_TRIAL_EXTENDED,
      targetType: "User",
      targetId: userId,
      orgId: sub.clerkOrgId,
      metadata: { days, trialEndsAt: trialEndsAt.toISOString() },
    }));
    revalidatePath(`/admin/clubs/${sub.clerkOrgId}`);
    return { ok: true };
  } catch (err) {
    return toError(err);
  }
}

export async function setOrgTypeAction(clerkOrgId: string, type: OrgType): Promise<Result> {
  const admin = await requireSuperAdmin();
  if (type !== "TRAINER" && type !== "CLUB") return { ok: false, error: "Invalid org type." };
  try {
    await setOrgType(clerkOrgId, type);
    await logUserAudit(admin, () => ({
      action: AUDIT_ACTIONS.ORG_TYPE_CHANGED,
      targetType: "Organization",
      targetId: clerkOrgId,
      orgId: clerkOrgId,
      metadata: { type },
    }));
    revalidatePath("/admin/clubs");
    revalidatePath(`/admin/clubs/${clerkOrgId}`);
    return { ok: true };
  } catch (err) {
    return toError(err);
  }
}

async function requireClub(clerkOrgId: string) {
  const org = await prisma.organization.findUnique({ where: { clerkOrgId } });
  if (!org || getOrgType(org) !== "CLUB") throw new ClubError("not_found", "Club not found.");
  return org;
}

function revalidateClub(clerkOrgId: string) {
  revalidatePath(`/admin/clubs/${clerkOrgId}`);
  revalidatePath("/admin/clubs");
}

/** Resends the pending club trainer invite (revokes the old link). Not for a club with an active trainer. */
export async function resendClubTrainerInviteAction(clerkOrgId: string): Promise<Result> {
  const admin = await requireSuperAdmin();
  try {
    const org = await requireClub(clerkOrgId);
    if (await getClubTrainer(clerkOrgId)) {
      return { ok: false, error: "This club already has a trainer. Use Replace to change it." };
    }
    const pending = await getPendingTrainerInvite(clerkOrgId);
    if (!pending) {
      return { ok: false, error: "There is no pending invite to resend. Use Replace to invite a trainer." };
    }
    await inviteClubTrainer(clerkOrgId, pending.email);
    await logUserAudit(admin, () => ({
      action: AUDIT_ACTIONS.CLUB_TRAINER_INVITED,
      targetType: "Organization",
      targetId: clerkOrgId,
      targetLabel: pending.email,
      orgId: clerkOrgId,
      metadata: { email: pending.email, resend: true, club: org.name },
    }));
    revalidateClub(clerkOrgId);
    return { ok: true };
  } catch (err) {
    return toError(err);
  }
}

/**
 * Replaces the club trainer. The new email is validated and checked against
 * existing users BEFORE the current trainer is removed. If the invite itself
 * fails after the removal, the club is left without a trainer and the error
 * says so; the admin can retry with Replace (nothing to remove then).
 */
export async function replaceClubTrainerAction(clerkOrgId: string, rawEmail: string): Promise<Result> {
  const admin = await requireSuperAdmin();
  try {
    await requireClub(clerkOrgId);
    const email = normalizeTrainerEmail(rawEmail);
    await assertTrainerEmailFree(email);

    const current = await getClubTrainer(clerkOrgId);
    if (current) {
      let removalError: string | undefined;
      try {
        await removeClubTrainer(clerkOrgId);
      } catch (err) {
        // Clerk membership deleted but the DB update failed: still audit the removal, then stop.
        if (!(err instanceof ClubError) || err.code !== "trainer_remove_failed") throw err;
        removalError = err.message;
      }
      await logUserAudit(admin, () => ({
        action: AUDIT_ACTIONS.CLUB_TRAINER_REMOVED,
        targetType: "User",
        targetId: current.id,
        targetLabel: current.email,
        orgId: clerkOrgId,
        metadata: { email: current.email, replacedBy: email, ...(removalError ? { error: removalError } : {}) },
      }));
      if (removalError) {
        revalidateClub(clerkOrgId);
        return { ok: false, error: `${removalError} No invitation was sent.` };
      }
    }
    try {
      await inviteClubTrainer(clerkOrgId, email);
    } catch (err) {
      revalidateClub(clerkOrgId);
      if (err instanceof ClubError && current) {
        return {
          ok: false,
          error: `The previous trainer was removed, but the invitation failed: ${err.message} The club has no trainer now; use Replace again to retry.`,
        };
      }
      throw err;
    }
    await logUserAudit(admin, () => ({
      action: AUDIT_ACTIONS.CLUB_TRAINER_INVITED,
      targetType: "Organization",
      targetId: clerkOrgId,
      targetLabel: email,
      orgId: clerkOrgId,
      metadata: { email, replaced: Boolean(current) },
    }));
    revalidateClub(clerkOrgId);
    return { ok: true };
  } catch (err) {
    return toError(err);
  }
}
