import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { Dumbbell, ShoppingBag } from "lucide-react";
import { requireRole } from "@/lib/current-user";
import { arePaymentsAvailable } from "@/lib/payments/payments-access";
import { badgeFor, PURCHASE_BADGE } from "@/lib/payments/status-badges";
import { formatStripeAmount } from "@/lib/utils/money";
import { listStoreOffers } from "@/lib/services/paid-offer.service";
import { listPurchasesForClient, type PurchaseListItem } from "@/lib/services/offer-purchase.service";
import { listSubscriptionsForClient } from "@/lib/services/offer-subscription.service";
import { LIVE_SUBSCRIPTION_STATUSES, type OfferSubscriptionStatus } from "@/lib/payments/connect-config";
import { PageHeader } from "@/components/shared/page-header";
import { PageShell } from "@/components/shared/page-shell";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { StoreOfferCard, type StoreOfferCardData } from "@/components/payments/store-offer-card";
import { StoreMemberships, type MembershipRow } from "@/components/payments/store-memberships";

export const metadata: Metadata = { title: "Store" };

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-heading text-foreground">{title}</h2>
        {description && <p className="text-body text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function PurchaseList({ purchases }: { purchases: PurchaseListItem[] }) {
  return (
    <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-xl bg-card shadow-xs ring-1 ring-border">
      {purchases.map((p) => {
        const badge = badgeFor(PURCHASE_BADGE, p.status);
        const settingUp = p.status === "PAID" && p.fulfillmentStatus !== "FULFILLED";
        return (
          <li key={p.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand-foreground">
                <Dumbbell className="size-4" aria-hidden />
              </span>
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-label text-foreground">{p.offerName}</p>
                  <StatusBadge status={p.status} label={badge.label} role={badge.role} size="sm" />
                </div>
                <p className="text-caption">
                  {formatStripeAmount(p.amountInCents, p.currency)} · {format(p.paidAt ?? p.createdAt, "MMM d, yyyy")}
                  {settingUp && " · Setting up your program…"}
                </p>
              </div>
            </div>
            {p.status === "PAID" && p.assignedProgramId && !settingUp && (
              <Link
                href="/programs"
                className="text-label text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
              >
                Go to program
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default async function StorePage() {
  const client = await requireRole("CLIENT");
  if (!(await arePaymentsAvailable(client))) redirect("/dashboard");

  const [offers, purchases, subscriptions] = await Promise.all([
    listStoreOffers(client),
    listPurchasesForClient(client.id),
    listSubscriptionsForClient(client.id),
  ]);

  const ownedPrograms = new Set(purchases.filter((p) => p.status === "PAID").map((p) => p.offerId));
  const liveMemberships = new Set(
    subscriptions
      .filter((s) => LIVE_SUBSCRIPTION_STATUSES.includes(s.status as OfferSubscriptionStatus))
      .map((s) => s.offerId)
  );
  const showTrainer = new Set(offers.map((o) => o.trainerId)).size > 1;
  const cards: StoreOfferCardData[] = offers.map((o) => ({
    id: o.id,
    kind: o.kind,
    name: o.name,
    description: o.description,
    priceInCents: o.priceInCents,
    currency: o.currency,
    cancellationPolicy: o.cancellationPolicy,
    trainerName: o.trainerName,
    programName: o.programName,
    owned: o.kind === "PROGRAM" ? ownedPrograms.has(o.id) : liveMemberships.has(o.id),
  }));
  const coaching = cards.filter((c) => c.kind === "COACHING");
  const programs = cards.filter((c) => c.kind === "PROGRAM");

  const memberships: MembershipRow[] = subscriptions.map((s) => ({
    id: s.id,
    offerName: s.offerName,
    priceInCents: s.priceInCents,
    currency: s.currency,
    cancellationPolicy: s.cancellationPolicy,
    status: s.status,
    currentPeriodEnd: s.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: s.cancelAtPeriodEnd,
    canceledAt: s.canceledAt?.toISOString() ?? null,
  }));

  const nothingYet = cards.length === 0 && memberships.length === 0 && purchases.length === 0;

  return (
    <PageShell>
      <PageHeader title="Store" description="Programs and coaching from your coach. Payments are handled securely by Stripe." />

      {nothingYet ? (
        <EmptyState
          icon={ShoppingBag}
          title="Nothing for sale yet"
          description="When your coach publishes a program or a coaching membership, you'll find it here."
        />
      ) : (
        <div className="flex flex-col gap-8">
          {memberships.length > 0 && (
            <Section title="Your memberships">
              <StoreMemberships memberships={memberships} />
            </Section>
          )}

          {coaching.length > 0 && (
            <Section title="Coaching" description="Ongoing one-on-one coaching, billed monthly.">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {coaching.map((offer) => (
                  <StoreOfferCard key={offer.id} offer={offer} showTrainer={showTrainer} />
                ))}
              </div>
            </Section>
          )}

          {programs.length > 0 && (
            <Section title="Programs" description="Buy once and the program is added to your plan.">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {programs.map((offer) => (
                  <StoreOfferCard key={offer.id} offer={offer} showTrainer={showTrainer} />
                ))}
              </div>
            </Section>
          )}

          {purchases.length > 0 && (
            <Section title="Your purchases">
              <PurchaseList purchases={purchases} />
            </Section>
          )}
        </div>
      )}
    </PageShell>
  );
}
