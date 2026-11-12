"use client";

import { useEffect } from "react";
import { HEARTBEAT_INTERVAL_MS } from "@/lib/activity/constants";

/**
 * Keeps `User.lastActiveAt` fresh while a tab is open and visible — covers
 * people who sit on one screen (a guided workout, the native app) without
 * navigating. Hidden tabs don't ping, so an idle background tab doesn't count
 * as activity. The server throttles writes, so extra pings are cheap.
 */
export function ActivityHeartbeat() {
  useEffect(() => {
    let lastPing = 0;

    const ping = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      // Re-focusing a tab many times in a row shouldn't spam the endpoint.
      if (now - lastPing < 60_000) return;
      lastPing = now;
      fetch("/api/activity/heartbeat", { method: "POST", keepalive: true }).catch(() => {});
    };

    const interval = window.setInterval(ping, HEARTBEAT_INTERVAL_MS);
    document.addEventListener("visibilitychange", ping);
    window.addEventListener("focus", ping);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", ping);
      window.removeEventListener("focus", ping);
    };
  }, []);

  return null;
}
