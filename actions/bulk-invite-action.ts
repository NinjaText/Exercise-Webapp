"use server";

import { activeCallerOnly } from "@/lib/auth/active-user";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/current-user";
import { revalidatePath } from "next/cache";
import { logAudit, deriveActorType, AUDIT_ACTIONS } from "@/lib/services/audit-log.service";
import { checkClientLimit } from "@/lib/billing/client-limit";
import { isSuperAdmin } from "@/lib/current-user";

export interface InviteEmailResult {
  email: string;
  success: boolean;
  error?: string;
}

type BulkInviteActionResult =
  | { success: true; results: InviteEmailResult[] }
  | { success: false; error: string };

/**
 * Trainer path: omit clerkOrgId — org is derived from the caller's DB user.
 * Admin path: pass clerkOrgId explicitly — caller must be super admin
 *   (requireSuperAdmin redirects if not, so this never returns an error in that case).
 */
export async function bulkInviteAction(
  emails: string[],
  clerkOrgId?: string
): Promise<BulkInviteActionResult> {
  const { userId } = await auth();
  if (!userId) return { success: false, error: "Unauthorized" };

  let orgId: string;
  let isAdmin = false;
  let actorUser: { id: string; firstName: string; lastName: string; email: string; role: "TRAINER" | "CLIENT" };
  /** Trainer path only: the caller whose plan caps the org's clients. */
  let trainerCaller: { id: string; role: "TRAINER" | "CLIENT"; clerkOrgId: string | null; email: string } | null = null;

  if (clerkOrgId) {
    actorUser = await requireSuperAdmin(); // redirects if not authorized
    orgId = clerkOrgId;
    isAdmin = true;
  } else {
    const dbUser = await activeCallerOnly(await prisma.user.findUnique({ where: { clerkId: userId } }));
    if (!dbUser) return { success: false, error: "User not found" };
    if (dbUser.role !== "TRAINER") return { success: false, error: "Forbidden" };
    if (!dbUser.clerkOrgId) return { success: false, error: "Organization not set up" };
    orgId = dbUser.clerkOrgId;
    actorUser = dbUser;
    trainerCaller = dbUser;
  }

  const uniqueEmails = [...new Set(emails)];
  const client = await clerkClient();
  const results: InviteEmailResult[] = [];

  // Plan client cap: invite as many as fit, refuse the rest with the reason.
  // Admins inviting on an org's behalf are not capped.
  let seatsLeft = Infinity;
  let limitError = "";
  if (trainerCaller) {
    const limit = await checkClientLimit(trainerCaller, uniqueEmails.length, { isAdmin: await isSuperAdmin() });
    if (!limit.ok) {
      seatsLeft = limit.remaining;
      limitError = limit.error;
    }
  }

  for (const email of uniqueEmails) {
    if (seatsLeft <= 0) {
      results.push({ email, success: false, error: limitError });
      continue;
    }
    try {
      await client.organizations.createOrganizationInvitation({
        organizationId: orgId,
        inviterUserId: userId,
        emailAddress: email,
        role: "org:member",
        redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL}/onboarding/client`,
      });
      results.push({ email, success: true });
      seatsLeft -= 1;

      await logAudit({
        actorId: actorUser.id,
        actorType: isAdmin ? "SUPER_ADMIN" : deriveActorType(actorUser),
        actorName: `${actorUser.firstName} ${actorUser.lastName}`,
        action: AUDIT_ACTIONS.USER_INVITED,
        targetType: "User",
        targetLabel: email,
        orgId,
      });
    } catch (err: unknown) {
      let message = "Failed to send invitation";
      if (err && typeof err === "object" && "errors" in err) {
        const clerkErrors = (err as { errors: Array<{ message: string; longMessage?: string }> }).errors;
        message = clerkErrors.map((e) => e.longMessage ?? e.message).join("; ");
      } else if (err instanceof Error) {
        message = err.message;
      }
      results.push({ email, success: false, error: message });
    }
  }

  revalidatePath(isAdmin ? "/admin/users" : "/clients");
  return { success: true, results };
}
