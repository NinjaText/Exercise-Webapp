/**
 * A subscription cancel that fails because the subscription is already gone
 * or already cancelled has reached the state we wanted, so it counts as
 * success. Stripe reports a missing object as `resource_missing`; an
 * already-cancelled subscription comes back as an invalid-request whose
 * message says so.
 *
 * `logPrefix` tags the resource_missing warning, e.g. "[account-deletion]".
 */
export function isStripeSubscriptionAlreadyCanceled(
  error: unknown,
  subscriptionId: string,
  logPrefix: string
): boolean {
  const e = error as { code?: string; message?: string } | null;
  if (e?.code === "resource_missing") {
    // Stripe also returns `resource_missing` when the key or mode does not
    // match the object (test key against a live subscription, or the wrong
    // account), where the subscription is very much alive and still billing.
    // We cannot tell the two apart from the error alone, so we keep treating
    // it as cancelled but leave a trace to diagnose from.
    console.warn(
      `${logPrefix} Stripe returned resource_missing for subscription ${subscriptionId}; treating the cancel as already-cancelled. If the API key or mode is mismatched, this subscription may still be billing.`
    );
    return true;
  }
  const message = typeof e?.message === "string" ? e.message.toLowerCase() : "";
  return (
    message.includes("no such subscription") ||
    message.includes("already canceled") ||
    message.includes("already cancelled")
  );
}
