"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import { CalendarClock, ChevronDown, Pencil, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { toLocalCalendarDate } from "@/lib/utils/calendar-date";
import { REFLECTION_KIND_LABELS, type ReflectionKind } from "@/lib/reflections/constants";
import { deleteReflectionsAction, updateReflectionsAction } from "@/actions/reflection-actions";
import { ReflectionEditDialog } from "./reflection-edit-dialog";
import { draftFromStored, toContentInput, type ReflectionDraft } from "./reflection-draft";

export interface ScheduledRowView {
  id: string;
  kind: string;
  text: string;
  author: string | null;
  guidance: string | null;
  theme: string | null;
  imageUrl: string | null;
  source: string;
  allowJournal: boolean;
  allowShare: boolean;
  /** ISO string of the UTC-anchored day. */
  date: string;
  clientId: string;
  clientName: string;
}

interface ScheduledGroup {
  key: string;
  sample: ScheduledRowView;
  rows: ScheduledRowView[];
}

/**
 * One save fans out to many rows (clients × days) with identical content, so
 * the list groups rows by content: the trainer edits or deletes the whole
 * batch at once, or expands it to remove single days.
 */
function groupRows(rows: ScheduledRowView[]): ScheduledGroup[] {
  const groups = new Map<string, ScheduledGroup>();
  for (const row of rows) {
    const key = JSON.stringify([row.kind, row.text, row.author, row.guidance, row.imageUrl, row.allowJournal, row.allowShare]);
    const group = groups.get(key);
    if (group) group.rows.push(row);
    else groups.set(key, { key, sample: row, rows: [row] });
  }
  return [...groups.values()];
}

function dayLabel(iso: string, pattern = "MMM d"): string {
  return format(toLocalCalendarDate(iso), pattern);
}

export function ScheduledReflectionsPanel({ rows }: { rows: ScheduledRowView[] }) {
  const router = useRouter();
  const groups = useMemo(() => groupRows(rows), [rows]);
  const [editing, setEditing] = useState<ScheduledGroup | null>(null);
  const [deleting, setDeleting] = useState<{ ids: string[]; label: string } | null>(null);

  async function saveGroup(group: ScheduledGroup, draft: ReflectionDraft): Promise<boolean> {
    const result = await updateReflectionsAction({ ids: group.rows.map((r) => r.id), content: toContentInput(draft) });
    if (!result.success) {
      toast.error(result.error);
      return false;
    }
    toast.success(`Updated ${result.data.count} scheduled reflection${result.data.count === 1 ? "" : "s"}`);
    router.refresh();
    return true;
  }

  async function remove(ids: string[]) {
    const result = await deleteReflectionsAction({ ids });
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(`Deleted ${result.data.count} reflection${result.data.count === 1 ? "" : "s"}`);
    router.refresh();
  }

  if (groups.length === 0) {
    return (
      <EmptyState
        icon={CalendarClock}
        title="Nothing scheduled"
        description="Reflections you schedule for clients on specific dates show up here."
      />
    );
  }

  return (
    <>
      <ul className="flex flex-col gap-3" aria-label="Scheduled reflections">
        {groups.map((group) => (
          <ScheduledGroupCard
            key={group.key}
            group={group}
            onEdit={() => setEditing(group)}
            onDeleteGroup={() =>
              setDeleting({ ids: group.rows.map((r) => r.id), label: `all ${group.rows.length} scheduled reflections in this batch` })
            }
            onDeleteRow={(row) => setDeleting({ ids: [row.id], label: `${row.clientName}'s reflection on ${dayLabel(row.date)}` })}
          />
        ))}
      </ul>

      <ReflectionEditDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        title="Edit scheduled reflection"
        description={editing ? `Changes apply to all ${editing.rows.length} scheduled copies.` : undefined}
        initial={editing ? draftFromStored(editing.sample) : draftFromStored(rows[0])}
        onSave={(draft) => (editing ? saveGroup(editing, draft) : Promise.resolve(false))}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete scheduled reflection?"
        description={deleting ? `This removes ${deleting.label}.` : ""}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => {
          if (deleting) void remove(deleting.ids);
          setDeleting(null);
        }}
      />
    </>
  );
}

function ScheduledGroupCard({
  group,
  onEdit,
  onDeleteGroup,
  onDeleteRow,
}: {
  group: ScheduledGroup;
  onEdit: () => void;
  onDeleteGroup: () => void;
  onDeleteRow: (row: ScheduledRowView) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { sample, rows } = group;
  const clientCount = new Set(rows.map((r) => r.clientId)).size;
  const first = rows[0].date;
  const last = rows[rows.length - 1].date;
  const range = first === last ? dayLabel(first, "EEE, MMM d") : `${dayLabel(first)} – ${dayLabel(last)}`;

  return (
    <li className="rounded-xl bg-card shadow-xs ring-1 ring-border">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge
              status={sample.kind}
              label={REFLECTION_KIND_LABELS[sample.kind as ReflectionKind] ?? sample.kind}
              role="brand"
              size="sm"
              dot={false}
            />
            <span className="text-caption text-muted-foreground">{range}</span>
          </div>
          <p className="mt-1.5 text-body text-foreground">{sample.text}</p>
          {sample.author && <p className="text-caption text-muted-foreground">— {sample.author}</p>}
          <p className="mt-1.5 flex items-center gap-1.5 text-caption text-muted-foreground">
            <Users className="size-3.5" aria-hidden />
            {clientCount === 1 ? rows[0].clientName : `${clientCount} clients`} · {rows.length} day
            {rows.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button size="sm" variant="ghost" onClick={onEdit}>
            <Pencil className="size-4" />
            Edit
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label="Delete batch" onClick={onDeleteGroup}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
      {rows.length > 1 && (
        <div className="border-t border-border">
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-2 text-label text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            {expanded ? "Hide" : "Show"} individual days
            <ChevronDown className={expanded ? "size-4 rotate-180 transition-transform" : "size-4 transition-transform"} aria-hidden />
          </button>
          {expanded && (
            <ul className="max-h-72 divide-y divide-border overflow-y-auto border-t border-border">
              {rows.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-2 px-4 py-2">
                  <span className="min-w-0 truncate text-body text-foreground">
                    <span className="tabular-nums">{dayLabel(row.date, "EEE, MMM d")}</span>
                    <span className="text-muted-foreground"> · {row.clientName}</span>
                  </span>
                  <Button size="icon-xs" variant="ghost" aria-label="Delete this day" onClick={() => onDeleteRow(row)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}
