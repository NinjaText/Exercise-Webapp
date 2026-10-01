"use server";

import { activeUserOnly } from "@/lib/auth/active-user";
import { auth, clerkClient } from "@clerk/nextjs/server";
import type { Organization } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { logAudit, diffFields, deriveActorType, AUDIT_ACTIONS } from "@/lib/services/audit-log.service";
import { expireBranding } from "@/lib/services/branding.service";
import {
  getOrganization,
  getOrganizationOrNull,
  normalizePreference,
  upsertOrganizationProfile,
} from "@/lib/services/organization.service";
import type { ExerciseSourcePreference } from "@/lib/utils/exercise-picker";

export interface OrganizationMetadata {
  organizationName: string;
  tagline?: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  exerciseSourcePreference?: ExerciseSourcePreference;
}

/**
 * Audit-diff keys over the action-level shape (kept stable so past entries stay
 * comparable). Logos are edited under Branding and audited as BRANDING_UPDATED.
 */
const AUDIT_DIFF_KEYS = [
  "organizationName", "tagline", "phone", "email", "website", "address", "exerciseSourcePreference",
];

/** Maps the DB row to the action-level shape; unset optional fields become "". */
function toMetadata(org: Organization): OrganizationMetadata {
  return {
    organizationName: org.name,
    tagline: org.tagline ?? "",
    phone: org.phone ?? "",
    email: org.email ?? "",
    website: org.website ?? "",
    address: org.address ?? "",
    exerciseSourcePreference: normalizePreference(org.exerciseSourcePreference),
  };
}

export async function getOrganizationProfile(): Promise<OrganizationMetadata | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const dbUser = activeUserOnly(await prisma.user.findUnique({ where: { clerkId: userId } }));
  if (!dbUser?.clerkOrgId) return null;

  return toMetadata(await getOrganization(dbUser.clerkOrgId));
}

export async function saveOrganizationProfile(input: OrganizationMetadata) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = activeUserOnly(await prisma.user.findUnique({ where: { clerkId: userId } }));
  if (!dbUser) return { success: false as const, error: "User not found" };
  if (dbUser.role !== "TRAINER") return { success: false as const, error: "Forbidden" };
  if (!dbUser.clerkOrgId) return { success: false as const, error: "Organization not set up" };

  if (!input.organizationName?.trim()) {
    return { success: false as const, error: "Organization name is required" };
  }

  const clerkOrgId = dbUser.clerkOrgId;

  try {
    // The "before" snapshot only enriches the audit diff; a failure here degrades
    // to "no diff data" rather than aborting the save.
    const beforeRow = await getOrganizationOrNull(clerkOrgId).catch((err) => {
      console.error("Failed to fetch organization profile for audit diff:", err);
      return null;
    });

    // Unset optional fields are sent as "" (cleared), matching the previous
    // full-replace semantics of the settings form.
    const afterRow = await upsertOrganizationProfile(clerkOrgId, {
      name: input.organizationName.trim(),
      tagline: input.tagline ?? "",
      phone: input.phone ?? "",
      email: input.email ?? "",
      website: input.website ?? "",
      address: input.address ?? "",
      exerciseSourcePreference: normalizePreference(input.exerciseSourcePreference),
    });

    // The DB is canonical; Clerk's org name is kept in sync best-effort only.
    try {
      const client = await clerkClient();
      await client.organizations.updateOrganization(clerkOrgId, { name: afterRow.name });
    } catch (err) {
      console.error("Failed to sync organization name to Clerk:", err);
    }

    // Both sides go through toMetadata so unset fields compare as "" and don't
    // register as spurious diffs.
    const diff = beforeRow
      ? diffFields(
          toMetadata(beforeRow) as unknown as Record<string, unknown>,
          toMetadata(afterRow) as unknown as Record<string, unknown>,
          AUDIT_DIFF_KEYS
        )
      : undefined;

    await logAudit({
      actorId: dbUser.id,
      actorType: deriveActorType(dbUser),
      actorName: `${dbUser.firstName} ${dbUser.lastName}`,
      action: AUDIT_ACTIONS.CLINIC_SETTINGS_UPDATED,
      targetType: "Organization",
      targetId: clerkOrgId,
      orgId: clerkOrgId,
      metadata: diff,
    });

    // The org name feeds the branded display name, so the cached branding is stale.
    expireBranding(clerkOrgId);
    revalidatePath("/settings/clinic");
    return { success: true as const };
  } catch (err) {
    console.error("Failed to save organization profile:", err);
    return { success: false as const, error: "Failed to save organization profile" };
  }
}
