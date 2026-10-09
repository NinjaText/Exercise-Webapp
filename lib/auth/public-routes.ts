/**
 * Routes that skip Clerk's `auth.protect()` in `proxy.ts`.
 *
 * Kept in its own module (not exported from `proxy.ts`) so tests can build
 * the same matcher and prove a route is — or is not — public. Anything not
 * listed here requires a Clerk session.
 */
export const PUBLIC_ROUTES = [
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/onboarding(.*)",
  "/api/webhooks(.*)",
  "/api/stripe/webhook",
  "/p/(.*)",
  // Club join pages: the code form and Clerk sign-up render before any
  // session exists. /join/<slug>/complete checks auth itself.
  "/join/(.*)",
  // Admin "Manage club" hand-off: /enter runs before any house-coach session
  // exists and /ended must stay reachable when the session is rejected. The
  // single-use sign-in ticket and the signed club_admin_session marker are the
  // credentials, not a Clerk session.
  "/club-session/(.*)",
  "/api/checkout/program",
  "/privacy",
  "/terms",
  "/account-deleted",
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
] as const;
