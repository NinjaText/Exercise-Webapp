import { NextResponse } from "next/server";
import { sweepClubStarterPrograms } from "@/lib/services/club-member.service";

// Cloning starter programs is slow; allow the sweep up to 5 minutes.
export const maxDuration = 300;

/**
 * GET /api/cron/club-starter-programs
 *
 * Assigns the next starter program to club members who finished the previous one.
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
    const result = await sweepClubStarterPrograms();
    return NextResponse.json(result);
  } catch (error) {
    console.error("club-starter-programs cron job failed:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
