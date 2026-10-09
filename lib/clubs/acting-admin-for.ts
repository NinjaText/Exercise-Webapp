import { cookies } from "next/headers";
import { CLUB_ADMIN_COOKIE, verifyClubAdminMarker, type ClubAdminMarker } from "@/lib/clubs/admin-session-token";

/**
 * The super admin operating `user`'s account through "Manage club", or null.
 *
 * The marker is only honoured when it was issued for this exact Clerk user, so
 * a stale cookie in an admin's or trainer's own session never re-attributes
 * their actions. Reads the cookie directly (not via lib/clubs/admin-session)
 * so the audit service can use it without an import cycle. Safe outside a
 * request scope, where `cookies()` throws.
 */
export async function getActingAdminFor(user: {
  clerkId?: string | null;
  role: "TRAINER" | "CLIENT";
}): Promise<ClubAdminMarker | null> {
  if (user.role !== "TRAINER" || !user.clerkId) return null;
  let value: string | undefined;
  try {
    value = (await cookies()).get(CLUB_ADMIN_COOKIE)?.value;
  } catch {
    return null;
  }
  if (!value) return null;
  const marker = await verifyClubAdminMarker(value);
  return marker && marker.houseCoachClerkId === user.clerkId ? marker : null;
}
