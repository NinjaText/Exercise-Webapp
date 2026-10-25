import { LIVE_READ_REQUEST_OPTIONS } from "@/lib/payments/connect-config";

/**
 * Hard deadline for a display-only Stripe read made while rendering a page
 * (/payments, member dashboard and billing, admin club pages).
 *
 * The Stripe client's own `timeout` only covers a request whose connection
 * opened; when api.stripe.com can't be reached at all (network block, outage)
 * the TCP connect hangs for the OS limit (~75s on macOS) per attempt. Racing
 * the call lets the caller fail soft on time. The abandoned request finishes
 * or errors in the background; nothing waits on it.
 */
export function withLiveReadDeadline<T>(request: Promise<T>, ms: number = LIVE_READ_REQUEST_OPTIONS.timeout): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Stripe did not respond within ${ms}ms`)), ms);
  });
  // The loser of the race must not surface as an unhandled rejection.
  request.catch(() => undefined);
  return Promise.race([request, deadline]).finally(() => clearTimeout(timer));
}
