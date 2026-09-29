import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { Organization } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { getOrgCapabilities, type OrgCapabilities } from "@/lib/org-capabilities";

/** The user's org row. DB `clerkOrgId` is canonical (clients inherit their org). */
export const getOrgForUser = cache(
  async (user: { clerkOrgId: string | null }): Promise<Organization | null> => {
    if (!user.clerkOrgId) return null;
    return prisma.organization.findUnique({ where: { clerkOrgId: user.clerkOrgId } });
  }
);

/** Capabilities of any user's org — e.g. the client behind a notification or send. */
export async function getCapabilitiesForUser(user: { clerkOrgId: string | null }): Promise<OrgCapabilities> {
  return getOrgCapabilities(await getOrgForUser(user));
}

export async function getCurrentCapabilities(): Promise<OrgCapabilities> {
  return getCapabilitiesForUser(await getCurrentUser());
}

/** Server-component guard for feature routes a club org doesn't have. */
export async function requireCapability(cap: "messaging" | "checkIns"): Promise<void> {
  const caps = await getCurrentCapabilities();
  if (!caps[cap]) redirect("/dashboard");
}
