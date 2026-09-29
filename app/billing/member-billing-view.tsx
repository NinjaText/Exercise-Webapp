import type { MemberSubscription, Organization } from "@prisma/client";
import { stripe } from "@/lib/stripe";
import { getOrgBranding } from "@/lib/services/branding.service";
import { toViewModel } from "@/lib/branding/types";
import { BrandStyle } from "@/components/branding/brand-style";
import { OrgIdentity } from "@/components/branding/org-identity";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { hasScheduledSubscription, trialDaysLeft } from "@/lib/billing/access";
import { formatStripeAmount } from "@/lib/utils/money";
import { MemberBillingButtons } from "./member-billing-buttons";

export async function MemberBillingView({
  org, sub, reason,
}: { org: Organization; sub: MemberSubscription | null; reason: string | null }) {
  const branding = await getOrgBranding(org.clerkOrgId);
  const price = org.stripePriceId ? await stripe.prices.retrieve(org.stripePriceId).catch(() => null) : null;
  const priceLabel = price?.unit_amount != null
    ? `${formatStripeAmount(price.unit_amount, price.currency)} / ${price.recurring?.interval ?? "month"}`
    : null;
  const daysLeft = trialDaysLeft(sub, new Date());
  const isActive = sub?.status === "ACTIVE" || sub?.status === "PAST_DUE";
  // Subscribed during the trial: Stripe starts billing when it ends.
  const scheduled = hasScheduledSubscription(sub);
  // PAST_DUE/UNPAID already have a subscription: fix the card via the portal, don't start a second.
  const hasSubscription = isActive || scheduled || sub?.status === "UNPAID";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[oklch(0.97_0.005_247)] px-4 py-12">
      <BrandStyle branding={branding} />
      <OrgIdentity branding={toViewModel(branding)} surface="light" />
      {reason === "trial_expired" && (
        <p className="rounded-lg border border-neutral-border bg-neutral-soft px-4 py-3 text-sm text-neutral-foreground">
          Your free trial has ended. Subscribe to keep training.
        </p>
      )}
      {reason === "payment_failed" && (
        <p className="rounded-lg border border-danger-border bg-danger-soft px-4 py-3 text-sm text-danger-foreground">
          Your last payment failed — update your card to restore access.
        </p>
      )}
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{branding.displayName} membership</CardTitle>
          <CardDescription>
            {daysLeft !== null ? `${daysLeft} day${daysLeft === 1 ? "" : "s"} left in your free trial.` : null}
            {scheduled ? " Your membership starts automatically when it ends." : null}
            {isActive ? "Your membership is active." : null}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {priceLabel && <p className="text-2xl font-semibold text-foreground">{priceLabel}</p>}
          <MemberBillingButtons
            canSubscribe={!hasSubscription && Boolean(org.stripePriceId)}
            canManage={Boolean(sub?.stripeCustomerId)}
            missingPrice={!org.stripePriceId}
          />
        </CardContent>
      </Card>
    </div>
  );
}
