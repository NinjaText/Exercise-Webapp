import { prisma } from "@/lib/prisma";
import { computeScheduleVariance } from "@/lib/services/session.service";

/**
 * One-time backfill: computes scheduleVariance for every WorkoutSessionV2
 * that was already COMPLETED before this field existed. Idempotent — only
 * matches sessions where scheduleVariance is still null.
 */
async function backfillScheduleVariance() {
  const sessions = await prisma.workoutSessionV2.findMany({
    where: {
      status: "COMPLETED",
      completedAt: { not: null },
      OR: [{ scheduleVariance: null }, { scheduleVariance: { isSet: false } }],
    },
    select: { id: true, scheduledDate: true, completedAt: true },
  });

  let updated = 0;
  for (const session of sessions) {
    if (!session.completedAt) continue;
    const scheduleVariance = computeScheduleVariance(session.scheduledDate, session.completedAt);
    await prisma.workoutSessionV2.update({
      where: { id: session.id },
      data: { scheduleVariance },
    });
    updated++;
  }

  console.log(`Backfilled scheduleVariance on ${updated} session(s).`);
}

backfillScheduleVariance()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Backfill failed:", error);
    process.exit(1);
  });
