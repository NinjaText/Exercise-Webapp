import { requireRole } from "@/lib/current-user";
import { getAuditLogs, AUDIT_ACTIONS } from "@/lib/services/audit-log.service";
import { AuditLogTable } from "@/components/audit-log/audit-log-table";
import { PageHeader } from "@/components/shared/page-header";
import { PageShell } from "@/components/shared/page-shell";
import { PageToolbar } from "@/components/shared/page-toolbar";
import { EmptyState } from "@/components/shared/empty-state";
import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface PageProps {
  searchParams: Promise<{ action?: string; page?: string }>;
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

  const params = await searchParams;
  const action = params.action && params.action !== "ALL" ? params.action : undefined;
  const page = parseInt(params.page ?? "1", 10);

  const { entries, total, totalPages } = await getAuditLogs({
    orgId: trainer.clerkOrgId ?? undefined,
    action,
    page,
    pageSize: 25,
  });

  const queryString = action ? `action=${action}` : "";

  return (
    <PageShell>
      <PageHeader title="Audit Log" description="Activity across your clinic." />

      <PageToolbar>
        <form method="GET" className="flex flex-wrap items-center gap-2">
          <Select name="action" defaultValue={action ?? "ALL"}>
            <SelectTrigger className="h-9 w-56">
              <SelectValue placeholder="All actions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All actions</SelectItem>
              {Object.values(AUDIT_ACTIONS).map((a) => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="submit" variant="outline" className="h-9">
            Filter
          </Button>
        </form>
      </PageToolbar>

      <AuditLogTable
        entries={entries}
        total={total}
        page={page}
        totalPages={totalPages}
        basePath="/settings/audit-log"
        queryString={queryString}
      />
    </PageShell>
  );
}
