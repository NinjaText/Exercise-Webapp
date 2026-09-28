import { requireRole } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import {
  auditQueryFromFilters,
  getAuditActorTypeCounts,
  getAuditLogs,
} from "@/lib/services/audit-log.service";
import { auditFiltersToQuery, parseAuditFilters } from "@/lib/audit/catalog";
import { AuditLogTable } from "@/components/audit-log/audit-log-table";
import { AuditLogFilters } from "@/components/audit-log/audit-log-filters";
import { PageHeader } from "@/components/shared/page-header";
import { PageShell } from "@/components/shared/page-shell";
import { EmptyState } from "@/components/shared/empty-state";
import { Building2 } from "lucide-react";

const PAGE_SIZE = 25;

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function TrainerAuditLogPage({ searchParams }: PageProps) {
  const trainer = await requireRole("TRAINER");

  if (!trainer.clerkOrgId) {
    return (
      <PageShell>
        <PageHeader title="Audit Log" description="Activity across your clinic." />
        <EmptyState
          icon={Building2}
          title="No organization set up"
          description="Set up your organization to see activity here."
        />
      </PageShell>
    );
  }

  const filters = parseAuditFilters(await searchParams);
  // Pinned to the trainer's own clinic — any `org` in the URL is ignored.
  const query = { ...auditQueryFromFilters(filters, trainer.clerkOrgId), pageSize: PAGE_SIZE };

  const [{ entries, total }, roleCounts, actor] = await Promise.all([
    getAuditLogs(query),
    getAuditActorTypeCounts(query),
    filters.actor
      ? prisma.user.findFirst({
          where: { id: filters.actor, clerkOrgId: trainer.clerkOrgId },
          select: { firstName: true, lastName: true },
        })
      : null,
  ]);

  const queryString = auditFiltersToQuery({ ...filters, org: undefined, page: 1 });

  return (
    <PageShell>
      <PageHeader
        title="Audit Log"
        description="Activity across your clinic — your team and your clients. Click a row for full details."
      />

      <AuditLogFilters
        filters={{ ...filters, org: undefined }}
        roleCounts={roleCounts}
        actorName={actor ? `${actor.firstName} ${actor.lastName}` : undefined}
        exportHref="/api/audit-log/export"
        roles={["CLIENT", "TRAINER", "SUPER_ADMIN"]}
      />

      <AuditLogTable
        entries={entries}
        total={total}
        page={filters.page}
        pageSize={PAGE_SIZE}
        basePath="/settings/audit-log"
        queryString={queryString}
        filtered={Boolean(queryString)}
      />
    </PageShell>
  );
}
