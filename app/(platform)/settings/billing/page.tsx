import { requireRole } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { differenceInDays, format } from "date-fns";
import { Check } from "lucide-react";
import { ManageSubscriptionButton } from "@/components/billing/subscription-status";
import { PricingCards } from "@/components/billing/pricing-cards";
import { StatusBadge } from "@/components/shared/status-badge";
import { SettingsPanel, SettingsPanels } from "@/components/settings/settings-section";
import { TIER_CONFIG, type PlanTier } from "@/lib/stripe-config";

const INCLUDED = [
  "AI workout generation",
  "Client progress tracking",
  "Assessments & check-ins",
  "Messaging",
  "Program library",
  "14-day free trial",
];

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{children}</dd>
    </div>
  );
}

export default async function BillingSettingsPage() {
  const user = await requireRole("TRAINER");

  const sub = await prisma.trainerSubscription.findUnique({
    where: { trainerId: user.id },
  });

  const now = new Date();
  const status = sub?.status ?? "NONE";
  const hasPlan = status === "ACTIVE" || status === "PAST_DUE" || status === "UNPAID";
  const showPlans = !hasPlan;
  const trialDaysRemaining =
    status === "TRIALING" && sub && sub.trialEndsAt > now ? differenceInDays(sub.trialEndsAt, now) : 0;
  const tierLabel = sub ? (TIER_CONFIG[sub.plan as PlanTier]?.label ?? sub.plan) : null;
  const price = sub ? TIER_CONFIG[sub.plan as PlanTier]?.priceInCents : undefined;

  const summary = {
    ACTIVE: {
      title: `${tierLabel} plan`,
      text: sub?.cancelAtPeriodEnd
        ? "Your subscription will cancel at the end of the current billing period."
        : "Your subscription is active. Change plans, update your card or download invoices in the billing portal.",
    },
    PAST_DUE: { title: "Payment issue", text: "Your last payment failed. Update your payment method to restore full access." },
    UNPAID: { title: "Payment issue", text: "Your last payment failed. Update your payment method to restore full access." },
    TRIALING: {
      title: "Free trial",
      text:
        trialDaysRemaining > 0
          ? `You have ${trialDaysRemaining} day${trialDaysRemaining === 1 ? "" : "s"} left. Choose a plan below to keep access when it ends.`
          : "Your trial ends today. Choose a plan below to keep access.",
    },
    CANCELED: { title: "No active plan", text: "Your subscription has ended. Pick a plan below to get back in." },
    NONE: { title: "No active plan", text: "Pick a plan below to get started." },
  }[status] ?? { title: "Subscription", text: "" };

  return (
    <SettingsPanels>
      <SettingsPanel
        title="Current plan"
        description="Your subscription and what you're billed."
        footer={hasPlan ? <ManageSubscriptionButton label={status === "ACTIVE" ? "Manage subscription" : "Update payment method"} /> : undefined}
        footerHint={hasPlan ? "Opens the secure Stripe billing portal." : undefined}
      >
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-lg font-semibold tracking-tight">{summary.title}</p>
            {status !== "NONE" && <StatusBadge status={status} size="sm" />}
          </div>
          <p className="text-sm text-muted-foreground">{summary.text}</p>
        </div>

        {sub && (hasPlan || status === "TRIALING") && (
          <dl className="grid gap-6 border-t border-border pt-6 sm:grid-cols-3">
            {tierLabel && hasPlan && <Fact label="Plan">{tierLabel}</Fact>}
            {price !== undefined && hasPlan && <Fact label="Price">${price / 100} / month</Fact>}
            {status === "TRIALING" && <Fact label="Trial ends">{format(sub.trialEndsAt, "MMMM d, yyyy")}</Fact>}
            {hasPlan && sub.currentPeriodEnd && (
              <Fact label={sub.cancelAtPeriodEnd ? "Access until" : "Next billing date"}>
                {format(sub.currentPeriodEnd, "MMMM d, yyyy")}
              </Fact>
            )}
          </dl>
        )}
      </SettingsPanel>

      {showPlans && (
        <SettingsPanel
          title="Choose a plan"
          description="Every plan includes the full product. Plans differ only in how many clients you can coach."
          bare
        >
          <PricingCards />
        </SettingsPanel>
      )}

      <SettingsPanel title="Included in every plan" description="No feature is locked behind a higher tier.">
        <ul className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {INCLUDED.map((item) => (
            <li key={item} className="flex items-center gap-2.5 text-sm">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-success-soft">
                <Check className="size-3 text-success-foreground" aria-hidden />
              </span>
              {item}
            </li>
          ))}
        </ul>
      </SettingsPanel>
    </SettingsPanels>
  );
}
