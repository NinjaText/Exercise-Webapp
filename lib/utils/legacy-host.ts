/** Hosts the app was served from before the move to miaperformance.com. */
const LEGACY_HOSTS = new Set(["app.goinmotus.com", "goinmotus.com", "www.goinmotus.com"]);

const CANONICAL_ORIGIN = "https://www.miaperformance.com";

/**
 * Where a page request on an old domain should go: the same path and query on
 * the current domain, or null to serve it as is.
 *
 * `/api` stays put — webhook senders (Stripe, Clerk, Resend) don't follow
 * redirects, and unsubscribe links in emails already sent must keep working.
 * `/.well-known` stays put so domain verification files still resolve.
 */
export function legacyHostRedirect(url: URL): string | null {
  if (!LEGACY_HOSTS.has(url.hostname)) return null;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/.well-known/")) return null;
  return `${CANONICAL_ORIGIN}${url.pathname}${url.search}`;
}
