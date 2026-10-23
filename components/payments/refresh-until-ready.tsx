"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * The Checkout success page renders before (or while) the Connect webhook
 * grants access. Re-render the server page every few seconds, a bounded
 * number of times, until it reports ready.
 */
export function RefreshUntilReady({ intervalMs = 3000, maxAttempts = 10 }: { intervalMs?: number; maxAttempts?: number }) {
  const router = useRouter();
  useEffect(() => {
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (attempts > maxAttempts) {
        window.clearInterval(timer);
        return;
      }
      router.refresh();
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [router, intervalMs, maxAttempts]);
  return null;
}
