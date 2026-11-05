import { auth } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { isBillingExempt } from "@/lib/billing/exempt";
import { getCapabilitiesForUser } from "@/lib/org-capabilities.server";
import { START_PLAN_COOKIE, parseStartPlan, startPlanCookieOptions } from "@/lib/billing/start-plan";
import {
  createTrainerCheckoutSession,
  hasLiveTrainerSubscription,
} from "@/lib/services/stripe-billing.service";

/**
 * /start/trainer?plan=STARTER|PRO|UNLIMITED — the marketing "Start free
 * trial" entry (lib/marketing-links.ts trainerTrialHref):
 *  - signed out → remember the plan in a cookie → Clerk sign-up → /onboarding
 *    (completeTrainerOnboarding then opens checkout for it);
 *  - signed in, not onboarded → same, via /onboarding;
 *  - onboarded trainer without a live subscription → Stripe Checkout;
 *  - already subscribed → /settings/billing; clients/members → /dashboard.
 * No/invalid plan → the plan picker on /billing (after sign-up/onboarding).
 */
export async function GET(req: NextRequest) {
  const plan = parseStartPlan(req.nextUrl.searchParams.get("plan"));
  const to = (path: string, keepPlan = false) => {
    const res = NextResponse.redirect(new URL(path, req.url), 303);
    if (keepPlan && plan) res.cookies.set(START_PLAN_COOKIE, plan, startPlanCookieOptions);
    else res.cookies.delete(START_PLAN_COOKIE);
    return res;
  };

  const { userId } = await auth();
  if (!userId) return to("/sign-up", true);

  const user = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!user || !user.onboarded) {
    // Invited clients / club members finish their own onboarding.
    if (user?.role === "CLIENT") return to("/onboarding/client");
    return to("/onboarding", true);
  }
  if (user.role !== "TRAINER") return to("/dashboard");
  if (isBillingExempt(user)) return to("/dashboard");
  if (!(await getCapabilitiesForUser(user)).trainerBilling) return to("/dashboard");

  const sub = await prisma.trainerSubscription.findUnique({ where: { trainerId: user.id } });
  if (!sub) return to("/onboarding", true);
  if (hasLiveTrainerSubscription(sub)) return to("/settings/billing");
  if (!plan) return to("/billing");

  try {
    const checkout = await createTrainerCheckoutSession(user.id, plan);
    if (checkout.ok) {
      const res = NextResponse.redirect(checkout.url, 303);
      res.cookies.delete(START_PLAN_COOKIE);
      return res;
    }
  } catch (err) {
    console.error("/start/trainer checkout failed:", err);
  }
  return to(`/billing?plan=${plan}`);
}
