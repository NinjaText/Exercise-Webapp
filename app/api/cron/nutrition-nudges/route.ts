import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import * as nutritionService from "@/lib/services/nutrition.service";
import { notifyUser, NOTIFICATION_TYPES } from "@/lib/services/notification.service";
import { appBaseUrl } from "@/lib/utils/app-url";
import { ML_PER_OZ } from "@/lib/constants/nutrition";

const PROTEIN_SHORTFALL_THRESHOLD_G = 15;

const WATER_SHORTFALL_THRESHOLD_ML = 8 * ML_PER_OZ;
const MIN_EXPECTED_MEALS = 2;

/**
 * How many clients are processed at once.
 *
 * Each client costs a nutrition summary read plus up to three `notifyUser`
 * calls, and each of those is several DB round-trips and one Resend request.
 * Resend rate-limits per account and reports a 429 in the response body, which
 * `sendEmail` turns into `false` with no retry — an unbounded fan-out over the
 * whole active client list would silently drop mail. 10 keeps the run parallel
 * without putting the whole roster in flight at once.
 */
const CLIENT_BATCH_SIZE = 10;

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

    const processClient = async (client: { id: string }) => {
      const summary = await nutritionService.getDailySummary(client.id, now);
      const notifications: Parameters<typeof notifyUser>[0][] = [];

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

      const nutritionLink = `${appBaseUrl()}/nutrition`;
      await Promise.all(
        notifications.map((n) =>
          notifyUser({
            ...n,
            email: { headline: n.title, detail: n.body ?? "", nutritionLink },
          })
        )
      );
      return notifications.length;
    };

    // Bounded fan-out: one batch of clients in flight at a time.
    let sent = 0;
    for (let i = 0; i < clients.length; i += CLIENT_BATCH_SIZE) {
      const batch = clients.slice(i, i + CLIENT_BATCH_SIZE);
      const counts = await Promise.all(batch.map(processClient));
      sent += counts.reduce((sum, n) => sum + n, 0);
    }

    return NextResponse.json({ sent });
  } catch (error) {
    console.error("Nutrition nudges cron job failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
