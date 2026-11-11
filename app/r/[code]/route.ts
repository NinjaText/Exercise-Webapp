import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  normalizeReferralCode,
  REFERRAL_COOKIE,
  referralCookieOptions,
  referralLandingPath,
} from "@/lib/referrals/codes";

/**
 * /r/<CODE>[?to=professionals|individuals|pricing|home] — a contractor's
 * referral link. Counts the click, remembers the code in a cookie (last click
 * wins) and lands on a marketing page. Unknown or inactive codes still land
 * the visitor, just without attribution.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const res = NextResponse.redirect(new URL(referralLandingPath(req.nextUrl.searchParams.get("to")), req.url), 307);

  const code = normalizeReferralCode(decodeURIComponent(raw));
  if (!code) return res;
  try {
    const { count } = await prisma.contractor.updateMany({
      where: { referralCode: code, isActive: true },
      data: { linkClicks: { increment: 1 } },
    });
    if (count > 0) res.cookies.set(REFERRAL_COOKIE, code, referralCookieOptions);
  } catch (err) {
    console.error("[referrals] link click failed:", err);
  }
  return res;
}
