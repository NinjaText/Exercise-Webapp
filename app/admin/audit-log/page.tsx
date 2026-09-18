import { getAuditLogs } from "@/lib/services/audit-log.service";
import { getTrainersForOrgFilter } from "@/lib/services/admin.service";
import { AUDIT_ACTIONS } from "@/lib/services/audit-log.service";
import { AuditLogTable } from "@/components/audit-log/audit-log-table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/shared/page-shell";
import { PageHeader } from "@/components/shared/page-header";
import { PageToolbar } from "@/components/shared/page-toolbar";

interface PageProps {
  searchParams: Promise<{ action?: string; org?: string; page?: string }>;
}

export default async function AdminAuditLogPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const action = params.action && params.action !== "ALL" ? params.action : undefined;
  const orgId = params.org && params.org !== "ALL" ? params.org : undefined;
  const page = parseInt(params.page ?? "1", 10);

  const [{ entries, total, totalPages }, trainersForFilter] = await Promise.all([
    getAuditLogs({ action, orgId, page, pageSize: 25 }),
    getTrainersForOrgFilter(),
  ]);

  const queryString = [
    action ? `action=${action}` : "",
    orgId ? `org=${orgId}` : "",
  ].filter(Boolean).join("&");

  return (
    <PageShell>
      <PageHeader
        breadcrumb={[{ label: "Admin", href: "/admin" }, { label: "Audit Log" }]}
        title="Audit Log"
        description="Platform-wide activity across all clinics."
      />

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
          <Select name="org" defaultValue={orgId ?? "ALL"}>
            <SelectTrigger className="h-9 w-56">
              <SelectValue placeholder="All organizations">
                {(value: string | null) => {
                  if (!value || value === "ALL") return "All organizations";
                  const trainer = trainersForFilter.find((t) => t.clerkOrgId === value);
                  return trainer ? `${trainer.firstName} ${trainer.lastName}` : "All organizations";
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All organizations</SelectItem>
              {trainersForFilter.map((t) => (
                <SelectItem key={t.clerkOrgId!} value={t.clerkOrgId!}>{t.firstName} {t.lastName}</SelectItem>
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
        basePath="/admin/audit-log"
        queryString={queryString}
      />
    </PageShell>
  );
}
