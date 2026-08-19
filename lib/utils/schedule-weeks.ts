import { startOfWeek } from "date-fns";
import { toLocalCalendarDate } from "@/lib/utils/calendar-date";
import type { SessionData } from "@/components/programs/schedule-shared";

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface GroupedSchedule {
  /** Sessions bucketed by program week, index 0-based, sorted ascending within each week. Weeks with no sessions are empty arrays. */
  weeks: SessionData[][];
  /** Index into `weeks` for the week containing `today`, clamped to the program's range. */
  defaultWeekIndex: number;
}

/**
 * Groups a client's sessions into program weeks anchored to the earliest
 * session's calendar week, so "Week 1" always means the program's actual
 * first week rather than an arbitrary fixed date.
 */
export function groupSessionsByWeek(
  sessions: SessionData[],
  today: Date
): GroupedSchedule {
  if (sessions.length === 0) {
    return { weeks: [], defaultWeekIndex: 0 };
  }

  const localDates = sessions.map((s) => toLocalCalendarDate(s.scheduledDate));
  const earliestMonday = localDates.reduce(
    (min, d) => (d < min ? d : min),
    localDates[0]
  );
  const weekZeroMonday = startOfWeek(earliestMonday, { weekStartsOn: 1 });

  const weekIndexOf = (date: Date) =>
    Math.round(
      (startOfWeek(date, { weekStartsOn: 1 }).getTime() - weekZeroMonday.getTime()) /
        ONE_WEEK_MS
    );

  const indexed = sessions.map((session, i) => ({
    session,
    weekIndex: weekIndexOf(localDates[i]),
    localDate: localDates[i],
  }));

  const totalWeeks = Math.max(...indexed.map((e) => e.weekIndex)) + 1;
  const weeks: SessionData[][] = Array.from({ length: totalWeeks }, () => []);
  for (const entry of indexed) {
    weeks[entry.weekIndex].push(entry.session);
  }
  for (const week of weeks) {
    week.sort(
      (a, b) =>
        toLocalCalendarDate(a.scheduledDate).getTime() -
        toLocalCalendarDate(b.scheduledDate).getTime()
    );
  }

  const defaultWeekIndex = Math.max(
    0,
    Math.min(weekIndexOf(today), totalWeeks - 1)
  );

  return { weeks, defaultWeekIndex };
}
