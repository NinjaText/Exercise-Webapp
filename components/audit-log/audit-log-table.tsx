import { format } from "date-fns";
import type { AuditLog } from "@prisma/client";
import { History } from "lucide-react";
import { DataList, type Column } from "@/components/shared/data-list";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import type { StatusRole } from "@/lib/ui/status";

const ACTION_LABELS: Record<string, string> = {
  LOGIN: "Logged in",
  LOGOUT: "Logged out",
  USER_INVITED: "Invited user",
  USER_INVITE_REVOKED: "Revoked invitation",
  USER_DEACTIVATED: "Deactivated user",
  USER_REACTIVATED: "Reactivated user",
  USER_DELETED: "Deleted user",
  CLINICAL_NOTE_CREATED: "Created clinical note",
  CLINICAL_NOTE_UPDATED: "Updated clinical note",
  CLINICAL_NOTE_DELETED: "Deleted clinical note",
  PROGRAM_CREATED: "Created program",
  PROGRAM_UPDATED: "Updated program",
  PROGRAM_DELETED: "Deleted program",
  GLOBAL_PROGRAM_CREATED: "Created global program",
  GLOBAL_PROGRAM_UPDATED: "Updated global program",
  GLOBAL_PROGRAM_DELETED: "Deleted global program",
  EXERCISE_CREATED: "Created exercise(s)",
  EXERCISE_UPDATED: "Updated exercise",
  EXERCISE_DELETED: "Deleted exercise",
  CLINIC_SETTINGS_UPDATED: "Updated clinic settings",
};

/**
 * Maps an audit log action verb to a semantic status role, used for the
 * Action column's StatusBadge. Phase 6 (super-admin audit log) may reuse
 * this for the same mapping.
 */
export function auditActionRole(action: string): StatusRole {
  const normalized = action.toLowerCase();
  if (/(created|assigned|invited|reactivated)/.test(normalized)) return "success";
  if (/(updated|changed)/.test(normalized)) return "info";
  if (/(deleted|archived|removed|revoked|deactivated)/.test(normalized)) return "danger";
  return "neutral";
}

interface AuditLogTableProps {
  entries: AuditLog[];
  total: number;
  page: number;
  totalPages: number;
  basePath: string;
  queryString: string; // current filters, without page — e.g. "action=LOGIN&search=jane"
}

export function AuditLogTable({ entries, total, page, totalPages, basePath, queryString }: AuditLogTableProps) {
  const withPage = (p: number) => `${basePath}?${queryString ? queryString + "&" : ""}page=${p}`;

  const columns: Column<AuditLog>[] = [
    {
      key: "when",
      header: "When",
      className: "whitespace-nowrap",
      render: (entry) => (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {format(new Date(entry.createdAt), "MMM d, yyyy h:mm a")}
        </span>
      ),
    },
    {
      key: "actor",
      header: "Actor",
      render: (entry) => (
        <div>
          <p className="font-medium text-foreground">{entry.actorName}</p>
          <p className="text-xs text-muted-foreground">{entry.actorType}</p>
        </div>
      ),
    },
    {
      key: "action",
      header: "Action",
      render: (entry) => (
        <StatusBadge
          status={entry.action}
          label={ACTION_LABELS[entry.action] ?? entry.action}
          role={auditActionRole(entry.action)}
        />
      ),
    },
    {
      key: "target",
      header: "Target",
      className: "hidden sm:table-cell",
      render: (entry) => (
        <span className="text-xs text-muted-foreground">
          {entry.targetLabel ?? entry.targetId ?? <span className="italic">—</span>}
        </span>
      ),
    },
    {
      key: "details",
      header: "Details",
      className: "max-w-[280px]",
      render: (entry) => {
        const json = entry.metadata ? JSON.stringify(entry.metadata) : "—";
        return (
          <span className="block truncate text-xs text-muted-foreground" title={json}>
            {json}
          </span>
        );
      },
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <DataList
        columns={columns}
        data={entries}
        keyExtractor={(entry) => entry.id}
        density="compact"
        stickyHeader
        maxHeight="70vh"
        emptyState={<EmptyState size="compact" icon={History} title="No activity yet" />}
      />

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1">
          <p className="text-xs text-muted-foreground">
            Page {page} of {totalPages} · {total.toLocaleString()} entries
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <a href={withPage(page - 1)} className="rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/80 transition-colors">
                ← Prev
              </a>
            )}
            {page < totalPages && (
              <a href={withPage(page + 1)} className="rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/80 transition-colors">
                Next →
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
