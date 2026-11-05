import { auth } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClubBySlug } from "@/lib/services/club.service";

/**
 * /start/individual — Individual Starter trial (lib/marketing-links.ts
 * INDIVIDUAL_TRIAL_HREF). Individuals join the MIA-run club named by
 * INDIVIDUALS_CLUB_SLUG and reuse club member billing:
 *  - not configured / club missing → /pricing?tab=individuals&unavailable=individual
 *    (a visible "opening soon" notice; never a crash or a silent bounce);
 *  - already a member of that club → /dashboard (the app gate handles billing);
 *  - signed in, open-join club → /join/<slug>/complete (enroll → checkout);
 *  - otherwise → /join/<slug> (sign-up, or the access code if not open-join).
 */
export async function GET(req: NextRequest) {
  const to = (path: string) => NextResponse.redirect(new URL(path, req.url), 303);
  // Not set up yet: say so on the pricing page instead of silently bouncing
  // back to the page the visitor clicked from.
  const unavailable = () => to("/pricing?tab=individuals&unavailable=individual");
  const slug = process.env.INDIVIDUALS_CLUB_SLUG?.trim();
  if (!slug) {
    console.error("/start/individual: INDIVIDUALS_CLUB_SLUG is not set — Individual Starter sign-up is unavailable.");
    return unavailable();
  }

  let club;
  try {
    club = await getClubBySlug(slug);
  } catch (err) {
    console.error("/start/individual club lookup failed:", err);
    club = null;
  }
  if (!club?.joinSlug) {
    console.error(`/start/individual: no club with join slug "${slug}" — check INDIVIDUALS_CLUB_SLUG.`);
    return unavailable();
  }
  const joinPath = `/join/${club.joinSlug}`;

  const { userId } = await auth();
  if (userId) {
    const user = await prisma.user.findUnique({ where: { clerkId: userId }, select: { clerkOrgId: true } });
    if (user?.clerkOrgId === club.clerkOrgId) return to("/dashboard");
    if (club.openJoin === true) return to(`${joinPath}/complete`);
  }
  return to(joinPath);
}
