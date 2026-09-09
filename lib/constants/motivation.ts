/**
 * Static encouragement copy shown to clients. Deliberately constants rather
 * than DB rows — this is product copy, not data, and it must render instantly
 * with no fetch on the dashboard's empty states.
 */

export const MOTIVATIONAL_QUOTES = [
  "Small steps every day add up to big results.",
  "Consistency beats intensity — showing up is the win.",
  "Your body can do it. It's your mind you need to convince.",
  "Recovery is progress too.",
  "Every rep brings you closer to where you want to be.",
  "Rest today, come back stronger tomorrow.",
  "Progress, not perfection.",
];

/**
 * Picks the quote for a given day so it stays stable for the whole day (a
 * random pick would change on every re-render and look glitchy).
 */
export function getDailyQuote(date: Date = new Date()): string {
  const dayOfYear = Math.floor(
    (date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86400000
  );
  return MOTIVATIONAL_QUOTES[dayOfYear % MOTIVATIONAL_QUOTES.length];
}

/**
 * Dismissible "Quick Tip" callouts on the client's Programs page. Each carries
 * a stable `id` because dismissal is persisted per tip in localStorage — never
 * reorder ids or a dismissed tip will reappear as a different one.
 */
export interface QuickTip {
  id: string;
  text: string;
}

export const QUICK_TIPS: QuickTip[] = [
  { id: "warmup", text: "Warm up for five minutes before your first working set — it makes the whole session feel easier." },
  { id: "log-weights", text: "Log the weight you actually used. Next week's targets are only as good as this week's notes." },
  { id: "form-first", text: "Struggling with a movement? Drop the load and keep the form. Your coach would rather see clean reps." },
  { id: "flag-pain", text: "Anything that hurts in a sharp or pinching way is worth flagging in your session feedback." },
  { id: "rest-counts", text: "Rest periods are part of the programme, not a break from it — give yourself the full recovery." },
];

/** Rotates the tip daily, using the same stable-per-day rule as getDailyQuote. */
export function getDailyQuickTip(date: Date = new Date()): QuickTip {
  const dayOfYear = Math.floor(
    (date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86400000
  );
  return QUICK_TIPS[dayOfYear % QUICK_TIPS.length];
}
