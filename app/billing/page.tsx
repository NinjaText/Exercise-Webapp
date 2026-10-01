import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PricingCards } from "@/components/billing/pricing-cards";
import { differenceInDays } from "date-fns";
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

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const user = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!user) redirect("/dashboard");
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
  // Club trainers never pay (trainerBilling off).
  if (!(await getCapabilitiesForUser(user)).trainerBilling) redirect("/dashboard");

  const sub = await prisma.trainerSubscription.findUnique({
    where: { trainerId: user.id },
  });

  const { reason } = await searchParams;

  const trialDaysRemaining =
    sub?.status === "TRIALING" && sub.trialEndsAt > new Date()
      ? differenceInDays(sub.trialEndsAt, new Date())
      : null;

  // A branding lookup failure must never break billing: fall back to product branding.
  const branding = await getOrgBranding(user.clerkOrgId ?? null).catch(() => resolveBranding(null));

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <BrandStyle branding={branding} />
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-4 sm:px-6">
        <OrgIdentity branding={toViewModel(branding)} surface="light" />
      </header>

      <main className="flex-1 px-4 py-10 sm:px-6 sm:py-14">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          {reason === "payment_failed" && (
            <StatusBanner tone="danger">
              Your last payment failed — please update your billing details.
            </StatusBanner>
          )}
          {reason === "trial_expired" && (
            <StatusBanner tone="neutral">Your free trial has ended. Choose a plan to continue.</StatusBanner>
          )}
          {trialDaysRemaining !== null && trialDaysRemaining > 0 && (
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
              You have {trialDaysRemaining} day
              {trialDaysRemaining !== 1 ? "s" : ""} left in your free trial.
            </StatusBanner>
          )}
        </div>

        <div className="mx-auto mt-6 mb-10 max-w-3xl text-center">
          <h1 className="text-display text-balance text-foreground">Choose your plan</h1>
          <p className="mt-3 text-body text-muted-foreground">All plans include a 14-day free trial</p>
        </div>

        <div className="mx-auto w-full max-w-5xl">
          <PricingCards />
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
