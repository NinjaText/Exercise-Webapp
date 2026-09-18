import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PricingCards } from "@/components/billing/pricing-cards";
import { differenceInDays } from "date-fns";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const user = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!user || user.role !== "TRAINER") redirect("/dashboard");

  const sub = await prisma.trainerSubscription.findUnique({
    where: { trainerId: user.id },
  });

  const { reason } = await searchParams;

  const trialDaysRemaining =
    sub?.status === "TRIALING" && sub.trialEndsAt > new Date()
      ? differenceInDays(sub.trialEndsAt, new Date())
      : null;

  return (
    <div className="min-h-screen bg-[oklch(0.97_0.005_247)] py-16 px-4">
      <div className="mx-auto max-w-5xl">
        {reason === "payment_failed" && (
          <div className="mb-8 rounded-lg border border-danger-border bg-danger-soft px-4 py-3 text-sm text-danger-foreground">
            Your last payment failed — please update your billing details.
          </div>
        )}
        {reason === "trial_expired" && (
          <div className="mb-8 rounded-lg border border-neutral-border bg-neutral-soft px-4 py-3 text-sm text-neutral-foreground">
            Your free trial has ended. Choose a plan to continue.
          </div>
        )}
        {trialDaysRemaining !== null && trialDaysRemaining > 0 && (
          <div className="mb-8 flex items-center justify-between rounded-lg border border-info-border bg-info-soft px-4 py-3 text-sm text-info-foreground">
            <span>
              You have {trialDaysRemaining} day
              {trialDaysRemaining !== 1 ? "s" : ""} left in your free trial.
            </span>
            <a
              href="/dashboard"
              className="ml-4 shrink-0 font-medium underline underline-offset-2 hover:opacity-80"
            >
              Skip for now →
            </a>
          </div>
        )}

        <div className="mb-12 text-center">
          <h1 className="text-4xl font-bold text-foreground">
            Choose your plan
          </h1>
          <p className="mt-3 text-lg text-muted-foreground">
            All plans include a 14-day free trial
          </p>
        </div>

        <PricingCards />
      </div>
    </div>
  );
}
