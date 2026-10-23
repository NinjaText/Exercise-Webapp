import { format } from "date-fns";
import { CalendarSync, CircleAlert, Landmark, Receipt } from "lucide-react";
import { DataList, type Column } from "@/components/shared/data-list";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { StatCard } from "@/components/shared/stat-card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatStripeAmount } from "@/lib/utils/money";
import {
  badgeFor,
  CHARGE_BADGE,
  PAYOUT_BADGE,
  subscriptionBadge,
} from "@/lib/payments/status-badges";
import {
  getPayoutsOverview,
  listRecentCharges,
  type ChargeRow,
  type PayoutRow,
} from "@/lib/services/connect-dashboard.service";
import type { SubscriptionListItem } from "@/lib/services/offer-subscription.service";

/**
 * Server-rendered tab bodies for /payments. The live ones (Payments,
 * Payouts) read Stripe on the connected account and render an inline error
 * instead of failing the page.
 */

function LiveError({ message }: { message: string }) {
  return (
    <Alert variant="destructive">
      <CircleAlert aria-hidden />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

const SECONDARY = "hidden sm:table-cell";

const CHARGE_COLUMNS: Column<ChargeRow>[] = [
  {
    key: "customer",
    header: "Client",
    render: (c) => (
      <div className="min-w-0">
        <p className="truncate text-label text-foreground">{c.customerLabel}</p>
        {c.description && <p className="truncate text-caption">{c.description}</p>}
      </div>
    ),
  },
  {
    key: "status",
    header: "Status",
    render: (c) => {
      const badge = badgeFor(CHARGE_BADGE, c.status);
      return <StatusBadge status={c.status} label={badge.label} role={badge.role} size="sm" />;
    },
  },
  {
    key: "date",
    header: "Date",
    className: SECONDARY,
    render: (c) => format(c.created, "MMM d, yyyy"),
  },
  {
    key: "amount",
    header: "Amount",
    align: "right",
    render: (c) => (
      <span className="tabular-nums">
        {formatStripeAmount(c.amount, c.currency)}
        {c.amountRefunded > 0 && c.status === "PARTIALLY_REFUNDED" && (
          <span className="block text-caption">−{formatStripeAmount(c.amountRefunded, c.currency)} refunded</span>
        )}
      </span>
    ),
  },
];

export async function ChargesTab({ stripeAccountId, clerkOrgId }: { stripeAccountId: string; clerkOrgId: string | null }) {
  const result = await listRecentCharges(stripeAccountId, clerkOrgId);
  if (!result.ok) return <LiveError message={result.error} />;
  return (
    <div className="flex flex-col gap-3">
      <DataList
        columns={CHARGE_COLUMNS}
        data={result.data}
        keyExtractor={(c) => c.id}
        emptyState={
          <EmptyState
            size="compact"
            icon={Receipt}
            title="No payments yet"
            description="Completed, failed and refunded payments from your clients show up here."
          />
        }
      />
      <p className="text-caption">Your 25 most recent payments, live from Stripe. Refunds are issued from the Stripe Dashboard.</p>
    </div>
  );
}

const SUBSCRIPTION_COLUMNS: Column<SubscriptionListItem>[] = [
  {
    key: "client",
    header: "Client",
    render: (s) => (
      <div className="min-w-0">
        <p className="truncate text-label text-foreground">{s.clientName}</p>
        <p className="truncate text-caption">{s.offerName}</p>
      </div>
    ),
  },
  {
    key: "status",
    header: "Status",
    render: (s) => {
      const badge = subscriptionBadge(s.status, s.cancelAtPeriodEnd);
      return <StatusBadge status={s.status} label={badge.label} role={badge.role} size="sm" />;
    },
  },
  {
    key: "period",
    header: "Renews / ends",
    className: SECONDARY,
    render: (s) => {
      if (s.status === "CANCELED") return s.canceledAt ? `Ended ${format(s.canceledAt, "MMM d, yyyy")}` : "Ended";
      if (!s.currentPeriodEnd) return "—";
      return `${s.cancelAtPeriodEnd ? "Ends" : "Renews"} ${format(s.currentPeriodEnd, "MMM d, yyyy")}`;
    },
  },
  {
    key: "price",
    header: "Price",
    align: "right",
    render: (s) => <span className="tabular-nums">{formatStripeAmount(s.priceInCents, s.currency)}/mo</span>,
  },
];

export function SubscriptionsTab({ subscriptions }: { subscriptions: SubscriptionListItem[] }) {
  return (
    <DataList
      columns={SUBSCRIPTION_COLUMNS}
      data={subscriptions}
      keyExtractor={(s) => s.id}
      emptyState={
        <EmptyState
          size="compact"
          icon={CalendarSync}
          title="No memberships yet"
          description="When a client subscribes to a coaching membership, it shows up here."
        />
      }
    />
  );
}

function sumLabel(amounts: { amount: number; currency: string }[]): string {
  if (amounts.length === 0) return formatStripeAmount(0, "usd");
  return amounts.map((a) => formatStripeAmount(a.amount, a.currency)).join(" + ");
}

const PAYOUT_COLUMNS: Column<PayoutRow>[] = [
  {
    key: "date",
    header: "Arrival",
    render: (p) => format(p.arrivalDate, "MMM d, yyyy"),
  },
  {
    key: "status",
    header: "Status",
    render: (p) => {
      const badge = badgeFor(PAYOUT_BADGE, p.status);
      return <StatusBadge status={p.status} label={badge.label} role={badge.role} size="sm" />;
    },
  },
  {
    key: "amount",
    header: "Amount",
    align: "right",
    render: (p) => <span className="tabular-nums">{formatStripeAmount(p.amount, p.currency)}</span>,
  },
];

export async function PayoutsTab({ stripeAccountId }: { stripeAccountId: string }) {
  const result = await getPayoutsOverview(stripeAccountId);
  if (!result.ok) return <LiveError message={result.error} />;
  const { available, pending, payouts } = result.data;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Available balance" value={sumLabel(available)} icon={Landmark} role="success" description="Ready to pay out to your bank" />
        <StatCard label="Pending balance" value={sumLabel(pending)} icon={Landmark} description="Still settling with Stripe" />
      </div>
      <DataList
        columns={PAYOUT_COLUMNS}
        data={payouts}
        keyExtractor={(p) => p.id}
        emptyState={
          <EmptyState
            size="compact"
            icon={Landmark}
            title="No payouts yet"
            description="Stripe pays out your balance to your bank on your payout schedule."
          />
        }
      />
    </div>
  );
}
