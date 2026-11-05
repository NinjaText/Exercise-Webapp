import { Bot, Cpu, Gauge, Users } from "lucide-react";
import { requireSuperAdmin } from "@/lib/current-user";
import { TIER_CONFIG } from "@/lib/stripe-config";
import { PageShell } from "@/components/shared/page-shell";
import { PageHeader } from "@/components/shared/page-header";
import { DataList, type Column } from "@/components/shared/data-list";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  getSystemUsage,
  listRecentUsageEvents,
  listTierAllowances,
  listTrainerUsage,
  type TrainerUsageRow,
} from "@/lib/ai/usage/admin";
import { UNLIMITED_REASON_LABELS } from "@/lib/ai/usage/config";
import { formatResetDate } from "@/lib/ai/usage/errors";
import { formatTokens, usagePercent } from "@/lib/ai/usage/format";
import { TierAllowanceForm } from "./tier-allowance-form";
import { TrainerUsageDialog } from "./trainer-usage-dialog";

export const metadata = { title: "AI Usage — Super Admin" };

type EventRow = Awaited<ReturnType<typeof listRecentUsageEvents>>[number];

export default async function AdminAiUsagePage() {
  await requireSuperAdmin();

  const [tiers, trainers, system, events] = await Promise.all([
    listTierAllowances(),
    listTrainerUsage(),
    getSystemUsage(),
    listRecentUsageEvents(50),
  ]);
  const tierAllowance = Object.fromEntries(tiers.map((t) => [t.tier, t.monthlyTokens]));
  const nameById = new Map(trainers.map((t) => [t.userId, t.name]));

  const totalUsed = trainers.reduce((sum, t) => sum + t.used, 0) + system.used;
  const exhausted = trainers.filter((t) => t.remaining === 0).length;
  const nearLimit = trainers.filter(
    (t) => t.allowance.total !== null && t.remaining !== 0 && usagePercent(t.used, t.allowance.total) >= 80
  ).length;

  // Most active first.
  const rows = [...trainers].sort((a, b) => b.used - a.used);

  const columns: Column<TrainerUsageRow>[] = [
    {
      key: "trainer",
      header: "Trainer",
      render: (t) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{t.name}</p>
          <p className="truncate text-caption">{t.email}</p>
        </div>
      ),
    },
    {
      key: "plan",
      header: "Plan",
      className: "hidden md:table-cell",
      render: (t) => (
        <span className="text-body">
          {TIER_CONFIG[t.tier].label}
          {t.subStatus ? <span className="text-caption"> · {t.subStatus.toLowerCase()}</span> : null}
        </span>
      ),
    },
    {
      key: "usage",
      header: "Used this cycle",
      render: (t) => {
        const pct = usagePercent(t.used, t.allowance.total);
        return (
          <div className="min-w-32 space-y-1">
            <p className="text-body tabular-nums">
              {formatTokens(t.used)} / {t.allowance.total === null ? "∞" : formatTokens(t.allowance.total)}
              {t.bonusTokens > 0 ? <span className="text-caption"> (+{formatTokens(t.bonusTokens)} bonus)</span> : null}
            </p>
            {t.allowance.total !== null && (
              <div className="h-1 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
                <div
                  className={pct >= 100 ? "h-full bg-danger" : pct >= 80 ? "h-full bg-warning" : "h-full bg-primary"}
                  style={{ width: `${pct}%` }}
                />
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      render: (t) =>
        t.allowance.unlimitedReason ? (
          <StatusBadge status="unlimited" role="info" size="sm" label={`Unlimited · ${UNLIMITED_REASON_LABELS[t.allowance.unlimitedReason]}`} />
        ) : t.remaining === 0 ? (
          <StatusBadge status="exhausted" role="danger" size="sm" label="Exhausted" />
        ) : t.allowance.source === "custom" ? (
          <StatusBadge status="custom" role="brand" size="sm" label="Custom limit" />
        ) : (
          <StatusBadge status="ok" role="success" size="sm" label="Within limit" />
        ),
    },
    {
      key: "resets",
      header: "Resets",
      className: "hidden lg:table-cell",
      render: (t) => (
        <span className="text-caption tabular-nums">
          {formatResetDate(t.window.end)}
          {t.window.source === "calendar" ? " · calendar" : ""}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (t) => (
        <TrainerUsageDialog
          userId={t.userId}
          name={t.name}
          tierLabel={TIER_CONFIG[t.tier].label}
          tierAllowance={tierAllowance[t.tier]}
          resetsOn={formatResetDate(t.window.end)}
          bonusTokens={t.bonusTokens}
          override={t.override}
        />
      ),
    },
  ];

  const eventColumns: Column<EventRow>[] = [
    {
      key: "when",
      header: "When",
      render: (e) => (
        <span className="text-caption tabular-nums">
          {e.createdAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
        </span>
      ),
    },
    {
      key: "account",
      header: "Account",
      render: (e) => (
        <span className="text-body">
          {e.accountKey === "system" ? "System" : (nameById.get(e.accountKey) ?? e.accountKey)}
        </span>
      ),
    },
    { key: "feature", header: "Feature", render: (e) => <span className="text-body">{e.feature}</span> },
    {
      key: "model",
      header: "Model",
      className: "hidden md:table-cell",
      render: (e) => <span className="text-caption">{e.model ?? "—"}</span>,
    },
    {
      key: "tokens",
      header: "Tokens",
      align: "right",
      render: (e) => (
        <span className="tabular-nums" title={`${e.promptTokens} prompt + ${e.completionTokens} completion`}>
          {e.totalTokens.toLocaleString("en-US")}
        </span>
      ),
    },
  ];

  return (
    <PageShell>
      <PageHeader
        title="AI Usage"
        breadcrumb={[{ label: "Admin", href: "/admin" }, { label: "AI Usage" }]}
        description="Monthly AI token allowances per plan, each trainer's usage this billing cycle, and per-trainer overrides."
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard size="compact" label="Tokens this cycle" value={formatTokens(totalUsed)} icon={Cpu} role="brand" />
        <StatCard size="compact" label="Trainers exhausted" value={exhausted} icon={Gauge} role={exhausted > 0 ? "danger" : "success"} />
        <StatCard size="compact" label="Trainers ≥ 80%" value={nearLimit} icon={Users} role={nearLimit > 0 ? "warning" : "neutral"} />
        <StatCard
          size="compact"
          label="System (no user)"
          value={formatTokens(system.used)}
          icon={Bot}
          role="neutral"
        />
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Plan allowances</h2>
          <p className="text-caption">
            Tokens per billing cycle (prompt + completion). Changes apply immediately. Super admins, billing-exempt
            accounts and clubs are unlimited but still tracked.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {tiers.map((t) => (
            <TierAllowanceForm
              key={t.tier}
              tier={t.tier}
              label={TIER_CONFIG[t.tier].label}
              monthlyTokens={t.monthlyTokens}
              isDefault={t.isDefault}
            />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Trainers</h2>
        <DataList columns={columns} data={rows} keyExtractor={(t) => t.userId} emptyMessage="No trainers yet." />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Recent AI calls</h2>
        <DataList
          columns={eventColumns}
          data={events}
          keyExtractor={(e) => e.id}
          density="compact"
          emptyMessage="No AI calls recorded yet."
        />
      </section>
    </PageShell>
  );
}
