"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { logAudit, diffFields, deriveActorType, AUDIT_ACTIONS } from "@/lib/services/audit-log.service";
import { EXERCISE_SOURCE_PREFERENCES, type ExerciseSourcePreference } from "@/lib/utils/exercise-picker";

export interface OrganizationMetadata {
  organizationName: string;
  tagline?: string;
  logoUrl?: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  exerciseSourcePreference?: ExerciseSourcePreference;
}

export async function getOrganizationProfile(): Promise<OrganizationMetadata | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser?.clerkOrgId) return null;

  const client = await clerkClient();
  const org = await client.organizations.getOrganization({ organizationId: dbUser.clerkOrgId });

  const meta = (org.publicMetadata ?? {}) as Record<string, string>;
  const exerciseSourcePreference: ExerciseSourcePreference = EXERCISE_SOURCE_PREFERENCES.includes(
    meta.exerciseSourcePreference as ExerciseSourcePreference
  )
    ? (meta.exerciseSourcePreference as ExerciseSourcePreference)
    : "BOTH";

  return {
    organizationName: org.name,
    tagline: meta.tagline ?? "",
    logoUrl: meta.logoUrl ?? "",
    phone: meta.phone ?? "",
    email: meta.email ?? "",
    website: meta.website ?? "",
    address: meta.address ?? "",
    exerciseSourcePreference,
  };
}

export async function saveOrganizationProfile(input: OrganizationMetadata) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };
  if (dbUser.role !== "TRAINER") return { success: false as const, error: "Forbidden" };
  if (!dbUser.clerkOrgId) return { success: false as const, error: "Organization not set up" };

  if (!input.organizationName?.trim()) {
    return { success: false as const, error: "Organization name is required" };
  }

  try {
    // Fetching the "before" snapshot is a network call to Clerk's API used only to
    // enrich the audit log's diff. It must never turn a successful save into a
    // reported failure, so a failure here degrades to "no diff data" rather than
    // aborting the update or the success response below.
    const before = await getOrganizationProfile().catch((err) => {
      console.error("Failed to fetch organization profile for audit diff:", err);
      return null;
    });

    const client = await clerkClient();
    const normalizedAfter: OrganizationMetadata = {
      organizationName: input.organizationName.trim(),
      tagline: input.tagline ?? "",
      logoUrl: input.logoUrl ?? "",
      phone: input.phone ?? "",
      email: input.email ?? "",
      website: input.website ?? "",
      address: input.address ?? "",
      exerciseSourcePreference: EXERCISE_SOURCE_PREFERENCES.includes(
        input.exerciseSourcePreference as ExerciseSourcePreference
      )
        ? (input.exerciseSourcePreference as ExerciseSourcePreference)
        : "BOTH",
    };

    await client.organizations.updateOrganization(dbUser.clerkOrgId, {
      name: normalizedAfter.organizationName,
      publicMetadata: {
        tagline: normalizedAfter.tagline,
        logoUrl: normalizedAfter.logoUrl,
        phone: normalizedAfter.phone,
        email: normalizedAfter.email,
        website: normalizedAfter.website,
        address: normalizedAfter.address,
        exerciseSourcePreference: normalizedAfter.exerciseSourcePreference,
      },
    });

    // Compare against the same normalized shape used for "before" (getOrganizationProfile
    // fills unset fields with "") so unset optional fields don't register as spurious diffs.
    const diff = before
      ? diffFields(
          before as unknown as Record<string, unknown>,
          normalizedAfter as unknown as Record<string, unknown>,
          ["organizationName", "tagline", "logoUrl", "phone", "email", "website", "address", "exerciseSourcePreference"]
        )
      : undefined;

    await logAudit({
      actorId: dbUser.id,
      actorType: deriveActorType(dbUser),
      actorName: `${dbUser.firstName} ${dbUser.lastName}`,
      action: AUDIT_ACTIONS.CLINIC_SETTINGS_UPDATED,
      targetType: "Organization",
      targetId: dbUser.clerkOrgId,
      orgId: dbUser.clerkOrgId,
      metadata: diff,
    });

    revalidatePath("/settings/organization");
    return { success: true as const };
  } catch (err) {
    console.error("Failed to save organization profile:", err);
    return { success: false as const, error: "Failed to save organization profile" };
  }
}
