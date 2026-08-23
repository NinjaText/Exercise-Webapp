import { format } from "date-fns";
import type { AuditLog } from "@prisma/client";

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

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">When</th>
              <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Actor</th>
              <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Action</th>
              <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Target</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {entries.map((entry) => (
              <tr key={entry.id} className="hover:bg-muted/40 transition-colors">
                <td className="px-5 py-3 text-xs text-muted-foreground whitespace-nowrap">
                  {format(new Date(entry.createdAt), "MMM d, yyyy h:mm a")}
                </td>
                <td className="px-5 py-3">
                  <p className="font-medium text-foreground">{entry.actorName}</p>
                  <p className="text-xs text-muted-foreground">{entry.actorType}</p>
                </td>
                <td className="px-5 py-3 text-foreground">{ACTION_LABELS[entry.action] ?? entry.action}</td>
                <td className="px-5 py-3 text-xs text-muted-foreground">
                  {entry.targetLabel ?? entry.targetId ?? <span className="italic">—</span>}
                </td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-12 text-center text-sm text-muted-foreground">
                  No audit log entries found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border px-5 py-3">
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
