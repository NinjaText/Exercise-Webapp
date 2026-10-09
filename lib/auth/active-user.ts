import { isStaleHouseCoach } from "@/lib/clubs/house-coach-guard";

/**
 * Server actions and API routes that resolve the caller from Clerk directly
 * (not via getCurrentUser, which redirects deactivated accounts) wrap the DB
 * lookup in this so a deactivated account — e.g. a removed trainer — is
 * treated as "no user" and refused by the existing `!dbUser` checks.
 * Only an explicit `isActive === false` counts, so partial mocks and legacy
 * rows keep working.
 */
export function activeUserOnly<T extends { isActive?: boolean } | null>(user: T): T | null {
  if (!user || user.isActive === false) return null;
  return user;
}

type CallerFields = { isActive?: boolean; id: string; clerkId: string; role: string };

/**
 * activeUserOnly plus the house-coach backstop from getCurrentUser: a club's
 * house coach without a live admin marker bound to them is also treated as
 * "no user". Server actions use this; API route handlers rely on the proxy.
 */
export async function activeCallerOnly<T extends CallerFields | null>(user: T): Promise<T | null> {
  const active = activeUserOnly(user);
  if (!active) return null;
  if (await isStaleHouseCoach(active)) return null;
  return active;
}
