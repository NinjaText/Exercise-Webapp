import { NextResponse } from "next/server";
import { getCurrentUserOrNull } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { generateCoachingInsights } from "@/lib/services/dashboard-ai-insights.service";
import { DISMISSAL_WINDOW_DAYS } from "@/lib/constants/insights";

export async function GET() {
  try {
    const user = await getCurrentUserOrNull();
    if (!user || user.role !== "TRAINER") {
      return NextResponse.json({ insights: [] });
    }

    const insights = await generateCoachingInsights(user.id);
    if (insights.length === 0) {
      return NextResponse.json({ insights: [] });
    }

    // A dismissal suppresses the same (client, kind) pairing for a fixed
    // window — long enough that the insight doesn't reappear on the next
    // regeneration, short enough that a genuinely persistent problem
    // eventually resurfaces.
    const windowStart = new Date(Date.now() - DISMISSAL_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const dismissed = await prisma.dismissedInsight.findMany({
      where: {
        trainerId: user.id,
        clientId: { in: insights.map((i) => i.clientId) },
        dismissedAt: { gte: windowStart },
      },
      select: { clientId: true, kind: true },
    });
    const suppressed = new Set(dismissed.map((d) => `${d.clientId}:${d.kind}`));

    return NextResponse.json({
      insights: insights.filter((i) => !suppressed.has(`${i.clientId}:${i.kind}`)),
    });
  } catch (error) {
    console.error("AI insights route failed:", error);
    return NextResponse.json({ insights: [] });
  }
}
