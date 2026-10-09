"use server";

import { clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/current-user";
import { getOrgType } from "@/lib/org-capabilities";
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

/** Banner "Exit" (spec H10). The client signs out afterwards. */
export async function exitClubAction(): Promise<void> {
  await endClubSession();
}
