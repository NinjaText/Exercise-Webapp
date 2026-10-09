import { cookies } from "next/headers";
import type { Organization, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/services/audit-log.service";
import { nullOrUnset } from "@/lib/db/mongo-null";
import {
  CLUB_ADMIN_COOKIE,
  CLUB_ADMIN_SESSION_HOURS,
  signClubAdminMarker,
  verifyClubAdminMarker,
  type ClubAdminMarker,
} from "@/lib/clubs/admin-session-token";

const SESSION_MS = CLUB_ADMIN_SESSION_HOURS * 60 * 60 * 1000;

function displayName(user: Pick<User, "firstName" | "lastName" | "email">): string {
  return `${user.firstName} ${user.lastName}`.trim() || user.email;
}

/** Records an admin's "Manage club" visit and sets the marker cookie (spec H6/H8). */
export async function startClubSession(admin: User, org: Organization, houseCoach: User): Promise<void> {
  const expiresAt = new Date(Date.now() + SESSION_MS);
  const session = await prisma.adminClubSession.create({
    data: {
      adminUserId: admin.id,
      clerkOrgId: org.clerkOrgId,
      houseCoachUserId: houseCoach.id,
      expiresAt,
      endedAt: null,
    },
  });
  const adminName = displayName(admin);
  const token = await signClubAdminMarker({
    sid: session.id,
    adminUserId: admin.id,
    adminName,
    clerkOrgId: org.clerkOrgId,
    houseCoachClerkId: houseCoach.clerkId,
    exp: expiresAt.getTime(),
  });
  (await cookies()).set(CLUB_ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MS / 1000,
  });
  await logAudit({
    actorId: admin.id,
    actorType: "SUPER_ADMIN",
    actorName: adminName,
    action: "CLUB_SESSION_STARTED",
    targetType: "Organization",
    targetId: org.clerkOrgId,
    targetLabel: org.name,
    orgId: org.clerkOrgId,
    metadata: { sessionId: session.id, houseCoachUserId: houseCoach.id },
  });
}

/** Closes the current visit (if the marker is valid) and always clears the cookie (spec H10). */
export async function endClubSession(): Promise<void> {
  const store = await cookies();
  const marker = await verifyClubAdminMarker(store.get(CLUB_ADMIN_COOKIE)?.value);
  if (marker) {
    await prisma.adminClubSession.updateMany({
      where: { id: marker.sid, ...nullOrUnset("endedAt") },
      data: { endedAt: new Date() },
    });
    await logAudit({
      actorId: marker.adminUserId,
      actorType: "SUPER_ADMIN",
      actorName: marker.adminName,
      action: "CLUB_SESSION_ENDED",
      targetType: "Organization",
      targetId: marker.clerkOrgId,
      orgId: marker.clerkOrgId,
      metadata: { sessionId: marker.sid },
    });
  }
  store.delete(CLUB_ADMIN_COOKIE);
}

/**
 * The verified marker for the current request, or null. Safe outside a
 * request scope (e.g. scripts/background work), where `cookies()` throws.
 */
export async function getActingAdmin(): Promise<ClubAdminMarker | null> {
  let value: string | undefined;
  try {
    value = (await cookies()).get(CLUB_ADMIN_COOKIE)?.value;
  } catch {
    return null;
  }
  return verifyClubAdminMarker(value);
}
