import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { CLUB_ADMIN_COOKIE, verifyClubAdminMarker } from "@/lib/clubs/admin-session-token";

/**
 * Server-side backstop for the proxy guard (spec H9), which fails open when the
 * Clerk session token lacks the publicMetadata claim. A house coach session is
 * only valid with a live marker issued for that exact coach. Reads the cookie
 * directly (not via lib/clubs/admin-session) to keep this module free of the
 * audit-service import chain.
 */
export async function hasValidClubAdminMarker(clerkUserId: string): Promise<boolean> {
  let value: string | undefined;
  try {
    value = (await cookies()).get(CLUB_ADMIN_COOKIE)?.value;
  } catch {
    return false;
  }
  const marker = await verifyClubAdminMarker(value);
  return marker?.houseCoachClerkId === clerkUserId;
}

/**
 * True when `user` is a club's house coach acting without a live admin marker
 * bound to them. `sessionClaims` is optional: the `houseCoach` claim only
 * shortcuts the DB lookup; a missing claim never clears a house coach.
 */
export async function isStaleHouseCoach(
  user: { id: string; clerkId: string; role: string },
  sessionClaims?: unknown
): Promise<boolean> {
  if (user.role !== "TRAINER") return false;
  const claimSaysHouseCoach =
    (sessionClaims as { publicMetadata?: { houseCoach?: boolean } } | undefined)?.publicMetadata?.houseCoach === true;
  const isHouseCoach =
    claimSaysHouseCoach ||
    !!(await prisma.organization.findFirst({ where: { houseCoachUserId: user.id }, select: { id: true } }));
  if (!isHouseCoach) return false;
  return !(await hasValidClubAdminMarker(user.clerkId));
}
