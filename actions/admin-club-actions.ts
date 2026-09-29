"use server";

import { revalidatePath } from "next/cache";
import type { OrgType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/current-user";
import { logUserAudit, diffFields } from "@/lib/services/audit-log.service";
import { AUDIT_ACTIONS } from "@/lib/audit/catalog";
import { ClubError, createClub, parseClubInput, setOrgType, updateClub } from "@/lib/services/club.service";

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
    const org = await createClub(parseClubInput(raw));
    await logUserAudit(admin, () => ({
      action: AUDIT_ACTIONS.CLUB_CREATED,
      targetType: "Organization",
      targetId: org.clerkOrgId,
      targetLabel: org.name,
      orgId: org.clerkOrgId,
      metadata: { name: org.name, joinSlug: org.joinSlug },
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
    const input = parseClubInput(raw);
    await updateClub(clerkOrgId, input);
    await logUserAudit(admin, () => ({
      action: AUDIT_ACTIONS.CLUB_UPDATED,
      targetType: "Organization",
      targetId: clerkOrgId,
      targetLabel: input.name,
      orgId: clerkOrgId,
      metadata: {
        changes: before
          ? diffFields(
              before as unknown as Record<string, unknown>,
              input as unknown as Record<string, unknown>,
              ["name", "joinSlug", "joinCode", "trialDays", "stripePriceId", "starterProgramIds"]
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
        OR: [{ status: "TRIALING" }, { status: "CANCELED", stripeSubscriptionId: null }],
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
