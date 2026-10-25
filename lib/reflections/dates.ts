/**
 * Reflection dates follow the app's UTC-anchored calendar convention (see
 * lib/utils/calendar-date.ts): "Oct 22" is stored as 2026-10-22T00:00:00Z.
 * "Today" is the client's LOCAL calendar day, the same day the dashboard's Up
 * Next hero uses: the browser sends its local "YYYY-MM-DD" key, the server
 * accepts it only within a day of its own UTC date (resolveClientDayKey) and
 * queries the matching UTC-midnight Date.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** UTC midnight of the calendar day `value` falls on (in UTC). */
export function toUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

/** "YYYY-MM-DD" for a UTC-anchored day. */
export function toDateKey(value: Date): string {
  return toUtcDay(value).toISOString().slice(0, 10);
}

/** Parses a "YYYY-MM-DD" key into its UTC-midnight Date, or null when malformed. */
export function parseDateKey(key: string): Date | null {
  if (!DATE_KEY_PATTERN.test(key)) return null;
  const date = new Date(`${key}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || toDateKey(date) !== key) return null;
  return date;
}

export function isValidDateKey(key: string): boolean {
  return parseDateKey(key) !== null;
}

export function addUtcDays(day: Date, days: number): Date {
  return new Date(toUtcDay(day).getTime() + days * DAY_MS);
}

/** Whole calendar days from `from` to `to` (negative when `to` is earlier). */
export function utcDaysBetween(from: Date, to: Date): number {
  return Math.round((toUtcDay(to).getTime() - toUtcDay(from).getTime()) / DAY_MS);
}

export type ScheduleDates =
  | { mode: "single"; date: string }
  | { mode: "recurring"; weekdays: number[]; startDate: string; endDate: string };

/**
 * Expands a schedule into its UTC-midnight days. Single → one day; recurring →
 * every day between start and end (inclusive) whose weekday is selected.
 * Returns [] for an inverted or malformed range; span limits are enforced by
 * the validator, not here.
 */
export function expandScheduleDates(schedule: ScheduleDates): Date[] {
  if (schedule.mode === "single") {
    const date = parseDateKey(schedule.date);
    return date ? [date] : [];
  }

  const start = parseDateKey(schedule.startDate);
  const end = parseDateKey(schedule.endDate);
  if (!start || !end || end < start) return [];

  const weekdays = new Set(schedule.weekdays);
  const days: Date[] = [];
  for (let day = start; day <= end; day = addUtcDays(day, 1)) {
    if (weekdays.has(day.getUTCDay())) days.push(day);
  }
  return days;
}

/**
 * A browser-supplied local day key, accepted only when it is within one day
 * of the server's UTC date (every real timezone is). Returns its UTC-midnight
 * Date, or null for a malformed or out-of-range key.
 */
export function resolveClientDayKey(key: string, now: Date): Date | null {
  const day = parseDateKey(key);
  if (!day) return null;
  return Math.abs(utcDaysBetween(now, day)) <= 1 ? day : null;
}
