/**
 * Which trial reminder a member is due, if any. Only the most urgent unsent
 * one is returned, so a member who joined with <1 day left gets "d1", not "d3"
 * then "d1". Nothing is sent more than 7 days after the trial ended.
 */
export type ReminderKey = "d3" | "d1" | "d0";

const HOUR_MS = 3600_000;

export function dueReminder(trialEndsAt: Date, sent: string[], now: Date): ReminderKey | null {
  const hoursLeft = (trialEndsAt.getTime() - now.getTime()) / HOUR_MS;
  let key: ReminderKey | null = null;
  if (hoursLeft <= 0 && hoursLeft > -24 * 7) key = "d0";
  else if (hoursLeft > 0 && hoursLeft <= 24) key = "d1";
  else if (hoursLeft > 24 && hoursLeft <= 72) key = "d3";
  return key && !sent.includes(key) ? key : null;
}
