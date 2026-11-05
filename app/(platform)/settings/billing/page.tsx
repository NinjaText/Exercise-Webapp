import { requireRole } from "@/lib/current-user";
import { requireCapability } from "@/lib/org-capabilities.server";
import { prisma } from "@/lib/prisma";
import { format } from "date-fns";
import { Check } from "lucide-react";
import { ManageSubscriptionButton } from "@/components/billing/subscription-status";
import { PricingCards } from "@/components/billing/pricing-cards";
import { StatusBadge } from "@/components/shared/status-badge";
import { SettingsPanel, SettingsPanels } from "@/components/settings/settings-section";
import { TIER_CONFIG, TRAINER_TRIAL_DAYS, formatTierPrice, type PlanTier } from "@/lib/stripe-config";
import { hasScheduledSubscription, isTrialEligible, trialDaysLeft } from "@/lib/billing/access";
import { isBillingExempt } from "@/lib/billing/exempt";
import { isSuperAdmin } from "@/lib/current-user";

const INCLUDED = [
  "AI workout generation",
  "Client progress tracking",
  "Assessments & check-ins",
  "Messaging",
  "Program library",
  `${TRAINER_TRIAL_DAYS}-day free trial (card required, cancel anytime)`,
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
  // House coaches never pay (trainerBilling off).
  await requireCapability("trainerBilling");

  if (isBillingExempt(user) || (await isSuperAdmin())) {
    return (
      <SettingsPanels>
        <SettingsPanel title="Current plan" description="Your subscription and what you're billed.">
          <div className="flex flex-col gap-1.5">
            <p className="text-lg font-semibold tracking-tight">Complimentary access</p>
            <p className="text-sm text-muted-foreground">
              This account has full access at no charge. There&apos;s nothing to pay or manage.
            </p>
          </div>
        </SettingsPanel>
      </SettingsPanels>
    );
  }

  const sub = await prisma.trainerSubscription.findUnique({
    where: { trainerId: user.id },
  });

  const now = new Date();
  const status = sub?.status ?? "NONE";
  // Trialing in Stripe (card on file): converts to paid automatically.
  const stripeTrial = hasScheduledSubscription(sub);
  const hasPlan = status === "ACTIVE" || status === "PAST_DUE" || status === "UNPAID" || stripeTrial;
  const showPlans = !hasPlan;
  // Old card-less trial (grandfathered) or no plan yet.
  const legacyDays = sub && !stripeTrial ? trialDaysLeft(sub, now) : null;
  const tierLabel = sub ? (TIER_CONFIG[sub.plan as PlanTier]?.label ?? sub.plan) : null;
  const priceCents = sub ? TIER_CONFIG[sub.plan as PlanTier]?.priceInCents : undefined;
  const price = priceCents !== undefined ? formatTierPrice(priceCents) : undefined;
  const trialEligible = sub ? isTrialEligible(sub) : false;

  const summary = stripeTrial
    ? {
        title: `${tierLabel} plan — free trial`,
        text: sub?.cancelAtPeriodEnd
          ? `Your trial is canceled and ends on ${format(sub.trialEndsAt, "MMMM d, yyyy")}. You won't be charged.`
          : `Your trial ends on ${sub ? format(sub.trialEndsAt, "MMMM d, yyyy") : ""}, when your card is first charged ${price ?? ""}. Cancel before then in the billing portal and you won't be charged.`,
      }
    : ({
        ACTIVE: {
          title: `${tierLabel} plan`,
          text: sub?.cancelAtPeriodEnd
            ? "Your subscription will cancel at the end of the current billing period."
            : "Your subscription is active. Change plans, update your card or download invoices in the billing portal.",
        },
        PAST_DUE: { title: "Payment issue", text: "Your last payment failed. Update your payment method to restore full access." },
        UNPAID: { title: "Payment issue", text: "Your last payment failed. Update your payment method to restore full access." },
        TRIALING: {
          title: legacyDays !== null ? "Free trial" : "No active plan",
          text:
            legacyDays !== null
              ? `You have ${legacyDays} day${legacyDays === 1 ? "" : "s"} left. Choose a plan below to keep access — you're first charged when your trial ends.`
              : trialEligible
                ? `Choose a plan below to start your ${TRAINER_TRIAL_DAYS}-day free trial. Card required; you won't be charged until it ends.`
                : "Your trial has ended. Choose a plan below to keep access.",
        },
        CANCELED: { title: "No active plan", text: "Your subscription has ended. Pick a plan below to get back in." },
        NONE: { title: "No active plan", text: "Pick a plan below to get started." },
      }[status] ?? { title: "Subscription", text: "" });

  return (
    <SettingsPanels>
      <SettingsPanel
        title="Current plan"
        description="Your subscription and what you're billed."
        footer={
          hasPlan ? (
            <ManageSubscriptionButton
              label={status === "PAST_DUE" || status === "UNPAID" ? "Update payment method" : "Manage or cancel subscription"}
            />
          ) : undefined
        }
        footerHint={hasPlan ? "Opens the secure Stripe billing portal." : undefined}
      >
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-lg font-semibold tracking-tight">{summary.title}</p>
            {(hasPlan || legacyDays !== null || status === "CANCELED") && <StatusBadge status={status} size="sm" />}
          </div>
          <p className="text-sm text-muted-foreground">{summary.text}</p>
        </div>

        {sub && hasPlan && (
          <dl className="grid gap-6 border-t border-border pt-6 sm:grid-cols-3">
            {tierLabel && <Fact label="Plan">{tierLabel}</Fact>}
            {price !== undefined && <Fact label="Price">{price} / month</Fact>}
            {stripeTrial && <Fact label="Trial ends">{format(sub.trialEndsAt, "MMMM d, yyyy")}</Fact>}
            {stripeTrial && !sub.cancelAtPeriodEnd && (
              <Fact label="First charge">
                {price} on {format(sub.trialEndsAt, "MMMM d, yyyy")}
              </Fact>
            )}
            {!stripeTrial && sub.currentPeriodEnd && (
              <Fact label={sub.cancelAtPeriodEnd ? "Access until" : "Next billing date"}>
                {format(sub.currentPeriodEnd, "MMMM d, yyyy")}
              </Fact>
            )}
          </dl>
        )}
        {sub && legacyDays !== null && (
          <dl className="grid gap-6 border-t border-border pt-6 sm:grid-cols-3">
            <Fact label="Trial ends">{format(sub.trialEndsAt, "MMMM d, yyyy")}</Fact>
          </dl>
        )}
      </SettingsPanel>

      {showPlans && (
        <SettingsPanel
          title="Choose a plan"
          description="Every plan includes the full product. Plans differ only in how many clients you can coach."
          bare
        >
          <PricingCards headingLevel={3} trialEligible={trialEligible} />
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
