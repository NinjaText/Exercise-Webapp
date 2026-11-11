import { NextResponse } from "next/server";
import { sweepReferrals } from "@/lib/referrals/sweep";

// Stripe calls per open referral; allow a long run.
export const maxDuration = 300;

/**
 * GET /api/cron/referral-retention
 *
 * Daily referral upkeep: backfills missed payments from Stripe, marks churn,
 * verifies retention with Stripe and awards retention bonuses.
 *
 * Called by Vercel Cron (see vercel.json). Secured with the shared
 * CRON_SECRET convention: Authorization: Bearer <CRON_SECRET>.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("Authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    return NextResponse.json(await sweepReferrals());
  } catch (error) {
    console.error("referral-retention cron job failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
