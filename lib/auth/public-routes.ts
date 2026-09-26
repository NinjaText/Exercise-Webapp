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
  // Universal-link / app-link association files: fetched by Apple and Google
  // with no session, and must return JSON rather than a sign-in redirect.
  "/.well-known/(.*)",
  // Minimum-version gate: the native shell must be able to check this before
  // (or without ever having) a signed-in session.
  "/api/mobile/config",
  // Push token cleanup after sign-out: no session by then; holding the device
  // token is the credential, and the route only deletes by that token.
  "/api/push/unregister",
] as const;
