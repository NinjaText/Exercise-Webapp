import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { Organization } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import {
  canPairInteract,
  getOrgType,
  getUserCapabilities,
  needsCoachingLookup,
  type OrgCapabilities,
} from "@/lib/org-capabilities";

type CapabilityUser = { id: string; role: "TRAINER" | "CLIENT"; clerkOrgId: string | null };

// React `cache` keys by argument identity, so the memoised inner functions
// take primitives; the exported wrappers accept user-shaped objects.
const orgByClerkId = cache(
  async (clerkOrgId: string): Promise<Organization | null> =>
    prisma.organization.findUnique({ where: { clerkOrgId } })
);

/** The user's org row. DB `clerkOrgId` is canonical (clients inherit their org). */
export async function getOrgForUser(user: { clerkOrgId: string | null }): Promise<Organization | null> {
  if (!user.clerkOrgId) return null;
  return orgByClerkId(user.clerkOrgId);
}

/** Whether a club member's coaching add-on is on (paid). */
export async function getCoachingActive(userId: string): Promise<boolean> {
  const coaching = await prisma.memberCoaching.findUnique({
    where: { userId },
    select: { status: true },
  });
  return coaching?.status === "ACTIVE";
}

const capabilitiesFor = cache(
  async (id: string, role: "TRAINER" | "CLIENT", clerkOrgId: string | null): Promise<OrgCapabilities> => {
    const orgType = getOrgType(await getOrgForUser({ clerkOrgId }));
    const coachingActive = needsCoachingLookup(orgType, role) ? await getCoachingActive(id) : false;
    return getUserCapabilities({ orgType, role, coachingActive });
  }
);

/**
 * One user's capabilities: their org's type, their role and — only for a
 * CLIENT in a club — their MemberCoaching status. Memoised per request.
 */
export async function getCapabilitiesForUser(user: CapabilityUser): Promise<OrgCapabilities> {
  return capabilitiesFor(user.id, user.role, user.clerkOrgId);
}

export async function getCurrentCapabilities(): Promise<OrgCapabilities> {
  return getCapabilitiesForUser(await getCurrentUser());
}

/** Server-component guard for feature routes the current user doesn't have. */
export async function requireCapability(cap: "messaging" | "checkIns" | "trainerBilling"): Promise<void> {
  const caps = await getCurrentCapabilities();
  if (!caps[cap]) redirect("/dashboard");
}

function sameOrg(a: { clerkOrgId: string | null }, b: { clerkOrgId: string | null }): boolean {
  return a.clerkOrgId !== null && a.clerkOrgId === b.clerkOrgId;
}

/**
 * Pair rule for trainer → recipient messaging and check-in assignment (see
 * canPairInteract; filterCoachableClientIds is the batch form). A club trainer
 * may only reach coached members of their own club; trainer-org trainers keep
 * today's rules. Fails closed: an unknown id or any lookup error (e.g. a
 * malformed ObjectId, P2023) returns false. Never throws.
 */
export async function canCoachInteract(
  sender: CapabilityUser,
  recipient: CapabilityUser | string,
  cap: "messaging" | "checkIns" = "messaging"
): Promise<boolean> {
  try {
    const target =
      typeof recipient === "string"
        ? await prisma.user.findUnique({
            where: { id: recipient },
            select: { id: true, role: true, clerkOrgId: true },
          })
        : recipient;
    if (!target) return false;
    const [senderCaps, recipientCaps] = await Promise.all([
      getCapabilitiesForUser(sender),
      getCapabilitiesForUser(target),
    ]);
    return canPairInteract({
      sender: senderCaps,
      recipient: recipientCaps,
      sameOrg: sameOrg(sender, target),
      cap,
    });
  } catch (err) {
    console.error("[org-capabilities] pair check failed:", err);
    return false;
  }
}

/**
 * Batch pair rule for a trainer's own roster (broadcasts): the same
 * canPairInteract predicate as canCoachInteract, with `sameOrg` true because
 * `clientIds` come from getClientIdsForTrainer (clients in the trainer's org).
 * One coaching query at most; none for trainer orgs.
 */
export async function filterCoachableClientIds(
  trainer: CapabilityUser,
  clientIds: string[]
): Promise<string[]> {
  if (clientIds.length === 0) return [];
  const orgType = getOrgType(await getOrgForUser(trainer));
  const senderCaps = await getCapabilitiesForUser(trainer);
  let coached = new Set<string>();
  if (needsCoachingLookup(orgType, "CLIENT")) {
    if (!trainer.clerkOrgId) return [];
    const active = await prisma.memberCoaching.findMany({
      where: { userId: { in: clientIds }, clerkOrgId: trainer.clerkOrgId, status: "ACTIVE" },
      select: { userId: true },
    });
    coached = new Set(active.map((c) => c.userId));
  }
  return clientIds.filter((id) =>
    canPairInteract({
      sender: senderCaps,
      recipient: getUserCapabilities({ orgType, role: "CLIENT", coachingActive: coached.has(id) }),
      sameOrg: true,
      cap: "messaging",
    })
  );
}
