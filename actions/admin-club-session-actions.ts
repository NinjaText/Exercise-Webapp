"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/current-user";
import { getOrgType } from "@/lib/org-capabilities";
import { isSuperAdminEmail } from "@/lib/auth/super-admin-emails";
import { ensureHouseCoach } from "@/lib/services/house-coach.service";
import { endClubSession, startClubSession } from "@/lib/clubs/admin-session";

/**
 * "Manage club" (spec H6): opens a club session for the calling super admin
 * and returns the one-shot URL that signs the browser in as the house coach.
 */
export async function enterClubAction(
  clerkOrgId: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  // Outside the try: its redirect for non-admins must propagate.
  const admin = await requireSuperAdmin();
  const org = await prisma.organization.findUnique({ where: { clerkOrgId } });
  if (!org || getOrgType(org) !== "CLUB") return { ok: false, error: "Club not found." };
  try {
    const houseCoach = await ensureHouseCoach(org);
    const client = await clerkClient();
    // Token first: a Clerk failure must leave no session row, cookie or audit.
    const token = await client.signInTokens.createSignInToken({
      userId: houseCoach.clerkId,
      expiresInSeconds: 60,
    });
    await startClubSession(admin, org, houseCoach);
    return { ok: true, url: "/club-session/enter?ticket=" + encodeURIComponent(token.token) };
  } catch (err) {
    console.error("enterClubAction failed:", err);
    return { ok: false, error: "Could not open this club. Please try again." };
  }
}

/**
 * Banner "Exit" (spec H10). Ends the club session and, when the caller is the
 * house coach of a session this call just closed, returns a one-shot URL that
 * signs the browser straight back in as the admin who opened it — so Exit lands
 * on /admin instead of the sign-in page. `url: null` means the client should
 * just sign out.
 */
export async function exitClubAction(): Promise<{ url: string | null }> {
  const marker = await endClubSession();
  if (!marker) return { url: null };
  try {
    const { userId } = await auth();
    // Only the house coach this marker was minted for may be handed back.
    if (!userId || userId !== marker.houseCoachClerkId) return { url: null };

    const admin = await prisma.user.findUnique({ where: { id: marker.adminUserId } });
    if (!admin || !admin.isActive) return { url: null };

    const client = await clerkClient();
    // Re-check admin rights at exit time: they may have been revoked mid-visit.
    const clerkAdmin = await client.users.getUser(admin.clerkId);
    const meta = clerkAdmin.publicMetadata as { superAdmin?: boolean } | undefined;
    if (meta?.superAdmin !== true && !isSuperAdminEmail(admin.email)) return { url: null };

    const token = await client.signInTokens.createSignInToken({
      userId: admin.clerkId,
      expiresInSeconds: 60,
    });
    return { url: "/club-session/return?ticket=" + encodeURIComponent(token.token) };
  } catch (err) {
    console.error("exitClubAction: could not mint admin return ticket:", err);
    return { url: null };
  }
}
