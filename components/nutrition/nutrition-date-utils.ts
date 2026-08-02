const MONTH_ABBREVIATIONS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Formats a Date's UTC calendar date as `yyyy-MM-dd`.
 *
 * Every nutrition date passed through this module is UTC-midnight-anchored
 * (guaranteed server-side by `resolveNutritionRange`/`parseNutritionRangeParams`,
 * and client-side by the UTC-anchored construction used throughout this
 * file). Extracting LOCAL wall-clock components here — e.g. via date-fns
 * `format`, or `getFullYear`/`getMonth`/`getDate` — would roll the
 * displayed/queried date back a day for any browser timezone behind UTC (all
 * of North and South America, for instance).
 */
export function toDateParam(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Formats a UTC-anchored Date as `MMM d` (e.g. "Jan 15") without shifting via local timezone. */
export function formatUtcDate(d: Date): string {
  return `${MONTH_ABBREVIATIONS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** The current date at UTC midnight — the reference point for "is today" / `max` clamps. */
export function utcToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
