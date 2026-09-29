import { NextResponse } from "next/server";
import { sendDueTrialReminders } from "@/lib/services/member-trial-reminder.service";

/**
 * GET /api/cron/member-trial-reminders
 *
 * Sends due trial-ending reminder emails to club members.
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

  try {
    const result = await sendDueTrialReminders();
    return NextResponse.json(result);
  } catch (error) {
    console.error("member-trial-reminders cron job failed:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
