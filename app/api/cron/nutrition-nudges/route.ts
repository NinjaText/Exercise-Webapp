import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import * as nutritionService from "@/lib/services/nutrition.service";
import { createNotification, NOTIFICATION_TYPES } from "@/lib/services/notification.service";

const ML_PER_OZ = 29.5735;
const PROTEIN_SHORTFALL_THRESHOLD_G = 15;
const WATER_SHORTFALL_THRESHOLD_ML = 8 * ML_PER_OZ;
const MIN_EXPECTED_MEALS = 2;

/**
 * GET /api/cron/nutrition-nudges
 *
 * Runs once daily in the evening (see vercel.json) and checks every active
 * client's day-so-far nutrition, creating a notification for under-logged
 * meals, a protein shortfall, or a water shortfall. Dedups against any
 * still-unread nudge of the same type (not just same-day) so a client who
 * never reads/dismisses a nudge doesn't get a fresh near-duplicate every
 * night it recurs — the notification list would otherwise fill up with
 * copies of the same reminder.
 *
 * Note: this runs on a single fixed UTC schedule for all clients — it does
 * not account for per-client timezone, so "evening" is approximate.
 *
 * Secured with the same shared-secret convention as the other cron routes.
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
    const now = new Date();
    const todayKey = now.toISOString().slice(0, 10);

    const clients = await prisma.user.findMany({
      where: { role: "CLIENT", isActive: true },
      select: { id: true },
    });

    const outstandingNudges = await prisma.notification.findMany({
      where: {
        userId: { in: clients.map((c) => c.id) },
        type: {
          in: [
            NOTIFICATION_TYPES.NUTRITION_NUDGE_MEALS,
            NOTIFICATION_TYPES.NUTRITION_NUDGE_PROTEIN,
            NOTIFICATION_TYPES.NUTRITION_NUDGE_WATER,
          ],
        },
        isRead: false,
      },
      select: { userId: true, type: true },
    });
    const alreadyNudged = new Set(outstandingNudges.map((n) => `${n.userId}:${n.type}`));

    const results = await Promise.all(
      clients.map(async (client) => {
        const summary = await nutritionService.getDailySummary(client.id, now);
        const notifications: Parameters<typeof createNotification>[0][] = [];

        if (
          summary.mealsLogged < MIN_EXPECTED_MEALS &&
          !alreadyNudged.has(`${client.id}:${NOTIFICATION_TYPES.NUTRITION_NUDGE_MEALS}`)
        ) {
          notifications.push({
            userId: client.id,
            type: NOTIFICATION_TYPES.NUTRITION_NUDGE_MEALS,
            title: "Log your meals",
            body:
              summary.mealsLogged === 0
                ? "You haven't logged any meals today."
                : "You've only logged one meal today.",
            link: "/nutrition",
            metadata: { date: todayKey },
          });
        }

        if (
          summary.target.proteinG &&
          summary.remaining.proteinG !== null &&
          summary.remaining.proteinG > PROTEIN_SHORTFALL_THRESHOLD_G &&
          !alreadyNudged.has(`${client.id}:${NOTIFICATION_TYPES.NUTRITION_NUDGE_PROTEIN}`)
        ) {
          notifications.push({
            userId: client.id,
            type: NOTIFICATION_TYPES.NUTRITION_NUDGE_PROTEIN,
            title: "Protein goal reminder",
            body: `You're ${Math.round(summary.remaining.proteinG)}g short of your protein goal today.`,
            link: "/nutrition",
            metadata: { date: todayKey },
          });
        }

        if (
          summary.target.waterMl &&
          summary.remaining.waterMl !== null &&
          summary.remaining.waterMl > WATER_SHORTFALL_THRESHOLD_ML &&
          !alreadyNudged.has(`${client.id}:${NOTIFICATION_TYPES.NUTRITION_NUDGE_WATER}`)
        ) {
          notifications.push({
            userId: client.id,
            type: NOTIFICATION_TYPES.NUTRITION_NUDGE_WATER,
            title: "Water goal reminder",
            body: `Only ${Math.round(summary.remaining.waterMl / ML_PER_OZ)} oz left to hit your water goal today.`,
            link: "/nutrition",
            metadata: { date: todayKey },
          });
        }

        await Promise.all(notifications.map((n) => createNotification(n)));
        return notifications.length;
      })
    );

    const sent = results.reduce((sum, n) => sum + n, 0);

    return NextResponse.json({ sent });
  } catch (error) {
    console.error("Nutrition nudges cron job failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
