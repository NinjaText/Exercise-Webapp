import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CircleAlert, Unplug } from "lucide-react";
import { requireRole } from "@/lib/current-user";
import { arePaymentsAvailable } from "@/lib/payments/payments-access";
import { isConnectOAuthEnabled } from "@/lib/payments/connect-config";
import { getConnectOverview } from "@/lib/services/connected-account.service";
import { listOffersForTrainer, listTemplateOptions } from "@/lib/services/paid-offer.service";
import { listSubscriptionsForTrainer } from "@/lib/services/offer-subscription.service";
import { PageHeader } from "@/components/shared/page-header";
import { PageShell } from "@/components/shared/page-shell";
import { EmptyState } from "@/components/shared/empty-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConnectStatusCard } from "@/components/payments/connect-status-card";
import { OffersPanel, type OfferCardData } from "@/components/payments/offers-panel";
import { ChargesTab, PayoutsTab, SubscriptionsTab } from "@/components/payments/payments-tabs";

export const metadata: Metadata = { title: "Payments" };

const TABS = ["offers", "payments", "subscriptions", "payouts"] as const;
type Tab = (typeof TABS)[number];

/** Short status flags set by the onboarding / OAuth redirects. */
const FLASH: Record<string, { text: string; error?: boolean }> = {
  "onboarding:error": { text: "We couldn't reopen Stripe onboarding. Try again from the button below.", error: true },
  "connect:connected": { text: "Your Stripe account is connected." },
  "connect:canceled": { text: "Stripe connection canceled." },
  "connect:account_in_use": { text: "That Stripe account is already connected to another MIA trainer.", error: true },
  "connect:forbidden": { text: "That Stripe connection link expired. Please start again.", error: true },
  "connect:error": { text: "We couldn't connect your Stripe account. Please try again.", error: true },
};

interface Props {
  searchParams: Promise<{ tab?: string; onboarding?: string; connect?: string }>;
}

function TabSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

function ReconnectNotice() {
  return (
    <EmptyState
      size="compact"
      icon={Unplug}
      title="Stripe isn't connected"
      description="Connect your Stripe account to see live payments and payouts here."
    />
  );
}

export default async function PaymentsPage({ searchParams }: Props) {
  const trainer = await requireRole("TRAINER");
  if (!(await arePaymentsAvailable(trainer))) redirect("/dashboard");

  const params = await searchParams;
  const initialTab: Tab = TABS.includes(params.tab as Tab) ? (params.tab as Tab) : "offers";
  const flash =
    (params.onboarding && FLASH[`onboarding:${params.onboarding}`]) ||
    (params.connect && FLASH[`connect:${params.connect}`]) ||
    null;

  const [overview, offers, templates, subscriptions] = await Promise.all([
    getConnectOverview(trainer),
    listOffersForTrainer(trainer.id),
    listTemplateOptions(trainer.id),
    listSubscriptionsForTrainer(trainer.id),
  ]);

  const account = overview.account;
  const liveAccountId = account && !account.disconnectedAt ? account.stripeAccountId : null;
  const templateName = new Map(templates.map((t) => [t.id, t.name]));
  const offerCards: OfferCardData[] = offers.map((o) => ({
    id: o.id,
    kind: o.kind === "COACHING" ? "COACHING" : "PROGRAM",
    name: o.name,
    description: o.description,
    priceInCents: o.priceInCents,
    currency: o.currency,
    programTemplateId: o.programTemplateId,
    cancellationPolicy: o.cancellationPolicy,
    isActive: o.isActive,
    programName: o.programTemplateId ? (templateName.get(o.programTemplateId) ?? "A program") : null,
  }));
  const activeMembers = subscriptions.filter((s) => s.status === "ACTIVE").length;
  // Memberships still running on an account that is no longer the live one
  // (disconnected, or replaced by a new account) must be managed in Stripe.
  const orphaned = subscriptions.filter(
    (s) => s.status !== "CANCELED" && s.stripeAccountId !== liveAccountId
  ).length;

  return (
    <PageShell>
      <Tabs defaultValue={initialTab} className="gap-6">
        <PageHeader
          title="Payments"
          description="Sell programs and coaching memberships. Clients pay you directly through Stripe; MIA takes no commission."
          tabs={
            account ? (
              <TabsList variant="line">
                <TabsTrigger value="offers">Offers</TabsTrigger>
                <TabsTrigger value="payments">Payments</TabsTrigger>
                <TabsTrigger value="subscriptions">
                  Memberships{activeMembers > 0 ? ` (${activeMembers})` : ""}
                </TabsTrigger>
                <TabsTrigger value="payouts">Payouts</TabsTrigger>
              </TabsList>
            ) : undefined
          }
        />

        {flash && (
          <Alert variant={flash.error ? "destructive" : "default"}>
            {flash.error && <CircleAlert aria-hidden />}
            <AlertDescription>{flash.text}</AlertDescription>
          </Alert>
        )}

        {orphaned > 0 && (
          <Alert>
            <CircleAlert aria-hidden />
            <AlertDescription>
              {orphaned} membership{orphaned === 1 ? " is" : "s are"} billed on a Stripe account that is no longer
              connected. Manage or cancel {orphaned === 1 ? "it" : "them"} in that account&apos;s Stripe Dashboard.
            </AlertDescription>
          </Alert>
        )}

        <ConnectStatusCard
          status={overview.status}
          chargesEnabled={account?.chargesEnabled ?? false}
          payoutsEnabled={account?.payoutsEnabled ?? false}
          requirementsDueCount={overview.requirementsDue.length}
          liveError={overview.liveError}
          oauthEnabled={isConnectOAuthEnabled()}
        />

        {account && (
          <>
            <TabsContent value="offers">
              <OffersPanel offers={offerCards} templates={templates} canPublish={overview.status === "ACTIVE"} />
            </TabsContent>
            <TabsContent value="payments">
              {liveAccountId ? (
                <Suspense fallback={<TabSkeleton />}>
                  <ChargesTab stripeAccountId={liveAccountId} clerkOrgId={trainer.clerkOrgId} />
                </Suspense>
              ) : (
                <ReconnectNotice />
              )}
            </TabsContent>
            <TabsContent value="subscriptions">
              <SubscriptionsTab subscriptions={subscriptions} />
            </TabsContent>
            <TabsContent value="payouts">
              {liveAccountId ? (
                <Suspense fallback={<TabSkeleton />}>
                  <PayoutsTab stripeAccountId={liveAccountId} />
                </Suspense>
              ) : (
                <ReconnectNotice />
              )}
            </TabsContent>
          </>
        )}
      </Tabs>
    </PageShell>
  );
}
