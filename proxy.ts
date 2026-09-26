import { NextResponse } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { PUBLIC_ROUTES } from "@/lib/auth/public-routes";
import { nativeLandingRedirect } from "@/lib/native/landing";

const isPublicRoute = createRouteMatcher([...PUBLIC_ROUTES]);

export default clerkMiddleware(async (auth, req) => {
  // Cheap check with signedIn=false first: only when this could possibly
  // redirect (path is "/" and the UA is native) do we pay for an auth() call
  // to find out whether the user is actually signed in.
  if (nativeLandingRedirect(req.nextUrl.pathname, req.headers.get("user-agent"), false)) {
    const nativeTarget = nativeLandingRedirect(
      req.nextUrl.pathname,
      req.headers.get("user-agent"),
      Boolean((await auth()).userId)
    );
    if (nativeTarget) return NextResponse.redirect(new URL(nativeTarget, req.url));
  }

  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
