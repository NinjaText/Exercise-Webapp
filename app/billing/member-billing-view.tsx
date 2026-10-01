import type { MemberSubscription, Organization } from "@prisma/client";
import { stripe } from "@/lib/stripe";
import { getOrgBranding } from "@/lib/services/branding.service";
import { toViewModel } from "@/lib/branding/types";
import { BrandStyle } from "@/components/branding/brand-style";
import { AuthShell } from "@/components/auth/auth-shell";
import { PlanCard } from "@/components/billing/plan-card";
import { StatusBanner } from "@/components/billing/status-banner";
import { hasScheduledSubscription, trialDaysLeft } from "@/lib/billing/access";
import { formatStripeAmount } from "@/lib/utils/money";
import { getCoachingViewModel } from "@/lib/clubs/coaching-view";
import { memberCoachingLinkLabel } from "@/lib/clubs/coaching-state";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { MemberBillingButtons } from "./member-billing-buttons";

const COACHING_COPY: Record<string, string> = {
  NONE: "Add one-on-one coaching from your club coach.",
  REQUESTED: "Your coaching request is awaiting your coach.",
  ACCEPTED: "Your coach accepted. Start coaching to begin.",
  ACTIVE: "Coaching is active.",
  PAST_DUE: "Coaching is paused. Update your payment to resume.",
  DECLINED: "Your last coaching request wasn't accepted.",
  CANCELED: "Coaching has ended.",
};

export async function MemberBillingView({
  org, sub, reason, userId,
}: { org: Organization; sub: MemberSubscription | null; reason: string | null; userId: string }) {
  const branding = await getOrgBranding(org.clerkOrgId);
  const price = org.stripePriceId ? await stripe.prices.retrieve(org.stripePriceId).catch(() => null) : null;
  const priceLabel = price?.unit_amount != null
    ? { price: formatStripeAmount(price.unit_amount, price.currency), interval: price.recurring?.interval ?? "month" }
    : null;
  const coaching = await getCoachingViewModel({ id: userId, role: "CLIENT", clerkOrgId: org.clerkOrgId });
  const coachingLink = coaching ? memberCoachingLinkLabel(coaching.status) : null;
  const daysLeft = trialDaysLeft(sub, new Date());
  const isActive = sub?.status === "ACTIVE" || sub?.status === "PAST_DUE";
  // Subscribed during the trial: Stripe starts billing when it ends.
  const scheduled = hasScheduledSubscription(sub);
  // PAST_DUE/UNPAID already have a subscription: fix the card via the portal, don't start a second.
  const hasSubscription = isActive || scheduled || sub?.status === "UNPAID";

  return (
    <>
      <BrandStyle branding={branding} />
      <AuthShell
        branding={toViewModel(branding)}
        headline={`${branding.displayName} membership`}
        subhead={isActive ? "Your membership is active." : "Manage your membership and billing."}
      >
        <div className="flex flex-col gap-6">
          {reason === "trial_expired" && (
            <StatusBanner tone="neutral">Your free trial has ended. Subscribe to keep training.</StatusBanner>
          )}
          {reason === "payment_failed" && (
            <StatusBanner tone="danger">
              Your last payment failed — update your card to restore access.
            </StatusBanner>
          )}
          {daysLeft !== null && (
            <StatusBanner tone="info">
              {daysLeft} day{daysLeft === 1 ? "" : "s"} left in your free trial.
              {scheduled ? " Your membership starts automatically when it ends." : null}
            </StatusBanner>
          )}
          <PlanCard
            name="Monthly membership"
            price={priceLabel?.price}
            cadence={priceLabel ? `/ ${priceLabel.interval}` : undefined}
            billedNote={priceLabel ? `Billed ${priceLabel.interval === "month" ? "monthly" : `per ${priceLabel.interval}`}` : undefined}
            features={["Your club's training programs", "Workout logging and progress tracking"]}
          >
            <MemberBillingButtons
              canSubscribe={!hasSubscription && Boolean(org.stripePriceId)}
              canManage={Boolean(sub?.stripeCustomerId)}
              missingPrice={!org.stripePriceId}
            />
          </PlanCard>
          {coaching && (
            <PlanCard
              name="Coaching"
              price={coaching.priceLabel ?? undefined}
              billedNote={COACHING_COPY[coaching.status ?? "NONE"]}
            >
              <MemberBillingButtons
                canSubscribe={false}
                canManage={coaching.status === "ACTIVE" || coaching.status === "PAST_DUE"}
                missingPrice={false}
              />
              {coachingLink && (
                <Button asChild variant="outline" size="lg" className="h-11 w-full">
                  <Link href="/dashboard">{coachingLink}</Link>
                </Button>
              )}
            </PlanCard>
          )}
        </div>
      </AuthShell>
    </>
  );
}
