import { NextResponse } from "next/server";
import { sendDueTrialReminders } from "@/lib/services/member-trial-reminder.service";
import { sweepCoachingForExpiredTrials } from "@/lib/services/coaching.service";

/**
 * GET /api/cron/member-trial-reminders
 *
 * Sends due trial-ending reminder emails to club members, then ends the
 * coaching of members whose no-card trial has run out (no Stripe event fires
 * for that, so nothing else would stop the coaching subscription). The sweep
 * lives here rather than in the 15-minute starter-program cron because it is
 * a trial-end rule and coaching bills monthly — see
 * `sweepCoachingForExpiredTrials`.
 *
 * Intended to be called by Vercel Cron (see vercel.json). Secured with the
 * shared CRON_SECRET convention: when set, the caller must present it as
 *   Authorization: Bearer <CRON_SECRET>
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("Authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // Independent jobs: one failing must not skip the other.
  let reminders: Awaited<ReturnType<typeof sendDueTrialReminders>> | null = null;
  let coaching: Awaited<ReturnType<typeof sweepCoachingForExpiredTrials>> | null = null;
  try {
    reminders = await sendDueTrialReminders();
  } catch (error) {
    console.error("member-trial-reminders cron job failed:", error);
  }
  try {
    coaching = await sweepCoachingForExpiredTrials();
  } catch (error) {
    console.error("member-trial-reminders coaching sweep failed:", error);
  }

  if (!reminders || !coaching) {
    return NextResponse.json({ error: "Internal server error", reminders, coaching }, { status: 500 });
  }
  return NextResponse.json({ ...reminders, coaching });
}
