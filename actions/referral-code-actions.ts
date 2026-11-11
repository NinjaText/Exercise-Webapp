"use server";

import { prisma } from "@/lib/prisma";
import { normalizeReferralCode } from "@/lib/referrals/codes";

/**
 * Sign-up form check: is this an active referral code? Public (runs before an
 * account exists), so it answers yes/no only — never who the code belongs to.
 */
export async function checkReferralCode(raw: string): Promise<{ valid: boolean; code: string | null }> {
  const code = normalizeReferralCode(raw);
  if (!code) return { valid: false, code: null };
  try {
    const hit = await prisma.contractor.findFirst({
      where: { referralCode: code, isActive: true },
      select: { id: true },
    });
    return { valid: Boolean(hit), code };
  } catch (err) {
    console.error("[referrals] code check failed:", err);
    // Unknown, not invalid: the code still travels with the sign-up and is
    // re-checked at onboarding.
    return { valid: true, code };
  }
}
