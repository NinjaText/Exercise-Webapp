import Link from "next/link";
import type { Payout } from "@prisma/client";
import { requireSuperAdmin } from "@/lib/current-user";
import { PageShell } from "@/components/shared/page-shell";
import { PageHeader } from "@/components/shared/page-header";
import { DataList, type Column } from "@/components/shared/data-list";
import { StatusBadge } from "@/components/shared/status-badge";
import { listPayouts } from "@/lib/referrals/admin";
import { formatCents } from "@/lib/referrals/terms";
import { ReferralsTabs, formatDate } from "../ui";

export const metadata = { title: "Payout history — Referrals" };

type Row = Payout & { contractor: { id: string; name: string } };

export default async function PayoutHistoryPage() {
  await requireSuperAdmin();
  const payouts = await listPayouts();
  const total = payouts.filter((p) => !p.reversedAt).reduce((sum, p) => sum + p.amountCents, 0);

  const columns: Column<Row>[] = [
    { key: "when", header: "Paid", render: (p) => <span className="text-caption tabular-nums">{formatDate(p.paidAt)}</span> },
    {
      key: "who",
      header: "Contractor",
      render: (p) => (
        <Link href={`/admin/referrals/${p.contractor.id}`} className="relative z-10 font-medium text-foreground hover:underline">
          {p.contractor.name}
        </Link>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      render: (p) => (
        <span className={p.reversedAt ? "tabular-nums text-muted-foreground line-through" : "font-medium tabular-nums"}>
          {formatCents(p.amountCents)}
        </span>
      ),
    },
    {
      key: "method",
      header: "Method",
      className: "hidden md:table-cell",
      render: (p) => (
        <div className="min-w-0">
          <p className="text-body">{p.method}</p>
          {(p.reference || p.note) && <p className="truncate text-caption">{[p.reference, p.note].filter(Boolean).join(" · ")}</p>}
        </div>
      ),
    },
    {
      key: "count",
      header: "Commissions",
      align: "right",
      className: "hidden sm:table-cell",
      render: (p) => <span className="tabular-nums">{p.commissionIds.length}</span>,
    },
    {
      key: "status",
      header: "",
      align: "right",
      render: (p) =>
        p.reversedAt ? <StatusBadge status="reversed" role="neutral" size="sm" label="Reversed" /> : null,
    },
  ];

  return (
    <PageShell>
      <PageHeader
        title="Referrals"
        breadcrumb={[
          { label: "Admin", href: "/admin" },
          { label: "Referrals", href: "/admin/referrals" },
          { label: "Payout history" },
        ]}
        description={`Every payout recorded to a contractor. ${formatCents(total)} paid in total.`}
        tabs={<ReferralsTabs active="payouts" />}
      />
      <DataList
        columns={columns}
        data={payouts}
        keyExtractor={(p) => p.id}
        emptyMessage="No payouts yet. Record one from a contractor's page."
      />
    </PageShell>
  );
}
