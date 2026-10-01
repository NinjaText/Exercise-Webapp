import type { CoachingStatus, User } from "@prisma/client";
import { stripe } from "@/lib/stripe";
import { getOrgCapabilities } from "@/lib/org-capabilities";
import { getOrgForUser } from "@/lib/org-capabilities.server";
import { getCoachingForUser } from "@/lib/services/coaching.service";
import { formatStripeAmount } from "@/lib/utils/money";

/** What the member UI needs to render the coaching add-on. */
export interface CoachingViewModel {
  status: CoachingStatus | null;
  /** e.g. "$49.00 / month"; null when the Stripe price couldn't be read. */
  priceLabel: string | null;
}

/**
 * The coaching view-model for a member, or null when there is nothing to show:
 * not a CLIENT in a club, or the club doesn't offer coaching. Trainer-org
 * clients return before any coaching query.
 */
export async function getCoachingViewModel(user: Pick<User, "id" | "role" | "clerkOrgId">): Promise<CoachingViewModel | null> {
  if (user.role !== "CLIENT") return null;
  const org = await getOrgForUser(user);
  if (!org || getOrgCapabilities(org).billing !== "member" || !org.coachingStripePriceId) return null;

  const [coaching, price] = await Promise.all([
    getCoachingForUser(user.id),
    stripe.prices.retrieve(org.coachingStripePriceId).catch(() => null),
  ]);
  const priceLabel =
    price?.unit_amount != null
      ? `${formatStripeAmount(price.unit_amount, price.currency)} / ${price.recurring?.interval ?? "month"}`
      : null;
  return { status: coaching?.status ?? null, priceLabel };
}
