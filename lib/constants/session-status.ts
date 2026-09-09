/**
 * One source of truth for how a WorkoutSessionV2 status is rendered.
 *
 * Lives in lib/constants (not the service layer) so client components can
 * import it without pulling Prisma into the browser bundle — the same reasoning
 * as lib/constants/insights.ts.
 *
 * Both the client's month calendar (client-session-calendar.tsx) and the
 * dashboard week strip (week-strip.tsx) read from here, so a status can never
 * be blue in one widget and grey in the other.
 */

/** Dot / swatch background for a status. */
export const SESSION_STATUS_DOT: Record<string, string> = {
  COMPLETED: "bg-emerald-500",
  IN_PROGRESS: "bg-amber-500",
  SCHEDULED: "bg-blue-500",
  MISSED: "bg-slate-400",
  SKIPPED: "bg-slate-400",
};

/** Badge (background + text) classes for a status. */
export const SESSION_STATUS_BADGE: Record<string, string> = {
  COMPLETED: "bg-emerald-100 text-emerald-700",
  IN_PROGRESS: "bg-amber-100 text-amber-700",
  SCHEDULED: "bg-blue-100 text-blue-700",
  MISSED: "bg-slate-100 text-slate-700",
  SKIPPED: "bg-slate-100 text-slate-700",
};

/** Human-facing label for a status. */
export const SESSION_STATUS_LABEL: Record<string, string> = {
  COMPLETED: "Completed",
  IN_PROGRESS: "In Progress",
  SCHEDULED: "Scheduled",
  MISSED: "Missed",
  SKIPPED: "Skipped",
};

const DEFAULT_STATUS = "SCHEDULED";

export function getSessionStatusDot(status: string): string {
  return SESSION_STATUS_DOT[status] ?? SESSION_STATUS_DOT[DEFAULT_STATUS];
}

export function getSessionStatusBadge(status: string): string {
  return SESSION_STATUS_BADGE[status] ?? SESSION_STATUS_BADGE[DEFAULT_STATUS];
}

export function getSessionStatusLabel(status: string): string {
  return SESSION_STATUS_LABEL[status] ?? SESSION_STATUS_LABEL[DEFAULT_STATUS];
}

/**
 * The statuses worth explaining in a legend, in reading order. SKIPPED is
 * deliberately absent — it shares MISSED's styling and would read as a
 * duplicate swatch.
 */
export const SESSION_STATUS_LEGEND: { status: string; label: string; dot: string }[] = [
  "SCHEDULED",
  "IN_PROGRESS",
  "COMPLETED",
  "MISSED",
].map((status) => ({
  status,
  label: SESSION_STATUS_LABEL[status],
  dot: SESSION_STATUS_DOT[status],
}));
