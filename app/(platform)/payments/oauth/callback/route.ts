import { NextResponse } from "next/server";
import { requireRole } from "@/lib/current-user";
import { completeConnectOAuth } from "@/lib/services/connected-account.service";
import { PaymentsError } from "@/lib/payments/connect-errors";
import { appBaseUrl } from "@/lib/utils/app-url";

/**
 * GET /payments/oauth/callback — Stripe Connect OAuth redirect_uri for
 * "connect an existing Stripe account". Requires the signed-in trainer, and
 * the signed `state` must have been issued to that same trainer (CSRF).
 * Always lands back on /payments with a short status flag.
 */
export async function GET(request: Request) {
  const trainer = await requireRole("TRAINER");
  const params = new URL(request.url).searchParams;
  const back = (flag: string) => NextResponse.redirect(`${appBaseUrl()}/payments?connect=${flag}`);

  // The trainer pressed "cancel" on Stripe's page (or Stripe refused).
  if (params.get("error")) return back(params.get("error") === "access_denied" ? "canceled" : "error");

  const code = params.get("code");
  if (!code) return back("error");

  try {
    await completeConnectOAuth(trainer, code, params.get("state"));
    return back("connected");
  } catch (err) {
    if (err instanceof PaymentsError) return back(err.code);
    console.error(`[payments] OAuth completion failed for trainer ${trainer.id}:`, err);
    return back("error");
  }
}
