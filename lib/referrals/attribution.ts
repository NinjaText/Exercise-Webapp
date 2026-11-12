import { cookies } from "next/headers";
import type { ReferralSubscriberType, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isBillingExempt } from "@/lib/billing/exempt";
import { normalizeReferralCode, REFERRAL_COOKIE } from "./codes";
import { snapshotTerms } from "./terms";

export type AttributionResult =
  | { attributed: true; referralId: string; contractorId: string }
  | {
      attributed: false;
      reason:
        | "no_code"
        | "unknown_code"
        | "inactive_contractor"
        | "already_referred"
        | "existing_customer"
        | "exempt"
        | "self_referral";
    };

export interface AttributionInput {
  user: Pick<User, "id" | "email" | "firstName" | "lastName" | "billingExemptAt">;
  subscriberType: ReferralSubscriberType;
  /** Typed at sign-up (Clerk unsafeMetadata.referralCode). Wins over the cookie. */
  typedCode?: unknown;
  /** From the /r/<code> link cookie. */
  cookieCode?: unknown;
}

/** The code typed into the sign-up form, stored by Clerk on the user. */
export function typedReferralCode(unsafeMetadata: unknown): string | null {
  return normalizeReferralCode((unsafeMetadata as { referralCode?: unknown } | null | undefined)?.referralCode);
}

/** True when this account has already paid MIA (or started a Stripe subscription) before being referred. */
async function isExistingCustomer(userId: string, type: ReferralSubscriberType): Promise<boolean> {
  const row =
    type === "TRAINER"
      ? await prisma.trainerSubscription.findUnique({ where: { trainerId: userId }, select: { stripeSubscriptionId: true } })
      : await prisma.memberSubscription.findUnique({ where: { userId }, select: { stripeSubscriptionId: true } });
  return Boolean(row?.stripeSubscriptionId);
}

/**
 * Links a newly onboarded account to the contractor whose code it arrived
 * with, freezing the contractor's current plan terms onto the referral.
 * First attribution wins; repeat calls are no-ops.
 */
export async function attributeReferral(input: AttributionInput): Promise<AttributionResult> {
  const typed = normalizeReferralCode(input.typedCode);
  const fromCookie = normalizeReferralCode(input.cookieCode);
  const code = typed ?? fromCookie;
  if (!code) return { attributed: false, reason: "no_code" };

  const { user, subscriberType } = input;
  if (isBillingExempt(user)) return { attributed: false, reason: "exempt" };

  const already = await prisma.referral.findUnique({ where: { referredUserId: user.id }, select: { id: true } });
  if (already) return { attributed: false, reason: "already_referred" };

  const contractor = await prisma.contractor.findUnique({ where: { referralCode: code }, include: { plan: true } });
  if (!contractor) return { attributed: false, reason: "unknown_code" };
  if (!contractor.isActive) return { attributed: false, reason: "inactive_contractor" };
  if (contractor.email.trim().toLowerCase() === user.email.trim().toLowerCase()) {
    return { attributed: false, reason: "self_referral" };
  }
  if (await isExistingCustomer(user.id, subscriberType)) return { attributed: false, reason: "existing_customer" };

  try {
    const referral = await prisma.referral.create({
      data: {
        contractorId: contractor.id,
        referredUserId: user.id,
        referredEmail: user.email,
        referredName: `${user.firstName} ${user.lastName}`.trim() || user.email,
        subscriberType,
        source: typed && typed !== fromCookie ? "code" : "link",
        codeUsed: code,
        status: "SIGNED_UP",
        ...snapshotTerms(contractor.plan, subscriberType),
        // Explicit nulls: Mongo `{ field: null }` filters miss unwritten fields.
        firstPaidAt: null,
        firstPaidInvoiceId: null,
        retentionStartAt: null,
        retainedAt: null,
        retentionBonusId: null,
        churnedAt: null,
      },
      select: { id: true },
    });
    return { attributed: true, referralId: referral.id, contractorId: contractor.id };
  } catch (err) {
    // A concurrent call attributed the same user first.
    if ((err as { code?: string }).code === "P2002") return { attributed: false, reason: "already_referred" };
    throw err;
  }
}

/**
 * Request-scoped wrapper for sign-up paths: reads the link cookie, never
 * throws (a referral problem must not block onboarding), and clears the
 * cookie when the caller can write cookies.
 */
export async function attributeReferralFromRequest(args: {
  user: AttributionInput["user"];
  subscriberType: ReferralSubscriberType;
  clerkUnsafeMetadata: unknown;
  clearCookie?: boolean;
}): Promise<AttributionResult | null> {
  try {
    const jar = await cookies();
    const result = await attributeReferral({
      user: args.user,
      subscriberType: args.subscriberType,
      typedCode: typedReferralCode(args.clerkUnsafeMetadata),
      cookieCode: jar.get(REFERRAL_COOKIE)?.value,
    });
    if (args.clearCookie && (result.attributed || result.reason !== "no_code")) {
      try {
        jar.delete(REFERRAL_COOKIE);
      } catch {
        // Server components can't write cookies; it expires on its own.
      }
    }
    return result;
  } catch (err) {
    console.error("[referrals] attribution failed for user", args.user.id, err);
    return null;
  }
}
