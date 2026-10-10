"use server";

import { activeCallerOnly } from "@/lib/auth/active-user";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/current-user";
import { revalidatePath } from "next/cache";
import { logAudit, deriveActorType, AUDIT_ACTIONS } from "@/lib/services/audit-log.service";

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
  }

  const uniqueEmails = [...new Set(emails)];
  const client = await clerkClient();
  const results: InviteEmailResult[] = [];

  for (const email of uniqueEmails) {
    try {
      await client.organizations.createOrganizationInvitation({
        organizationId: orgId,
        inviterUserId: userId,
        emailAddress: email,
        role: "org:member",
        redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL}/onboarding/client`,
      });
      results.push({ email, success: true });

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
