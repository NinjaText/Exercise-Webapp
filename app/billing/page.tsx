import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PricingCards } from "@/components/billing/pricing-cards";
import { ManageSubscriptionButton } from "@/components/billing/subscription-status";
import { format } from "date-fns";
import { cookies } from "next/headers";
import { getCapabilitiesForUser, getOrgForUser } from "@/lib/org-capabilities.server";
import { getOrgCapabilities } from "@/lib/org-capabilities";
import { ensureMemberSubscription } from "@/lib/services/club-member.service";
import Link from "next/link";
import { OrgIdentity } from "@/components/branding/org-identity";
import { BrandStyle } from "@/components/branding/brand-style";
import { StatusBanner } from "@/components/billing/status-banner";
import { getOrgBranding } from "@/lib/services/branding.service";
import { resolveBranding } from "@/lib/branding/resolve";
import { toViewModel } from "@/lib/branding/types";
import { MemberBillingView } from "./member-billing-view";
import { isBillingExempt } from "@/lib/billing/exempt";
import { awaitingFirstCheckout, isTrialEligible, trialDaysLeft } from "@/lib/billing/access";
import { hasLiveTrainerSubscription } from "@/lib/services/stripe-billing.service";
import { START_PLAN_COOKIE, parseStartPlan } from "@/lib/billing/start-plan";
import { TIER_CONFIG, TRAINER_TRIAL_DAYS, formatTierPrice } from "@/lib/stripe-config";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; plan?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const user = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!user) redirect("/dashboard");
  // Complimentary accounts have nothing to pay.
  if (isBillingExempt(user)) redirect("/dashboard");
  if (user.role === "CLIENT") {
    const org = await getOrgForUser(user);
    if (!org || getOrgCapabilities(org).billing !== "member") redirect("/dashboard");
    let memberSub = await prisma.memberSubscription.findUnique({ where: { userId: user.id } });
    if (!memberSub) {
      // No row (e.g. enrollment crashed before the trial was created): create
      // it now so the member can subscribe and shows up for admins.
      await ensureMemberSubscription(user.id, org);
      memberSub = await prisma.memberSubscription.findUnique({ where: { userId: user.id } });
    }
    const { reason: memberReason } = await searchParams;
    return <MemberBillingView org={org} sub={memberSub} reason={memberReason ?? null} userId={user.id} />;
  }
  if (user.role !== "TRAINER") redirect("/dashboard");
  // House coaches never pay (trainerBilling off).
  if (!(await getCapabilitiesForUser(user)).trainerBilling) redirect("/dashboard");

  const sub = await prisma.trainerSubscription.findUnique({
    where: { trainerId: user.id },
  });

  const { reason, plan: planParam } = await searchParams;
  // A live subscription (trialing or paid, in good standing) manages its plan
  // in settings; payment problems stay here so the banner explains them.
  if (sub && hasLiveTrainerSubscription(sub) && (sub.status === "ACTIVE" || sub.status === "TRIALING")) {
    redirect("/settings/billing");
  }

  const now = new Date();
  // Grandfathered card-less trial still running: they may keep using the app.
  const legacyTrialDays = sub && !sub.stripeSubscriptionId ? trialDaysLeft(sub, now) : null;
  const trialEligible = sub ? isTrialEligible(sub) : false;
  const firstCheckout = awaitingFirstCheckout(sub);
  // Ended = subscription canceled, or an old card-less trial ran out. Never
  // shown to a fresh trainer who simply hasn't picked a plan yet.
  const ended =
    sub?.status === "CANCELED" ||
    (sub?.status === "TRIALING" && !sub.stripeSubscriptionId && !firstCheckout && sub.trialEndsAt < now);
  // Plan chosen on the marketing site (cookie from /start/trainer, or ?plan= fallback).
  const highlightPlan = parseStartPlan(planParam ?? (await cookies()).get(START_PLAN_COOKIE)?.value);
  const trialEndPreview = new Date(now.getTime() + TRAINER_TRIAL_DAYS * 24 * 60 * 60 * 1000);

  // A branding lookup failure must never break billing: fall back to product branding.
  const branding = await getOrgBranding(user.clerkOrgId ?? null).catch(() => resolveBranding(null));

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <BrandStyle branding={branding} />
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-4 sm:px-6">
        <OrgIdentity branding={toViewModel(branding)} surface="light" />
      </header>

      <main className="flex-1 px-4 py-6 sm:px-6 sm:py-14">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          {(reason === "payment_failed" || sub?.status === "PAST_DUE" || sub?.status === "UNPAID") && (
            <StatusBanner
              tone="danger"
              action={sub?.stripeSubscriptionId ? <ManageSubscriptionButton label="Update payment method" /> : undefined}
            >
              Your last payment failed — please update your billing details.
            </StatusBanner>
          )}
          {ended && sub?.status === "CANCELED" && (
            <StatusBanner tone="neutral">Your subscription has ended. Choose a plan to continue.</StatusBanner>
          )}
          {ended && sub?.status !== "CANCELED" && (
            <StatusBanner tone="neutral">Your free trial has ended. Choose a plan to continue.</StatusBanner>
          )}
          {reason === "canceled_checkout" && (
            <StatusBanner tone="neutral">Checkout was canceled — nothing was charged.</StatusBanner>
          )}
          {legacyTrialDays !== null && (
            <StatusBanner
              tone="info"
              action={
                <a
                  href="/dashboard"
                  className="inline-flex h-8 items-center rounded-sm font-medium underline underline-offset-2 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Skip for now →
                </a>
              }
            >
              You have {legacyTrialDays} day{legacyTrialDays !== 1 ? "s" : ""} left in your free trial. Subscribing
              now keeps the rest of it — you&apos;re first charged when it ends.
            </StatusBanner>
          )}
        </div>

        <div className="mx-auto mt-6 mb-6 max-w-3xl text-center sm:mb-10">
          <h1 className="text-display text-balance text-foreground">
            {trialEligible ? `Start your ${TRAINER_TRIAL_DAYS}-day free trial` : "Choose your plan"}
          </h1>
          <p className="mt-3 text-body text-muted-foreground">
            {trialEligible
              ? `Card required. You won't be charged until your trial ends on ${format(trialEndPreview, "MMMM d")} — cancel any time before then and you pay nothing.`
              : "Plans differ only in how many active clients you can coach."}
          </p>
          {highlightPlan && trialEligible && (
            <p className="mt-2 text-caption">
              {TIER_CONFIG[highlightPlan].label}: first charge of {formatTierPrice(TIER_CONFIG[highlightPlan].priceInCents)} on{" "}
              {format(trialEndPreview, "MMMM d, yyyy")}.
            </p>
          )}
        </div>

        <div className="mx-auto w-full max-w-5xl">
          <PricingCards trialEligible={trialEligible} highlightPlan={highlightPlan} />
        </div>
      </main>

      <footer className="shrink-0 px-4 py-6 text-caption sm:px-6">
        <nav aria-label="Legal" className="mx-auto flex max-w-5xl items-center justify-center gap-4">
          <Link href="/privacy" className="inline-flex h-8 items-center rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Privacy</Link>
          <Link href="/terms" className="inline-flex h-8 items-center rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Terms</Link>
        </nav>
      </footer>
    </div>
  );
}
