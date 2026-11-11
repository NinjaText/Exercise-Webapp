import { notFound } from "next/navigation";
import { CircleDollarSign, MousePointerClick, Pencil, UserCheck, Users, Wallet } from "lucide-react";
import type { Commission, Payout } from "@prisma/client";
import { requireSuperAdmin } from "@/lib/current-user";
import { PageShell } from "@/components/shared/page-shell";
import { PageHeader } from "@/components/shared/page-header";
import { DataList, type Column } from "@/components/shared/data-list";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { getContractorDetail, type ReferralWithLive, type RetentionProgress } from "@/lib/referrals/admin";
import { describeCommission, describeRetention, formatCents } from "@/lib/referrals/terms";
import { referralLinkPath } from "@/lib/referrals/codes";
import { appBaseUrl } from "@/lib/utils/app-url";
import { ContractorDialog } from "../contractor-dialog";
import { planOptions } from "../plan-options";
import { COMMISSION_KIND, CommissionStatusBadge, ReferralStatusBadge, SUB_STATUS_LABEL, formatDate } from "../ui";
import {
  AdjustmentDialog,
  CopyField,
  DeleteContractorButton,
  RecordPayoutDialog,
  ReversePayoutButton,
  VoidCommissionButton,
} from "./ledger-actions";

export const metadata = { title: "Contractor — Referrals" };

function RetentionCard({ g }: { g: RetentionProgress }) {
  const pct = Math.min(100, Math.round((g.qualified / g.required) * 100));
  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-body font-medium text-foreground">{g.label}</p>
        {g.bonusesEarned > 0 && (
          <StatusBadge status="earned" role="success" size="sm" label={`${g.bonusesEarned} earned`} />
        )}
      </div>
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between text-caption">
          <span>
            <span className="font-medium text-foreground tabular-nums">{g.qualified}</span> of {g.required} retained toward the next{" "}
            {formatCents(g.bonusCents)}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <p className="text-caption">
        {g.inWindow > 0
          ? `${g.inWindow} paying subscriber${g.inWindow === 1 ? "" : "s"} still in the retention period${
              g.nextDueAt ? ` · next check ${formatDate(g.nextDueAt)}` : ""
            }.`
          : "No subscribers currently in the retention period."}
      </p>
    </div>
  );
}

export default async function ContractorPage({ params }: { params: Promise<{ contractorId: string }> }) {
  await requireSuperAdmin();
  const { contractorId } = await params;
  if (!/^[a-f0-9]{24}$/i.test(contractorId)) notFound();
  const [detail, plans] = await Promise.all([getContractorDetail(contractorId), planOptions()]);
  if (!detail) notFound();
  const { contractor: c, referrals, commissions, payouts, counts, balances, retention } = detail;

  const link = `${appBaseUrl().replace(/\/$/, "")}${referralLinkPath(c.referralCode)}`;
  const hasHistory = referrals.length + commissions.length + payouts.length > 0;
  const unpaid = commissions
    .filter((x) => x.status === "UNPAID")
    .map((x) => ({ id: x.id, description: x.description, amountCents: x.amountCents, earnedAt: formatDate(x.earnedAt) }));

  const referralColumns: Column<ReferralWithLive>[] = [
    {
      key: "who",
      header: "Subscriber",
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{r.referredName}</p>
          <p className="truncate text-caption">{r.referredEmail}</p>
        </div>
      ),
    },
    {
      key: "type",
      header: "Type",
      className: "hidden md:table-cell",
      render: (r) => (
        <span className="text-body">
          {r.subscriberType === "TRAINER" ? "Trainer" : "Individual"}
          <span className="text-caption"> · via {r.source}</span>
        </span>
      ),
    },
    { key: "status", header: "Referral", render: (r) => <ReferralStatusBadge status={r.status} /> },
    {
      key: "sub",
      header: "Subscription",
      className: "hidden lg:table-cell",
      render: (r) => (
        <span className="text-body">{r.live ? SUB_STATUS_LABEL[r.live.status] : <span className="text-muted-foreground">Account deleted</span>}</span>
      ),
    },
    {
      key: "joined",
      header: "Signed up",
      className: "hidden lg:table-cell",
      render: (r) => <span className="text-caption tabular-nums">{formatDate(r.createdAt)}</span>,
    },
    {
      key: "paid",
      header: "Paid",
      align: "right",
      className: "hidden sm:table-cell",
      render: (r) =>
        r.firstPaidAt ? (
          <span className="tabular-nums" title={`First payment ${formatDate(r.firstPaidAt)} · ${r.paidInvoiceCount} invoice(s)`}>
            {formatCents(r.totalPaidCents)}
          </span>
        ) : (
          <span className="text-caption">—</span>
        ),
    },
    {
      key: "terms",
      header: "Terms",
      className: "hidden xl:table-cell",
      render: (r) => (
        <span className="text-caption" title={describeRetention(r)}>
          {r.planName ?? "No plan"} · {describeCommission(r.commissionType, r.commissionValue)}
        </span>
      ),
    },
  ];

  const commissionColumns: Column<Commission>[] = [
    { key: "when", header: "Earned", render: (x) => <span className="text-caption tabular-nums">{formatDate(x.earnedAt)}</span> },
    {
      key: "what",
      header: "Commission",
      render: (x) => (
        <div className="min-w-0">
          <p className="text-body">{COMMISSION_KIND[x.kind]}</p>
          <p className="truncate text-caption" title={x.voidReason ? `Voided: ${x.voidReason}` : x.description}>
            {x.voidReason ? `Voided: ${x.voidReason}` : x.description}
          </p>
        </div>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      render: (x) => (
        <span className={x.status === "VOID" ? "tabular-nums text-muted-foreground line-through" : "tabular-nums"}>
          {formatCents(x.amountCents)}
        </span>
      ),
    },
    { key: "status", header: "Status", render: (x) => <CommissionStatusBadge status={x.status} /> },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (x) =>
        x.status === "UNPAID" ? (
          <VoidCommissionButton commissionId={x.id} label={`${x.description} — ${formatCents(x.amountCents)}`} />
        ) : null,
    },
  ];

  const payoutColumns: Column<Payout>[] = [
    { key: "when", header: "Paid", render: (p) => <span className="text-caption tabular-nums">{formatDate(p.paidAt)}</span> },
    {
      key: "amount",
      header: "Amount",
      render: (p) => (
        <span className={p.reversedAt ? "tabular-nums text-muted-foreground line-through" : "font-medium tabular-nums"}>
          {formatCents(p.amountCents)}
        </span>
      ),
    },
    {
      key: "method",
      header: "Method",
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
      className: "hidden md:table-cell",
      align: "right",
      render: (p) => <span className="tabular-nums">{p.commissionIds.length}</span>,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (p) =>
        p.reversedAt ? (
          <StatusBadge status="reversed" role="neutral" size="sm" label={`Reversed ${formatDate(p.reversedAt)}`} />
        ) : (
          <ReversePayoutButton payoutId={p.id} amount={formatCents(p.amountCents)} />
        ),
    },
  ];

  return (
    <PageShell>
      <PageHeader
        title={c.name}
        breadcrumb={[
          { label: "Admin", href: "/admin" },
          { label: "Referrals", href: "/admin/referrals" },
          { label: c.name },
        ]}
        description={[c.email, c.phone].filter(Boolean).join(" · ")}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            {c.isActive ? (
              <StatusBadge status="active" role="success" size="sm" label="Active" />
            ) : (
              <StatusBadge status="inactive" role="neutral" size="sm" label="Inactive — link and code don't attribute" />
            )}
            <StatusBadge
              status="plan"
              role={c.plan ? "brand" : "neutral"}
              size="sm"
              label={c.plan ? `Plan: ${c.plan.name}` : "No plan — tracking only"}
            />
          </div>
        }
        primaryAction={<RecordPayoutDialog contractorId={c.id} contractorName={c.name} unpaid={unpaid} />}
        secondaryActions={
          <>
            <ContractorDialog
              plans={plans}
              contractor={{
                id: c.id,
                name: c.name,
                email: c.email,
                phone: c.phone,
                notes: c.notes,
                referralCode: c.referralCode,
                planId: c.planId,
                isActive: c.isActive,
              }}
              trigger={
                <Button variant="outline">
                  <Pencil className="size-4" aria-hidden />
                  Edit
                </Button>
              }
            />
            {!hasHistory && <DeleteContractorButton contractorId={c.id} name={c.name} />}
          </>
        }
      />

      <div className="grid gap-4 rounded-lg border border-border bg-surface p-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <CopyField label="Referral link" value={link} />
        <CopyField label="Referral code" value={c.referralCode} mono />
        <p className="text-caption md:col-span-2">
          Visitors who open the link are remembered for 60 days. Anyone can also type the code on the sign-up page. Add{" "}
          <code className="font-mono">?to=professionals</code>, <code className="font-mono">individuals</code> or{" "}
          <code className="font-mono">pricing</code> to land on a specific page.
          {c.plan && (
            <>
              {" "}
              Current terms: trainers {describeCommission(c.plan.trainerCommissionType, c.plan.trainerCommissionValue).toLowerCase()};
              individuals {describeCommission(c.plan.individualCommissionType, c.plan.individualCommissionValue).toLowerCase()};{" "}
              {describeRetention(c.plan).toLowerCase()}.
            </>
          )}
        </p>
        {c.notes && <p className="whitespace-pre-line text-body text-muted-foreground md:col-span-2">{c.notes}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-5">
        <StatCard size="compact" label="Link clicks" value={c.linkClicks} icon={MousePointerClick} role="neutral" />
        <StatCard size="compact" label="Referrals" value={counts.total} icon={Users} role="neutral" />
        <StatCard size="compact" label="Paying" value={counts.paying} icon={UserCheck} role="success" />
        <StatCard size="compact" label="Earned" value={formatCents(balances.earnedCents)} icon={CircleDollarSign} role="brand" />
        <StatCard
          size="compact"
          label="Unpaid balance"
          value={formatCents(balances.unpaidCents)}
          icon={Wallet}
          role={balances.unpaidCents > 0 ? "warning" : "neutral"}
          className="col-span-2 xl:col-span-1"
        />
      </div>

      {retention.length > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Retention bonuses</h2>
            <p className="text-caption">
              Checked daily against Stripe. Referrals made under different terms count toward separate bonuses.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {retention.map((g) => (
              <RetentionCard key={g.key} g={g} />
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Referrals</h2>
        <DataList
          columns={referralColumns}
          data={referrals}
          keyExtractor={(r) => r.id}
          emptyMessage="No sign-ups yet. Share the referral link to get started."
        />
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Commissions</h2>
            <p className="text-caption">
              Unpaid {formatCents(balances.unpaidCents)} · Paid {formatCents(balances.paidCents)}
            </p>
          </div>
          <AdjustmentDialog contractorId={c.id} />
        </div>
        <DataList
          columns={commissionColumns}
          data={commissions}
          keyExtractor={(x) => x.id}
          emptyMessage="Commissions are earned when a referred subscriber's first payment clears in Stripe."
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Payouts</h2>
        <DataList columns={payoutColumns} data={payouts} keyExtractor={(p) => p.id} emptyMessage="No payouts recorded yet." />
      </section>
    </PageShell>
  );
}
