/**
 * Pure, browser-safe helper for `app/onboarding/client/page.tsx`. Kept out of
 * the page module itself: a page's exports are constrained by Next's
 * `NextTypesPlugin` (only `default`, `generateMetadata`, etc. are valid page
 * exports — an extra named export fails `next build`'s type check).
 */

/**
 * Which org's branding the client onboarding page shows (spec §7: "org known
 * from `auth().orgId`" — refined below). Once the DB user exists, its
 * `clerkOrgId` is canonical (clients inherit their trainer's org, same as the
 * platform layout); before that row exists — a freshly invited client still
 * inside Clerk's ticket/SignUp flow, on their first hit of this page
 * post-auth — fall back to the Clerk session's `orgId` claim. Display only:
 * nothing else is derived from this value, and all existing redirects run
 * before it's used.
 */
export function resolveClientOnboardingOrgId(
  dbUser: { clerkOrgId: string | null } | null,
  authOrgId: string | null,
): string | null {
  return dbUser ? dbUser.clerkOrgId : authOrgId;
}
