/**
 * Server actions and API routes that resolve the caller from Clerk directly
 * (not via getCurrentUser, which redirects deactivated accounts) wrap the DB
 * lookup in this so a deactivated account — e.g. a removed club trainer — is
 * treated as "no user" and refused by the existing `!dbUser` checks.
 * Only an explicit `isActive === false` counts, so partial mocks and legacy
 * rows keep working.
 */
export function activeUserOnly<T extends { isActive?: boolean } | null>(user: T): T | null {
  if (!user || user.isActive === false) return null;
  return user;
}
