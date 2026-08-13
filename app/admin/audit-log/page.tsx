import { getAuditLogs } from "@/lib/services/audit-log.service";
import { getTrainersForOrgFilter } from "@/lib/services/admin.service";
import { AUDIT_ACTIONS } from "@/lib/services/audit-log.service";
import { AuditLogTable } from "@/components/audit-log/audit-log-table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Audit Log</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Platform-wide activity across all clinics.</p>
      </div>

      <form method="GET" className="flex flex-col gap-3 sm:flex-row sm:items-center flex-wrap">
        <Select name="action" defaultValue={action ?? "ALL"}>
          <SelectTrigger className="w-56">
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
          <SelectTrigger className="w-56">
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
        <button type="submit" className="rounded-xl bg-primary/10 px-4 py-2 text-sm font-medium text-primary ring-1 ring-primary/20 hover:bg-primary/15 transition-colors">
          Filter
        </button>
      </form>

      <AuditLogTable
        entries={entries}
        total={total}
        page={page}
        totalPages={totalPages}
        basePath="/admin/audit-log"
        queryString={queryString}
      />
    </div>
  );
}
