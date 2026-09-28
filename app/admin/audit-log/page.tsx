import { Activity, ShieldAlert, UserRound, Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import {
  auditQueryFromFilters,
  getAuditActorTypeCounts,
  getAuditLogs,
  getAuditOrgNames,
  getAuditOverview,
} from "@/lib/services/audit-log.service";
import { auditFiltersToQuery, parseAuditFilters } from "@/lib/audit/catalog";
import { AuditLogTable } from "@/components/audit-log/audit-log-table";
import { AuditLogFilters } from "@/components/audit-log/audit-log-filters";
import { StatCard } from "@/components/shared/stat-card";
import { PageShell } from "@/components/shared/page-shell";
import { PageHeader } from "@/components/shared/page-header";

const PAGE_SIZE = 25;

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminAuditLogPage({ searchParams }: PageProps) {
  const filters = parseAuditFilters(await searchParams);
  const query = { ...auditQueryFromFilters(filters), pageSize: PAGE_SIZE };

  const [{ entries, total }, roleCounts, overview, orgNames, actor] = await Promise.all([
    getAuditLogs(query),
    getAuditActorTypeCounts(query),
    getAuditOverview(),
    getAuditOrgNames(),
    filters.actor
      ? prisma.user.findUnique({ where: { id: filters.actor }, select: { firstName: true, lastName: true } })
      : null,
  ]);

  const queryString = auditFiltersToQuery({ ...filters, page: 1 });
  const filtered = Boolean(queryString);

  return (
    <PageShell>
      <PageHeader
        breadcrumb={[{ label: "Admin", href: "/admin" }, { label: "Audit Log" }]}
        title="Audit Log"
        description="Every sign-in, change and client action across all clinics. Click a row for full details."
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard size="compact" icon={Activity} label="Events · last 24h" value={overview.events.toLocaleString()} role="info" />
        <StatCard size="compact" icon={Users} label="Active users · last 24h" value={overview.activeUsers.toLocaleString()} role="brand" />
        <StatCard size="compact" icon={UserRound} label="Client events · last 24h" value={overview.clientEvents.toLocaleString()} role="success" />
        <StatCard
          size="compact"
          icon={ShieldAlert}
          label="Deletions & revocations · 24h"
          value={overview.sensitiveEvents.toLocaleString()}
          role={overview.sensitiveEvents > 0 ? "danger" : "neutral"}
        />
      </div>

      <AuditLogFilters
        filters={filters}
        roleCounts={roleCounts}
        orgNames={orgNames}
        actorName={actor ? `${actor.firstName} ${actor.lastName}` : undefined}
        exportHref="/api/audit-log/export"
        roles={["CLIENT", "TRAINER", "SUPER_ADMIN", "SYSTEM"]}
      />

      <AuditLogTable
        entries={entries}
        total={total}
        page={filters.page}
        pageSize={PAGE_SIZE}
        basePath="/admin/audit-log"
        queryString={queryString}
        orgNames={orgNames}
        filtered={filtered}
      />
    </PageShell>
  );
}
