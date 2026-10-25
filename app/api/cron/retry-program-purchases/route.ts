import { NextResponse } from "next/server";
import { retryStuckProgramPurchases } from "@/lib/services/program-purchase.service";
import { retryStuckOfferPurchases } from "@/lib/services/offer-purchase.service";

/**
 * GET /api/cron/retry-program-purchases
 *
 * Fulfillment for a program purchase runs in the background (see the
 * checkout.session.completed webhook handler), so a failure there can no
 * longer be signaled to Stripe via a retry. This sweep finds any
 * ProgramPurchase left PENDING or FAILED past a grace period and retries
 * fulfillment — safe to run repeatedly, since fulfillment is idempotent.
 *
 * Also sweeps trainer-payments (Stripe Connect) OfferPurchases: paid but
 * unfulfilled ones are fulfilled again, and stale PENDING ones are
 * reconciled against Stripe in case a webhook was missed. The two sweeps
 * are independent; one failing never skips the other.
 *
 * Intended to be called by Vercel Cron (see vercel.json). Secured with the
 * same shared-secret convention as /api/reminders and /api/cron/mark-missed-sessions:
 * when the CRON_SECRET env var is set, the caller must present it as
 *   Authorization: Bearer <CRON_SECRET>
 * Vercel Cron automatically sends this header when CRON_SECRET is configured.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("Authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const [funnel, offers] = await Promise.allSettled([
    retryStuckProgramPurchases(),
    retryStuckOfferPurchases(),
  ]);
  if (funnel.status === "rejected") console.error("Retry-program-purchases cron job failed:", funnel.reason);
  if (offers.status === "rejected") console.error("Retry-offer-purchases sweep failed:", offers.reason);

  if (funnel.status === "rejected" || offers.status === "rejected") {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
  return NextResponse.json({ ...funnel.value, offers: offers.value });
}
