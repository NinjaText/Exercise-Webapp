import { NextResponse } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { PUBLIC_ROUTES } from "@/lib/auth/public-routes";
import { CLUB_ADMIN_COOKIE, houseCoachSessionInvalid } from "@/lib/clubs/admin-session-token";

const isPublicRoute = createRouteMatcher([...PUBLIC_ROUTES]);
let warnedMissingPublicMetadata = false;

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }

  // Spec H9: a house-coach session is only usable alongside a live marker an
  // admin's "Manage club" issued for that coach. No DB access here.
  const { userId, sessionClaims } = await auth();
  if (userId && sessionClaims?.publicMetadata === undefined && !warnedMissingPublicMetadata) {
    warnedMissingPublicMetadata = true;
    // Without the claim this guard can't see house coaches; getCurrentUser()
    // is the server-side backstop, but the template should still be fixed.
    console.error(
      'Clerk session token is missing the publicMetadata claim. Add "publicMetadata": "{{user.public_metadata}}" to the session token template (Clerk dashboard → Sessions → Customize session token).',
    );
  }
  const isHouseCoach =
    (sessionClaims?.publicMetadata as { houseCoach?: boolean } | undefined)?.houseCoach === true;
  if (
    await houseCoachSessionInvalid({
      isHouseCoach,
      userId,
      cookie: req.cookies.get(CLUB_ADMIN_COOKIE)?.value,
      pathname: req.nextUrl.pathname,
    })
  ) {
    return NextResponse.redirect(new URL("/club-session/ended", req.url));
  }
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
