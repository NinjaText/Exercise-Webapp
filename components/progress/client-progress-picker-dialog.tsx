"use client";

import { useMemo, useState } from "react";
import { ChevronRight, Search, SearchX, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { ROLE_CLASSES, statusRole } from "@/lib/ui/status";
import type {
  ClientProgressEntry,
  ClientProgressStatus,
} from "@/lib/services/dashboard-insights.service";

export type ProgressFilter = "all" | ClientProgressStatus;

export const PROGRESS_STATUS_LABEL: Record<ClientProgressStatus, string> = {
  onTrack: "On Track",
  atRisk: "At Risk",
  offTrack: "Off Track",
};

const FILTERS: { value: ProgressFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "offTrack", label: PROGRESS_STATUS_LABEL.offTrack },
  { value: "atRisk", label: PROGRESS_STATUS_LABEL.atRisk },
  { value: "onTrack", label: PROGRESS_STATUS_LABEL.onTrack },
];

/** Display names fall back to email for clients with no name on file — those get one letter. */
function initialsFromName(name: string): string {
  if (name.includes("@")) return (name[0] ?? "?").toUpperCase();
  const parts = name.split(/\s+/).filter(Boolean);
  const initials = parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : (parts[0]?.[0] ?? "?");
  return initials.toUpperCase();
}

/**
 * Lists every client with their progress status so the trainer can pick one
 * and open their Client Progress Overview report.
 */
export function ClientProgressPickerDialog({
  open,
  onOpenChange,
  clients,
  filter,
  onFilterChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: ClientProgressEntry[];
  filter: ProgressFilter;
  onFilterChange: (filter: ProgressFilter) => void;
  onSelect: (client: ClientProgressEntry) => void;
}) {
  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    const c: Record<ProgressFilter, number> = { all: clients.length, onTrack: 0, atRisk: 0, offTrack: 0 };
    for (const client of clients) c[client.status] += 1;
    return c;
  }, [clients]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return clients.filter(
      (c) => (filter === "all" || c.status === filter) && (!q || c.clientName.toLowerCase().includes(q))
    );
  }, [clients, filter, query]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-xl">
        <DialogHeader className="gap-1 px-5 pt-5 pb-4">
          <DialogTitle className="text-lg font-semibold">Client Progress Reports</DialogTitle>
          <DialogDescription>Choose a client to open their progress report.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 border-b px-5 pb-4">
          <InputGroup className="h-9">
            <InputGroupAddon align="inline-start">
              <Search aria-hidden />
            </InputGroupAddon>
            <InputGroupInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search clients"
              aria-label="Search clients"
            />
          </InputGroup>

          <div role="radiogroup" aria-label="Filter by status" className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => {
              const active = filter === f.value;
              const dot = f.value === "all" ? null : ROLE_CLASSES[statusRole(f.value)].dot;
              return (
                <button
                  key={f.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onFilterChange(f.value)}
                  className={cn(
                    "inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  {dot && <span aria-hidden className={cn("size-1.5 rounded-full", dot)} />}
                  {f.label}
                  <span className={cn("tabular-nums", active ? "text-primary-foreground/80" : "text-muted-foreground/70")}>
                    {counts[f.value]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {clients.length === 0 ? (
            <EmptyState size="compact" icon={Users} title="No active clients yet" className="py-10" />
          ) : visible.length === 0 ? (
            <EmptyState
              size="compact"
              icon={SearchX}
              title="No matching clients"
              description={query ? "Try a different name or clear the search." : "No clients in this status."}
              className="py-10"
            />
          ) : (
            <ul className="divide-y divide-border/60 py-1">
              {visible.map((client) => (
                <li key={client.clientId}>
                  <button
                    type="button"
                    onClick={() => onSelect(client)}
                    className="group flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
                  >
                    <Avatar className="size-9 shrink-0">
                      <AvatarImage src={client.imageUrl ?? undefined} alt="" />
                      <AvatarFallback className="bg-muted text-xs font-medium text-muted-foreground">
                        {initialsFromName(client.clientName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{client.clientName}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {client.reason ?? "No issues flagged recently"}
                      </p>
                    </div>
                    <StatusBadge
                      status={client.status}
                      label={PROGRESS_STATUS_LABEL[client.status]}
                      size="sm"
                      className="hidden sm:inline-flex"
                    />
                    <span
                      className={cn("size-2 shrink-0 rounded-full sm:hidden", ROLE_CLASSES[statusRole(client.status)].dot)}
                    >
                      <span className="sr-only">{PROGRESS_STATUS_LABEL[client.status]}</span>
                    </span>
                    <ChevronRight
                      aria-hidden
                      className="size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
