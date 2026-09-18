import { toLocalCalendarDate } from "@/lib/utils/calendar-date";

/**
 * The session the client's primary "Start Workout" button should target:
 * today's if there is one, else the soonest upcoming. Completed and missed
 * sessions are never startable, and neither is anything already in the past.
 */
export function pickStartableSession(
  sessions: Record<string, unknown>[],
  now: Date
): Record<string, unknown> | null {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const candidates = sessions
    .filter((s) => {
      const status = s.status as string;
      if (status === "COMPLETED" || status === "MISSED") return false;
      const date = toLocalCalendarDate(s.scheduledDate as string | Date);
      return date.getTime() >= startOfToday.getTime();
    })
    .sort(
      (a, b) =>
        toLocalCalendarDate(a.scheduledDate as string | Date).getTime() -
        toLocalCalendarDate(b.scheduledDate as string | Date).getTime()
    );

  return candidates[0] ?? null;
}
