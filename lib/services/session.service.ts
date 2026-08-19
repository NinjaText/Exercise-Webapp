import { prisma } from "@/lib/prisma";

/**
 * How long after a session's scheduled date/time we wait before considering it
 * "missed". `WorkoutSessionV2.scheduledDate` carries a real time component (the
 * reminders cron in `app/api/reminders/route.ts` formats both the date and the
 * time from it), so this grace period is measured from that exact instant.
 *
 * 24 hours is chosen deliberately:
 *  - It mirrors the 24h window convention already used by the reminders route,
 *    keeping the two scheduled jobs consistent.
 *  - It gives a client the remainder of the scheduled day (and then some) to
 *    complete a session before it is marked missed, which is forgiving of
 *    late-in-the-day workouts.
 *  - Being a fixed offset from the stored (UTC) instant, it avoids the
 *    timezone ambiguity of an "end of the scheduled day" rule.
 */
export const MISSED_SESSION_GRACE_HOURS = 24;

export type ScheduleVariance = "ON_TIME" | "EARLY" | "DELAYED";

/**
 * Compares the UTC calendar day of `completedAt` to `scheduledDate`.
 * `scheduledDate` is stored UTC-midnight-anchored; this comparison runs
 * server-side (not feeding a browser-local-time UI library like
 * lib/utils/calendar-date.ts's helpers do), so a direct UTC year/month/day
 * comparison is correct here. This carries the same small timezone
 * imprecision MISSED_SESSION_GRACE_HOURS above already accepts.
 */
export function computeScheduleVariance(
  scheduledDate: Date,
  completedAt: Date
): ScheduleVariance {
  const scheduledDay = Date.UTC(
    scheduledDate.getUTCFullYear(),
    scheduledDate.getUTCMonth(),
    scheduledDate.getUTCDate()
  );
  const completedDay = Date.UTC(
    completedAt.getUTCFullYear(),
    completedAt.getUTCMonth(),
    completedAt.getUTCDate()
  );

  if (completedDay === scheduledDay) return "ON_TIME";
  return completedDay < scheduledDay ? "EARLY" : "DELAYED";
}

const ADHERENCE_SESSION_LIMIT = 100;

export async function getClientPastSessions(clientId: string) {
  return prisma.workoutSessionV2.findMany({
    where: {
      clientId,
      scheduledDate: { lte: new Date() },
    },
    include: {
      workout: {
        select: {
          name: true,
          program: { select: { name: true } },
        },
      },
    },
    orderBy: { scheduledDate: "desc" },
    take: ADHERENCE_SESSION_LIMIT,
  });
}

export function computeAdherenceStats(
  sessions: { status: string; overallRPE: number | null }[]
) {
  const total = sessions.length;
  const completed = sessions.filter((s) => s.status === "COMPLETED").length;
  const missed = sessions.filter((s) => s.status === "MISSED").length;
  const skipped = sessions.filter((s) => s.status === "SKIPPED").length;
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  const sessionsWithRPE = sessions.filter((s) => s.overallRPE != null);
  const avgRPE =
    sessionsWithRPE.length > 0
      ? Math.round(
          (sessionsWithRPE.reduce((sum, s) => sum + (s.overallRPE ?? 0), 0) /
            sessionsWithRPE.length) *
            10
        ) / 10
      : null;

  return { total, completed, missed, skipped, completionRate, avgRPE };
}

export async function getSessionsForClient(
  clientId: string,
  options?: { from?: Date; to?: Date }
) {
  // Calendar list view: callers only need enough to render a session pill
  // (id/date/status) and count exercises per workout block. Full session
  // detail (sets, exercise records, exercise logs, feedback) is loaded lazily
  // per-session via getSessionById/getSessionWithWorkout when a session is
  // actually opened — fetching that depth for every session up front was
  // the cause of a 44s+ page load with no benefit, since it was discarded
  // unused by every caller.
  return prisma.workoutSessionV2.findMany({
    where: {
      clientId,
      ...(options?.from || options?.to
        ? {
            scheduledDate: {
              ...(options?.from && { gte: options.from }),
              ...(options?.to && { lte: options.to }),
            },
          }
        : {}),
    },
    select: {
      id: true,
      scheduledDate: true,
      status: true,
      workout: {
        select: {
          id: true,
          name: true,
          program: { select: { trainerId: true } },
          blocks: {
            select: {
              exercises: {
                select: { id: true },
                orderBy: { orderIndex: "asc" },
              },
            },
            orderBy: { orderIndex: "asc" },
          },
        },
      },
    },
    orderBy: { scheduledDate: "asc" },
  });
}

export async function getSessionById(sessionId: string) {
  return prisma.workoutSessionV2.findUnique({
    where: { id: sessionId },
    include: {
      workout: {
        include: {
          program: { select: { id: true, name: true } },
          blocks: {
            include: {
              exercises: {
                include: {
                  exercise: { include: { media: true } },
                  sets: { orderBy: { orderIndex: "asc" } },
                },
                orderBy: { orderIndex: "asc" },
              },
            },
            orderBy: { orderIndex: "asc" },
          },
        },
      },
      exerciseLogs: {
        include: { setLogs: { orderBy: { setIndex: "asc" } } },
        orderBy: { orderIndex: "asc" },
      },
      feedback: true,
    },
  });
}

export type RescheduledBy = "client" | "coach" | "system";

export async function rescheduleSession(
  sessionId: string,
  newDate: Date,
  rescheduledBy: RescheduledBy
) {
  const existing = await prisma.workoutSessionV2.findUnique({
    where: { id: sessionId },
    select: {
      scheduledDate: true,
      originalScheduledDate: true,
      status: true,
      completedAt: true,
    },
  });
  if (!existing) {
    throw new Error(`Session ${sessionId} not found`);
  }

  return prisma.workoutSessionV2.update({
    where: { id: sessionId },
    data: {
      originalScheduledDate: existing.originalScheduledDate ?? existing.scheduledDate,
      rescheduledBy,
      rescheduledAt: new Date(),
      scheduledDate: newDate,
      ...(existing.status === "COMPLETED" && existing.completedAt
        ? { scheduleVariance: computeScheduleVariance(newDate, existing.completedAt) }
        : {}),
    },
  });
}

export async function updateSessionStatus(
  sessionId: string,
  status: string,
  data?: {
    startedAt?: Date;
    completedAt?: Date;
    overallRPE?: number;
    overallNotes?: string;
    durationMinutes?: number;
  }
) {
  return prisma.workoutSessionV2.update({
    where: { id: sessionId },
    data: { status, ...data },
  });
}

export async function logExercise(
  sessionId: string,
  blockExerciseId: string,
  orderIndex: number,
  setLogs: {
    setIndex: number;
    actualReps?: number;
    actualWeight?: number;
    actualDuration?: number;
    actualRPE?: number;
    notes?: string;
  }[]
) {
  return prisma.sessionExerciseLog.create({
    data: {
      sessionId,
      blockExerciseId,
      orderIndex,
      status: "COMPLETED",
      completedAt: new Date(),
      setLogs: {
        create: setLogs.map((sl) => ({
          ...sl,
          completedAt: new Date(),
        })),
      },
    },
    include: { setLogs: true },
  });
}

export async function submitSessionFeedback(
  sessionId: string,
  clientId: string,
  rating: string,
  comment?: string
) {
  return prisma.sessionFeedback.create({
    data: {
      sessionId,
      clientId,
      rating: rating as "FELT_GOOD" | "MILD_DISCOMFORT" | "PAINFUL" | "UNSURE_HOW_TO_PERFORM",
      comment,
    },
  });
}

export async function getSessionsForTrainer(
  trainerId: string,
  options?: { from?: Date; to?: Date; clientId?: string }
) {
  return prisma.workoutSessionV2.findMany({
    where: {
      workout: {
        program: { trainerId },
      },
      ...(options?.clientId && { clientId: options.clientId }),
      ...(options?.from || options?.to
        ? {
            scheduledDate: {
              ...(options?.from && { gte: options.from }),
              ...(options?.to && { lte: options.to }),
            },
          }
        : {}),
    },
    include: {
      client: { select: { id: true, firstName: true, lastName: true } },
      workout: {
        include: {
          program: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { scheduledDate: "asc" },
  });
}

/**
 * Marks every still-`SCHEDULED` session whose scheduled date/time is more than
 * {@link MISSED_SESSION_GRACE_HOURS} in the past as `"MISSED"`.
 *
 * The query is intentionally stateless — it simply asks "which SCHEDULED
 * sessions are now past their grace period?" — so it both catches newly overdue
 * sessions and retroactively fixes any that were already overdue before this job
 * existed. It never touches sessions in IN_PROGRESS / COMPLETED / MISSED /
 * SKIPPED states.
 *
 * Intended to be driven by the `/api/cron/mark-missed-sessions` cron route.
 *
 * @param now - Injectable "current time" for deterministic testing; defaults to
 *   the real current time in production.
 * @returns The number of sessions transitioned to MISSED.
 */
export async function markPastDueSessionsMissed(
  now: Date = new Date()
): Promise<{ markedMissed: number }> {
  const cutoff = new Date(
    now.getTime() - MISSED_SESSION_GRACE_HOURS * 60 * 60 * 1000
  );

  const result = await prisma.workoutSessionV2.updateMany({
    where: {
      status: "SCHEDULED",
      scheduledDate: { lt: cutoff },
    },
    data: { status: "MISSED" },
  });

  return { markedMissed: result.count };
}

export async function getUpcomingSessions(clientId: string, limit = 5) {
  return prisma.workoutSessionV2.findMany({
    where: {
      clientId,
      status: "SCHEDULED",
      scheduledDate: { gte: new Date() },
    },
    include: {
      workout: {
        include: {
          program: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { scheduledDate: "asc" },
    take: limit,
  });
}
