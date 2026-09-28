"use client";

import { useState } from "react";
import { format, formatDistanceToNowStrict } from "date-fns";
import type { AuditLog } from "@prisma/client";
import { ChevronRight, History } from "lucide-react";
import { DataList, type Column } from "@/components/shared/data-list";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { PaginationBar } from "@/components/shared/pagination-bar";
import { AuditLogDetailSheet } from "@/components/audit-log/audit-log-detail-sheet";
import {
  AUDIT_ACTOR_TYPES, AUDIT_ACTOR_TONE, auditActionMeta, humanizeType, type AuditActorTypeKey,
} from "@/lib/audit/catalog";
import { ROLE_CLASSES } from "@/lib/ui/status";
import { cn } from "@/lib/utils";

interface AuditLogTableProps {
  entries: AuditLog[];
  total: number;
  page: number;
  pageSize: number;
  basePath: string;
  /** Current filters, without page — e.g. "role=CLIENT&q=jane". */
  queryString: string;
  /** clerkOrgId → name. When given, an Organization column is shown. */
  orgNames?: Record<string, string>;
  /** True when any filter is active — changes the empty-state copy. */
  filtered?: boolean;
}

export function AuditLogTable({
  entries,
  total,
  page,
  pageSize,
  basePath,
  queryString,
  orgNames,
  filtered,
}: AuditLogTableProps) {
  const [selected, setSelected] = useState<AuditLog | null>(null);

  const withParams = (extra: Record<string, string>) => {
    const params = new URLSearchParams(queryString);
    for (const [k, v] of Object.entries(extra)) params.set(k, v);
    params.delete("page");
    if (extra.page && extra.page !== "1") params.set("page", extra.page);
    const q = params.toString();
    return q ? `${basePath}?${q}` : basePath;
  };

  const columns: Column<AuditLog>[] = [
    {
      key: "when",
      header: "When",
      className: "w-[130px] whitespace-nowrap",
      render: (entry) => {
        const at = new Date(entry.createdAt);
        return (
          <div className="leading-tight" title={format(at, "PPpp")}>
            <p className="text-sm text-foreground" suppressHydrationWarning>
              {formatDistanceToNowStrict(at, { addSuffix: true })}
            </p>
            <p className="text-xs text-muted-foreground">{format(at, "MMM d, h:mm a")}</p>
          </div>
        );
      },
    },
    {
      key: "actor",
      header: "User",
      render: (entry) => <ActorCell entry={entry} />,
    },
    {
      key: "action",
      header: "Action",
      render: (entry) => {
        const meta = auditActionMeta(entry.action);
        return <StatusBadge status={entry.action} label={meta.label} role={meta.tone} />;
      },
    },
    {
      key: "target",
      header: "Target",
      className: "hidden md:table-cell max-w-[260px]",
      render: (entry) => {
        // Clinic-level events (branding, settings) target the org itself.
        const label =
          entry.targetLabel ??
          (entry.targetType === "Organization" && entry.orgId ? orgNames?.[entry.orgId] : undefined);
        return label || entry.targetType ? (
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm text-foreground">{label ?? "—"}</p>
            {entry.targetType && (
              <p className="truncate text-xs text-muted-foreground">{humanizeType(entry.targetType)}</p>
            )}
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        );
      },
    },
    ...(orgNames
      ? [
          {
            key: "org",
            header: "Organization",
            className: "hidden lg:table-cell max-w-[200px]",
            render: (entry: AuditLog) => (
              <span className="block truncate text-sm text-muted-foreground">
                {entry.orgId ? (orgNames[entry.orgId] ?? "Unknown clinic") : "Platform"}
              </span>
            ),
          },
        ]
      : []),
    {
      key: "open",
      header: "",
      className: "w-8",
      render: () => <ChevronRight className="h-4 w-4 text-muted-foreground/50" aria-hidden />,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <DataList
        columns={columns}
        data={entries}
        keyExtractor={(entry) => entry.id}
        onRowClick={setSelected}
        density="compact"
        emptyState={
          <EmptyState
            size="compact"
            icon={History}
            title={filtered ? "No matching activity" : "No activity yet"}
            description={
              filtered
                ? "Try widening the date range or clearing some filters."
                : "Actions taken across the platform will appear here."
            }
          />
        }
      />

      <PaginationBar
        page={page}
        pageSize={pageSize}
        total={total}
        buildHref={(p) => withParams({ page: String(p) })}
        itemLabel="events"
      />

      <AuditLogDetailSheet
        entry={selected}
        onOpenChange={(open) => !open && setSelected(null)}
        orgName={selected?.orgId ? orgNames?.[selected.orgId] : undefined}
        actorHref={selected?.actorId ? withParams({ actor: selected.actorId }) : undefined}
      />
    </div>
  );
}

function ActorCell({ entry }: { entry: AuditLog }) {
  const type = entry.actorType as AuditActorTypeKey;
  const tone = ROLE_CLASSES[AUDIT_ACTOR_TONE[type] ?? "neutral"];
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span
        aria-hidden
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
          tone.soft,
          tone.text
        )}
      >
        {initials(entry.actorName)}
      </span>
      <div className="min-w-0 leading-tight">
        <p className="truncate text-sm font-medium text-foreground">{entry.actorName}</p>
        <p className="text-xs text-muted-foreground">{AUDIT_ACTOR_TYPES[type] ?? entry.actorType}</p>
      </div>
    </div>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}
