/**
 * Billing-cycle windows for AI allowances. Pure — no DB.
 *
 * - Subscription with a `currentPeriodEnd` (Stripe-backed): monthly windows
 *   anchored on the billing day, i.e. [periodEnd − 1 month, periodEnd). A
 *   stale period end (webhook lag) is rolled forward month by month, and a
 *   far-future one (e.g. an annual plan) is rolled back, so the window always
 *   contains `now` and allowances still reset monthly.
 * - Anything else (trial without a Stripe sub, exempt accounts, clubs,
 *   system): the UTC calendar month.
 */

export interface CycleWindow {
  /** Inclusive. Also the period counter's key. */
  start: Date;
  /** Exclusive. When the allowance resets. */
  end: Date;
  source: "subscription" | "calendar";
}

export interface CycleSubscription {
  currentPeriodEnd: Date | null;
}

/** Adds `months` in UTC, clamping the day (Jan 31 + 1 month → Feb 28/29). */
export function addMonthsUTC(date: Date, months: number): Date {
  const m = date.getUTCMonth() + months;
  const year = date.getUTCFullYear() + Math.floor(m / 12);
  const month = ((m % 12) + 12) % 12;
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      year,
      month,
      Math.min(date.getUTCDate(), daysInMonth),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds()
    )
  );
}

export function calendarMonthWindow(now: Date): CycleWindow {
  return {
    start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
    source: "calendar",
  };
}

const MAX_STEPS = 240; // 20 years of months — guards against absurd dates.

export function computeCycleWindow(sub: CycleSubscription | null | undefined, now: Date): CycleWindow {
  const anchor = sub?.currentPeriodEnd;
  if (!anchor || Number.isNaN(anchor.getTime())) return calendarMonthWindow(now);

  // Offsets are always applied to the original anchor (never chained), so day
  // clamping in short months can't drift the billing day.
  let offset = 0;
  let steps = 0;
  while (addMonthsUTC(anchor, offset) <= now && steps++ < MAX_STEPS) offset++;
  while (addMonthsUTC(anchor, offset - 1) > now && steps++ < MAX_STEPS) offset--;
  if (steps >= MAX_STEPS) return calendarMonthWindow(now);
  return { start: addMonthsUTC(anchor, offset - 1), end: addMonthsUTC(anchor, offset), source: "subscription" };
}
