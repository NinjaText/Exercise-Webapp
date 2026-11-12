// Client-safe constants for "last active" tracking (no server imports here).

/** Minimum gap between two writes of User.lastActiveAt for the same user. */
export const LAST_ACTIVE_THROTTLE_MS = 5 * 60 * 1000;

/** How often an open, visible tab pings /api/activity/heartbeat. */
export const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Anyone seen within this window is shown as "Active now". Must cover one
 * throttle window plus one heartbeat interval, or an active user would flicker.
 */
export const ACTIVE_NOW_WINDOW_MS = LAST_ACTIVE_THROTTLE_MS + HEARTBEAT_INTERVAL_MS;

export type LastActiveStatus =
  | { kind: "never" }
  | { kind: "now"; at: Date }
  | { kind: "past"; at: Date };

/** Buckets a lastActiveAt value for display. */
export function lastActiveStatus(
  at: Date | string | null | undefined,
  now: number = Date.now(),
): LastActiveStatus {
  if (!at) return { kind: "never" };
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return { kind: "never" };
  return now - date.getTime() < ACTIVE_NOW_WINDOW_MS ? { kind: "now", at: date } : { kind: "past", at: date };
}
