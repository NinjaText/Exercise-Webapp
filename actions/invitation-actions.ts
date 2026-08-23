"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/current-user";
import { revalidatePath } from "next/cache";
import { logAudit, deriveActorType, AUDIT_ACTIONS } from "@/lib/services/audit-log.service";
import { getOrgInvitations, type OrgInvitation } from "@/lib/services/invitation.service";

type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

interface CallerContext {
  orgId: string;
  isAdmin: boolean;
  actorId: string;
  actorType: "TRAINER" | "SUPER_ADMIN";
  actorName: string;
}

async function resolveCaller(clerkOrgId?: string): Promise<ActionResult<CallerContext>> {
  const { userId } = await auth();
  if (!userId) return { success: false, error: "Unauthorized" };

  if (clerkOrgId) {
    const admin = await requireSuperAdmin(); // redirects if not authorized
    return {
      success: true,
      data: {
        orgId: clerkOrgId,
        isAdmin: true,
        actorId: admin.id,
        actorType: "SUPER_ADMIN",
        actorName: `${admin.firstName} ${admin.lastName}`,
      },
    };
  }

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false, error: "User not found" };
  if (dbUser.role !== "TRAINER") return { success: false, error: "Forbidden" };
  if (!dbUser.clerkOrgId) return { success: false, error: "Organization not set up" };

  return {
    success: true,
    data: {
      orgId: dbUser.clerkOrgId,
      isAdmin: false,
      actorId: dbUser.id,
      actorType: deriveActorType(dbUser) === "SUPER_ADMIN" ? "SUPER_ADMIN" : "TRAINER",
      actorName: `${dbUser.firstName} ${dbUser.lastName}`,
    },
  };
}

function clerkErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "errors" in err) {
    const clerkErrors = (err as { errors: Array<{ message: string; longMessage?: string }> }).errors;
    return clerkErrors.map((e) => e.longMessage ?? e.message).join("; ") || fallback;
  }
  return err instanceof Error ? err.message : fallback;
}

export async function getInvitationsAction(
  clerkOrgId?: string
): Promise<ActionResult<OrgInvitation[]>> {
  const caller = await resolveCaller(clerkOrgId);
  if (!caller.success) return caller;

  try {
    const invitations = await getOrgInvitations(caller.data.orgId);
    return { success: true, data: invitations };
  } catch (err) {
    return { success: false, error: clerkErrorMessage(err, "Failed to load invitations") };
  }
}

export async function revokeInvitationAction(
  invitationId: string,
  email: string,
  clerkOrgId?: string
): Promise<ActionResult<null>> {
  const caller = await resolveCaller(clerkOrgId);
  if (!caller.success) return caller;
  const { orgId, isAdmin, actorId, actorType, actorName } = caller.data;

  try {
    const client = await clerkClient();
    await client.organizations.revokeOrganizationInvitation({
      organizationId: orgId,
      invitationId,
      requestingUserId: (await auth()).userId ?? undefined,
    });

    await logAudit({
      actorId,
      actorType,
      actorName,
      action: AUDIT_ACTIONS.USER_INVITE_REVOKED,
      targetType: "User",
      targetLabel: email,
      orgId,
    });

    revalidatePath(isAdmin ? "/admin/users" : "/clients");
    return { success: true, data: null };
  } catch (err) {
    return { success: false, error: clerkErrorMessage(err, "Failed to revoke invitation") };
  }
}

export async function resendInvitationAction(
  email: string,
  clerkOrgId?: string
): Promise<ActionResult<null>> {
  const caller = await resolveCaller(clerkOrgId);
  if (!caller.success) return caller;
  const { orgId, isAdmin, actorId, actorType, actorName } = caller.data;

  try {
    const { userId } = await auth();
    const client = await clerkClient();
    await client.organizations.createOrganizationInvitation({
      organizationId: orgId,
      inviterUserId: userId ?? undefined,
      emailAddress: email,
      role: "org:member",
      redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL}/onboarding/client`,
    });

    await logAudit({
      actorId,
      actorType,
      actorName,
      action: AUDIT_ACTIONS.USER_INVITED,
      targetType: "User",
      targetLabel: email,
      orgId,
    });

    revalidatePath(isAdmin ? "/admin/users" : "/clients");
    return { success: true, data: null };
  } catch (err) {
    return { success: false, error: clerkErrorMessage(err, "Failed to resend invitation") };
  }
}
