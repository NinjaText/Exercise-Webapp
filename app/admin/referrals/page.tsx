import Link from "next/link";
import { Banknote, CircleDollarSign, Hourglass, Plus, UserCheck, Users, Wallet } from "lucide-react";
import { requireSuperAdmin } from "@/lib/current-user";
import { PageShell } from "@/components/shared/page-shell";
import { PageHeader } from "@/components/shared/page-header";
import { DataList, type Column } from "@/components/shared/data-list";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { getReferralOverview, listRecentCommissions, type ContractorRow } from "@/lib/referrals/admin";
import { formatCents } from "@/lib/referrals/terms";
import { ContractorDialog } from "./contractor-dialog";
import { planOptions } from "./plan-options";
import { RecalculateButton } from "./recalculate-button";
import { COMMISSION_KIND, CommissionStatusBadge, ReferralsTabs, formatDate } from "./ui";

export const metadata = { title: "Referrals — Super Admin" };

type CommissionRow = Awaited<ReturnType<typeof listRecentCommissions>>[number];

export default async function AdminReferralsPage() {
  await requireSuperAdmin();
  const [{ rows, totals }, plans, recent] = await Promise.all([
    getReferralOverview(),
    planOptions(),
    listRecentCommissions(12),
  ]);

  const columns: Column<ContractorRow>[] = [
    {
      key: "contractor",
      header: "Contractor",
      render: (c) => (
        <div className="min-w-0">
          <p className="flex items-center gap-2 truncate font-medium text-foreground">
            {c.name}
            {!c.isActive && <StatusBadge status="inactive" role="neutral" size="sm" label="Inactive" />}
          </p>
          <p className="truncate font-mono text-caption">{c.referralCode}</p>
        </div>
      ),
    },
    {
      key: "plan",
      header: "Plan",
      className: "hidden lg:table-cell",
      render: (c) => <span className="text-body">{c.planName ?? <span className="text-muted-foreground">None</span>}</span>,
    },
    {
      key: "referrals",
      header: "Referrals",
      align: "right",
      render: (c) => (
        <span className="tabular-nums" title={`${c.linkClicks} link clicks`}>
          {c.counts.total}
          <span className="text-caption"> · {c.counts.paying} paying</span>
        </span>
      ),
    },
    {
      key: "earned",
      header: "Earned",
      align: "right",
      className: "hidden md:table-cell",
      render: (c) => <span className="tabular-nums">{formatCents(c.balances.earnedCents)}</span>,
    },
    {
      key: "unpaid",
      header: "Unpaid",
      align: "right",
      render: (c) => (
        <span className={c.balances.unpaidCents > 0 ? "font-medium tabular-nums text-foreground" : "tabular-nums text-muted-foreground"}>
          {formatCents(c.balances.unpaidCents)}
        </span>
      ),
    },
    {
      key: "paid",
      header: "Paid out",
      align: "right",
      className: "hidden md:table-cell",
      render: (c) => <span className="tabular-nums text-muted-foreground">{formatCents(c.balances.paidCents)}</span>,
    },
  ];

  const commissionColumns: Column<CommissionRow>[] = [
    { key: "when", header: "Earned", render: (c) => <span className="text-caption tabular-nums">{formatDate(c.earnedAt)}</span> },
    {
      key: "who",
      header: "Contractor",
      render: (c) => (
        <Link href={`/admin/referrals/${c.contractor.id}`} className="relative z-10 font-medium text-foreground hover:underline">
          {c.contractor.name}
        </Link>
      ),
    },
    {
      key: "what",
      header: "Commission",
      className: "hidden md:table-cell",
      render: (c) => (
        <div className="min-w-0">
          <p className="text-body">{COMMISSION_KIND[c.kind]}</p>
          <p className="truncate text-caption">{c.description}</p>
        </div>
      ),
    },
    { key: "amount", header: "Amount", align: "right", render: (c) => <span className="tabular-nums">{formatCents(c.amountCents)}</span> },
    { key: "status", header: "Status", align: "right", render: (c) => <CommissionStatusBadge status={c.status} /> },
  ];

  return (
    <PageShell>
      <PageHeader
        title="Referrals"
        breadcrumb={[{ label: "Admin", href: "/admin" }, { label: "Referrals" }]}
        description="Contractor referral links, commissions verified against Stripe, retention bonuses and payouts."
        primaryAction={
          <ContractorDialog
            plans={plans}
            trigger={
              <Button>
                <Plus className="size-4" aria-hidden />
                Add contractor
              </Button>
            }
          />
        }
        secondaryActions={<RecalculateButton />}
        tabs={<ReferralsTabs active="overview" />}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3 2xl:grid-cols-6">
        <StatCard size="compact" label="Referrals" value={totals.counts.total} icon={Users} role="neutral" />
        <StatCard size="compact" label="Paying subscribers" value={totals.counts.paying} icon={UserCheck} role="success" />
        <StatCard size="compact" label="In retention window" value={totals.counts.inRetentionWindow} icon={Hourglass} role="info" />
        <StatCard size="compact" label="Earned (all time)" value={formatCents(totals.balances.earnedCents)} icon={CircleDollarSign} role="brand" />
        <StatCard
          size="compact"
          label="Unpaid balance"
          value={formatCents(totals.balances.unpaidCents)}
          icon={Wallet}
          role={totals.balances.unpaidCents > 0 ? "warning" : "neutral"}
        />
        <StatCard size="compact" label="Paid out" value={formatCents(totals.balances.paidCents)} icon={Banknote} role="neutral" />
      </div>

      {plans.length === 0 && (
        <div className="rounded-lg border border-dashed border-border bg-surface p-4 text-body">
          <p className="font-medium text-foreground">Start with a commission plan</p>
          <p className="mt-1 text-muted-foreground">
            Plans hold the rates — e.g. $50 per paying trainer and $200 for every 4 trainers retained 2 months. Contractors on
            no plan are tracked but earn nothing.{" "}
            <Link href="/admin/referrals/plans" className="font-medium text-primary hover:underline">
              Create a plan
            </Link>
          </p>
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Contractors</h2>
        <DataList
          columns={columns}
          data={rows}
          keyExtractor={(c) => c.id}
          rowHref={(c) => `/admin/referrals/${c.id}`}
          emptyMessage="No contractors yet. Add one to generate their referral link."
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Recent commissions</h2>
        <DataList
          columns={commissionColumns}
          data={recent}
          keyExtractor={(c) => c.id}
          density="compact"
          emptyMessage="Commissions appear here once referred subscribers make their first payment."
        />
      </section>
    </PageShell>
  );
}
