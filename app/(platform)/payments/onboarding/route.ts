import { NextResponse } from "next/server";
import { requireRole } from "@/lib/current-user";
import { refreshOnboardingLink } from "@/lib/services/connected-account.service";
import { appBaseUrl } from "@/lib/utils/app-url";

/**
 * GET /payments/onboarding — the Account Link `refresh_url`. Stripe sends
 * the trainer here when their onboarding link expired or was reused; we mint
 * a fresh link for their existing account and send them straight back.
 * Never creates an account (that only happens from the POST-backed server
 * action), so a plain GET is safe.
 */
export async function GET() {
  const trainer = await requireRole("TRAINER");
  try {
    const url = await refreshOnboardingLink(trainer);
    if (url) return NextResponse.redirect(url);
  } catch (err) {
    console.error(`[payments] onboarding refresh failed for trainer ${trainer.id}:`, err);
  }
  return NextResponse.redirect(`${appBaseUrl()}/payments?onboarding=error`);
}
