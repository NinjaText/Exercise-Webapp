/**
 * Program/workout dates (Program.startDate, WorkoutSessionV2.scheduledDate) are
 * stored UTC-midnight-anchored — e.g. "Aug 14" is `2026-08-14T00:00:00.000Z`,
 * the same convention used by components/nutrition/nutrition-date-utils.ts.
 *
 * UI libraries in this codebase (react-big-calendar, date-fns `format`/
 * `isSameDay`, native `getDate()`) all read LOCAL wall-clock components.
 * Handed a UTC-midnight Date directly, they roll the displayed day back by
 * one for any browser timezone behind UTC (all of North and South America),
 * while timezones ahead of UTC (e.g. Pakistan, UTC+5) are unaffected — which
 * is why this only shows up for some users.
 *
 * Use `toLocalCalendarDate` before handing a scheduled date to any
 * local-time-based consumer, and `toUtcCalendarDate` before persisting a
 * date that a local-time-based consumer produced (e.g. drag-to-reschedule).
 */

/** Reinterprets a UTC-anchored date's Y/M/D as local wall-clock components, so local-time consumers (react-big-calendar, date-fns) place it on the correct calendar day. */
export function toLocalCalendarDate(value: Date | string): Date {
  const d = typeof value === "string" ? new Date(value) : value;
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Inverse of toLocalCalendarDate: reinterprets a local-time Date's Y/M/D as the canonical UTC-midnight-anchored calendar date for persistence. */
export function toUtcCalendarDate(value: Date): Date {
  return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
}
