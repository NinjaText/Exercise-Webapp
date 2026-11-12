import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { LAST_ACTIVE_THROTTLE_MS } from "@/lib/activity/constants";

/**
 * "Last active" tracking.
 *
 * Every authenticated page render, server action and client heartbeat calls
 * `touchLastActive` with the user row it already loaded. The write only
 * happens when the stored value is older than THROTTLE_MS, so an active user
 * costs at most one small update every few minutes and the hot path does no
 * extra reads.
 */
type ActivityUser = { id: string; lastActiveAt?: Date | null };

export function isLastActiveStale(lastActiveAt: Date | null | undefined, now = Date.now()): boolean {
  return !lastActiveAt || now - new Date(lastActiveAt).getTime() >= LAST_ACTIVE_THROTTLE_MS;
}

async function writeLastActive(userId: string, at: Date): Promise<void> {
  try {
    await prisma.user.update({ where: { id: userId }, data: { lastActiveAt: at } });
  } catch (err) {
    // Tracking must never break the request it rides on.
    console.error("[last-active] failed to record activity", err);
  }
}

/**
 * Records activity for `user` if the stored timestamp is stale. The write is
 * deferred with `after()` so it never adds latency to the response; outside a
 * request scope (scripts, tests) it falls back to fire-and-forget.
 */
export function touchLastActive(user: ActivityUser): void {
  if (!isLastActiveStale(user.lastActiveAt)) return;
  const at = new Date();
  try {
    after(() => writeLastActive(user.id, at));
  } catch {
    void writeLastActive(user.id, at);
  }
}
