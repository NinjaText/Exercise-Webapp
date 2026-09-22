import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/onboarding(.*)",
  "/api/webhooks(.*)",
  "/api/stripe/webhook",
  "/p/(.*)",
  "/api/checkout/program",
  // Cron endpoints are called by Vercel Cron (no Clerk session) and secure
  // themselves independently via a CRON_SECRET bearer check.
  "/api/cron(.*)",
  // Registered as a Vercel Cron in vercel.json but living outside /api/cron.
  // Same deal: no Clerk session, an `Authorization: Bearer <CRON_SECRET>`
  // header Clerk cannot parse, and its own CRON_SECRET check inside the route.
  "/api/reminders",
  // Unsubscribe links are clicked straight from a mail client, where there is
  // no Clerk session by definition. The opaque token in the URL is the
  // credential, and the route resolves it itself.
  "/api/notifications/unsubscribe",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
