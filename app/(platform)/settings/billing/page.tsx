import { requireRole } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { differenceInDays } from "date-fns";
import { SubscriptionStatus } from "@/components/billing/subscription-status";
import { PricingCards } from "@/components/billing/pricing-cards";
import { PageHeader } from "@/components/shared/page-header";
import { PageShell } from "@/components/shared/page-shell";
import { SectionCard } from "@/components/shared/section-card";
import { CreditCard, Clock, AlertCircle, XCircle } from "lucide-react";

export default async function BillingSettingsPage() {
  const user = await requireRole("TRAINER");

  const sub = await prisma.trainerSubscription.findUnique({
    where: { trainerId: user.id },
  });

  const now = new Date();
  const trialDaysRemaining =
    sub?.status === "TRIALING" && sub.trialEndsAt > now
      ? differenceInDays(sub.trialEndsAt, now)
      : 0;

  return (
    <PageShell width="narrow">
      <PageHeader
        title="Billing & Subscription"
        description="Manage your plan and payment details"
      />

      {/* ACTIVE — show plan card */}
      {sub?.status === "ACTIVE" && (
        <SubscriptionStatus
          plan={sub.plan}
          status={sub.status}
          currentPeriodEnd={sub.currentPeriodEnd}
          cancelAtPeriodEnd={sub.cancelAtPeriodEnd}
        />
      )}

      {/* TRIALING — show trial status + upgrade options */}
      {sub?.status === "TRIALING" && (
        <>
          <div className="flex items-start gap-4 rounded-xl border border-info-border bg-info-soft p-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-info/15">
              <Clock className="h-5 w-5 text-info-foreground" />
            </div>
            <div>
              <p className="font-semibold text-info-foreground">Free trial active</p>
              {trialDaysRemaining > 0 ? (
                <p className="mt-0.5 text-sm text-info-foreground">
                  You have{" "}
                  <span className="font-bold">
                    {trialDaysRemaining} day{trialDaysRemaining !== 1 ? "s" : ""}
                  </span>{" "}
                  remaining. Choose a plan below to continue after your trial ends.
                </p>
              ) : (
                <p className="mt-0.5 text-sm text-info-foreground">
                  Your trial ends today. Choose a plan to keep access.
                </p>
              )}
            </div>
          </div>
          <div>
            <h3 className="mb-4 text-lg font-semibold">Choose your plan</h3>
            <PricingCards />
          </div>
        </>
      )}

      {/* PAST_DUE / UNPAID — payment issue */}
      {(sub?.status === "PAST_DUE" || sub?.status === "UNPAID") && (
        <div className="space-y-6">
          <div className="flex items-start gap-4 rounded-xl border border-danger-border bg-danger-soft p-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger/15">
              <AlertCircle className="h-5 w-5 text-danger-foreground" />
            </div>
            <div>
              <p className="font-semibold text-danger-foreground">Payment issue</p>
              <p className="mt-0.5 text-sm text-danger-foreground">
                Your last payment failed. Update your payment method to restore
                full access.
              </p>
            </div>
          </div>
          <SubscriptionStatus
            plan={sub.plan}
            status={sub.status}
            currentPeriodEnd={sub.currentPeriodEnd}
            cancelAtPeriodEnd={sub.cancelAtPeriodEnd}
          />
        </div>
      )}

      {/* CANCELED or no record — show upgrade options */}
      {(!sub || sub.status === "CANCELED") && (
        <div className="space-y-6">
          <div className="flex items-start gap-4 rounded-xl border border-border bg-muted/50 p-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
              <XCircle className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="font-semibold text-foreground">No active plan</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Your subscription has ended. Pick a plan below to get back in.
              </p>
            </div>
          </div>
          <div>
            <h3 className="mb-4 text-lg font-semibold">Choose your plan</h3>
            <PricingCards />
          </div>
        </div>
      )}

      {/* What's included callout */}
      <SectionCard title="All plans include" icon={CreditCard}>
        <ul className="grid grid-cols-1 gap-x-8 gap-y-1.5 text-sm text-muted-foreground sm:grid-cols-2">
          <li>✓ AI workout generation</li>
          <li>✓ Client progress tracking</li>
          <li>✓ Assessments &amp; check-ins</li>
          <li>✓ Messaging</li>
          <li>✓ Program library</li>
          <li>✓ 14-day free trial</li>
        </ul>
      </SectionCard>
    </PageShell>
  );
}
