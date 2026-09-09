"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { logAudit, deriveActorType, AUDIT_ACTIONS } from "@/lib/services/audit-log.service";

export interface InviteClientInput {
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
}

/**
 * Details captured at invite time and carried on the Clerk invitation's
 * `publicMetadata`, so the webhook can seed the client's `User` row with the
 * name/phone the trainer already knows rather than waiting for the client to
 * fill them in during onboarding.
 */
export interface InviteClientMetadata {
  // Clerk types invitation metadata as an open JSON bag, so the index
  // signature is required for this to be assignable to their param type.
  [key: string]: unknown;
  invitedFirstName?: string;
  invitedLastName?: string;
  invitedPhone?: string;
}

/** Trims a value and drops it entirely when empty — Clerk metadata shouldn't carry "". */
function optionalTrimmed(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Invites a client to the calling trainer's Clerk organization.
 *
 * Accepts either a bare email string (the original signature, still used by
 * existing callers and tests) or an object carrying the optional profile
 * details captured in the invite dialog.
 */
export async function inviteClientAction(input: string | InviteClientInput) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };
  if (dbUser.role !== "TRAINER") return { success: false as const, error: "Forbidden" };
  if (!dbUser.clerkOrgId) return { success: false as const, error: "Organization not set up" };

  const normalized: InviteClientInput = typeof input === "string" ? { email: input } : input;

  const trimmedEmail = normalized.email.trim().toLowerCase();
  if (!trimmedEmail) return { success: false as const, error: "Email is required" };

  const publicMetadata: InviteClientMetadata = {};
  const firstName = optionalTrimmed(normalized.firstName);
  const lastName = optionalTrimmed(normalized.lastName);
  const phone = optionalTrimmed(normalized.phone);
  if (firstName) publicMetadata.invitedFirstName = firstName;
  if (lastName) publicMetadata.invitedLastName = lastName;
  if (phone) publicMetadata.invitedPhone = phone;

  try {
    const client = await clerkClient();
    await client.organizations.createOrganizationInvitation({
      organizationId: dbUser.clerkOrgId,
      inviterUserId: userId,
      emailAddress: trimmedEmail,
      role: "org:member",
      redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL}/onboarding/client`,
      ...(Object.keys(publicMetadata).length > 0 ? { publicMetadata } : {}),
    });

    await logAudit({
      actorId: dbUser.id,
      actorType: deriveActorType(dbUser),
      actorName: `${dbUser.firstName} ${dbUser.lastName}`,
      action: AUDIT_ACTIONS.USER_INVITED,
      targetType: "User",
      targetLabel: trimmedEmail,
      orgId: dbUser.clerkOrgId,
    });

    revalidatePath("/clients");
    return { success: true as const, data: { email: trimmedEmail } };
  } catch (err: unknown) {
    // Clerk errors have an `errors` array with the real messages
    if (err && typeof err === "object" && "errors" in err) {
      const clerkErrors = (err as { errors: Array<{ message: string; longMessage?: string }> }).errors;
      const detail = clerkErrors.map((e) => e.longMessage ?? e.message).join("; ");
      console.error("Clerk invitation error:", detail, clerkErrors);
      return { success: false as const, error: detail || "Failed to send invitation" };
    }
    const message = err instanceof Error ? err.message : "Failed to send invitation";
    console.error("Failed to invite client:", err);
    return { success: false as const, error: message };
  }
}
