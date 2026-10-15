import type { Organization } from "@prisma/client";

/**
 * A club whose membership costs $0: it has no Stripe membership price, and its
 * members are ACTIVE from the moment they join (no trial, no paywall). The
 * admin form saves a "0" membership amount this way; every club with a paid
 * membership has a `stripePriceId`, so "no price" always means "free".
 */
export function isFreeClub(club: Pick<Organization, "stripePriceId">): boolean {
  return !club.stripePriceId;
}
