"use client";

import Link from "next/link";
import { format } from "date-fns";
import type { AuditLog } from "@prisma/client";
import { ArrowRight, Check, Copy } from "lucide-react";
import { useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  AUDIT_ACTOR_TYPES,
  AUDIT_ACTOR_TONE,
  AUDIT_CATEGORIES,
  auditActionMeta,
  humanizeType,
  type AuditActorTypeKey,
} from "@/lib/audit/catalog";

interface AuditLogDetailSheetProps {
  entry: AuditLog | null;
  onOpenChange: (open: boolean) => void;
  orgName?: string;
  /** Link to the log filtered to this entry's actor. */
  actorHref?: string;
}

export function AuditLogDetailSheet({ entry, onOpenChange, orgName, actorHref }: AuditLogDetailSheetProps) {
  return (
    <Sheet open={entry !== null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-lg">
        {entry && <DetailBody entry={entry} orgName={orgName} actorHref={actorHref} onNavigate={() => onOpenChange(false)} />}
      </SheetContent>
    </Sheet>
  );
}

function DetailBody({
  entry,
  orgName,
  actorHref,
  onNavigate,
}: {
  entry: AuditLog;
  orgName?: string;
  actorHref?: string;
  onNavigate: () => void;
}) {
  const meta = auditActionMeta(entry.action);
  const actorType = entry.actorType as AuditActorTypeKey;
  const at = new Date(entry.createdAt);
  const { changes, details } = splitMetadata(entry.metadata);

  return (
    <>
      <SheetHeader className="border-b border-border/60 pb-4">
        <div className="flex items-center gap-2">
          <StatusBadge status={entry.action} label={meta.label} role={meta.tone} />
          <span className="text-xs text-muted-foreground">{AUDIT_CATEGORIES[meta.category]}</span>
        </div>
        <SheetTitle className="pt-1 text-base">
          {entry.actorName} · {meta.label.toLowerCase()}
          {entry.targetLabel ? ` “${entry.targetLabel}”` : ""}
        </SheetTitle>
        <SheetDescription>{format(at, "EEEE, MMMM d, yyyy 'at' h:mm:ss a")}</SheetDescription>
      </SheetHeader>

      <div className="flex flex-col gap-6 p-4">
        <Section title="Performed by">
          <Row label="Name" value={entry.actorName} />
          <Row
            label="Role"
            value={
              <StatusBadge
                status={actorType}
                label={AUDIT_ACTOR_TYPES[actorType] ?? entry.actorType}
                role={AUDIT_ACTOR_TONE[actorType] ?? "neutral"}
                size="sm"
              />
            }
          />
          {entry.actorId && <Row label="User ID" value={<CopyValue value={entry.actorId} />} />}
          <Row label="Organization" value={entry.orgId ? (orgName ?? <CopyValue value={entry.orgId} />) : "Platform-wide"} />
        </Section>

        {(entry.targetType || entry.targetLabel || entry.targetId) && (
          <Section title="Target">
            {entry.targetType && <Row label="Type" value={humanizeType(entry.targetType)} />}
            {entry.targetLabel && <Row label="Name" value={entry.targetLabel} />}
            {entry.targetId && <Row label="ID" value={<CopyValue value={entry.targetId} />} />}
          </Section>
        )}

        {changes.length > 0 && (
          <Section title={`Changes (${changes.length})`}>
            <div className="overflow-hidden rounded-lg ring-1 ring-border">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 text-left text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Field</th>
                    <th className="px-3 py-2 font-medium">Before</th>
                    <th className="px-3 py-2 font-medium">After</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {changes.map((c) => (
                    <tr key={c.field} className="align-top">
                      <td className="px-3 py-2 font-medium text-foreground">{humanizeField(c.field)}</td>
                      <td className="px-3 py-2 text-muted-foreground line-through decoration-muted-foreground/40">
                        {formatValue(c.before)}
                      </td>
                      <td className="px-3 py-2 text-foreground">{formatValue(c.after)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {details.length > 0 && (
          <Section title="Details">
            {details.map(([key, value]) => (
              <Row key={key} label={humanizeField(key)} value={formatValue(value)} />
            ))}
          </Section>
        )}

        {entry.metadata != null && (
          <details className="group rounded-lg ring-1 ring-border">
            <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground">
              Raw event data
            </summary>
            <pre className="max-h-72 overflow-auto border-t border-border/60 bg-muted/30 p-3 text-[11px] leading-relaxed text-foreground">
              {JSON.stringify(entry.metadata, null, 2)}
            </pre>
          </details>
        )}

        <Row label="Event ID" value={<CopyValue value={entry.id} />} />

        {actorHref && (
          <Button variant="outline" className="w-full" asChild>
            <Link href={actorHref} onClick={onNavigate} scroll={false}>
              View all activity by {entry.actorName}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        )}
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] items-start gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words text-foreground">{value}</span>
    </div>
  );
}

function CopyValue({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }).catch(() => {});
      }}
      className="group inline-flex max-w-full items-center gap-1.5 rounded font-mono text-xs text-muted-foreground hover:text-foreground"
      title="Copy"
    >
      <span className="truncate">{value}</span>
      {copied ? <Check className="h-3.5 w-3.5 shrink-0 text-success" /> : <Copy className="h-3.5 w-3.5 shrink-0 opacity-50 group-hover:opacity-100" />}
    </button>
  );
}

type Change = { field: string; before: unknown; after: unknown };

/**
 * Update events store `{ before: {...}, after: {...} }` (see diffFields); those
 * become a field-by-field change table. Everything else is shown as details.
 */
function splitMetadata(metadata: AuditLog["metadata"]): { changes: Change[]; details: [string, unknown][] } {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return { changes: [], details: [] };
  }
  const m = metadata as Record<string, unknown>;
  const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

  const changes: Change[] = [];
  if (isObj(m.before) && isObj(m.after)) {
    const fields = new Set([...Object.keys(m.before), ...Object.keys(m.after)]);
    for (const field of fields) changes.push({ field, before: m.before[field], after: m.after[field] });
  }
  const details = Object.entries(m).filter(
    ([k, v]) => !(changes.length > 0 && (k === "before" || k === "after")) && !isObj(v)
  );
  return { changes, details };
}

function humanizeField(key: string) {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/_/g, " ").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function formatValue(value: unknown): React.ReactNode {
  if (value === null || value === undefined || value === "") return <span className="italic text-muted-foreground">empty</span>;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length ? value.map(String).join(", ") : <span className="italic text-muted-foreground">none</span>;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return format(d, "PP");
  }
  if (typeof value === "object") return <code className="text-xs">{JSON.stringify(value)}</code>;
  return String(value);
}
