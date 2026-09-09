"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { endOfDay, isSameDay, startOfDay, startOfWeek } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CalendarDays, ChevronRight } from "lucide-react";
import {
  WeekWorkoutClientRow,
  type DayDotStatus,
  type WeekDayDot,
  type WeekWorkoutClientRowData,
} from "@/components/dashboard/week-workout-client-row";
import type { ClientMetrics } from "@/lib/services/dashboard-insights.service";
import { getDisplayName } from "@/lib/utils/display-name";

interface WeekSession {
  id: string;
  scheduledDate: Date;
  status: string;
  client?: { id: string; firstName: string; lastName: string; email: string } | null;
  workout?: {
    program?: { id: string; name: string } | null;
  } | null;
}

export type StatusFilter = "all" | "due" | "completed" | "missed";
export type DateScope = "week" | "today";

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "due", label: "Due" },
  { value: "completed", label: "Completed" },
  { value: "missed", label: "Missed" },
];

/** The dashboard fetches a Monday-start week, so the dot strip must match. */
const WEEK_STARTS_ON = 1;
const DAYS_IN_WEEK = 7;
const DEFAULT_VISIBLE_ROWS = 3;

function matchesStatusFilter(status: string, filter: StatusFilter): boolean {
  switch (filter) {
    case "due":
      return status === "SCHEDULED" || status === "IN_PROGRESS";
    case "completed":
      return status === "COMPLETED";
    case "missed":
      return status === "MISSED" || status === "ABANDONED";
    default:
      return true;
  }
}

function toDayDotStatus(sessions: WeekSession[]): DayDotStatus {
  if (sessions.length === 0) return "none";
  if (sessions.some((s) => s.status === "COMPLETED")) return "completed";
  if (sessions.some((s) => s.status === "MISSED" || s.status === "ABANDONED")) return "missed";
  return "scheduled";
}

function buildWeekDays(sessions: WeekSession[], now: Date): WeekDayDot[] {
  const weekStart = startOfWeek(now, { weekStartsOn: WEEK_STARTS_ON });
  return Array.from({ length: DAYS_IN_WEEK }, (_, offset) => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + offset);
    const onDay = sessions.filter((s) => isSameDay(new Date(s.scheduledDate), date));
    return { date, status: toDayDotStatus(onDay) };
  });
}

interface WeekWorkoutsCardProps {
  sessions: WeekSession[];
  clientMetrics: Record<string, ClientMetrics>;
  /** Controlled status filter. Falls back to internal state when omitted, so the card still works standalone. */
  statusFilter?: StatusFilter;
  onStatusFilterChange?: (filter: StatusFilter) => void;
  /** Controlled client filter, same fallback behaviour as `statusFilter`. */
  clientFilter?: string;
  onClientFilterChange?: (clientId: string) => void;
  /** `"today"` narrows the rendered sessions to today only; the week dot strip always shows the full week. */
  dateScope?: DateScope;
}

export function WeekWorkoutsCard({
  sessions,
  clientMetrics,
  statusFilter: controlledStatusFilter,
  onStatusFilterChange,
  clientFilter: controlledClientFilter,
  onClientFilterChange,
  dateScope = "week",
}: WeekWorkoutsCardProps) {
  const [internalStatusFilter, setInternalStatusFilter] = useState<StatusFilter>("all");
  const [internalClientFilter, setInternalClientFilter] = useState<string>("all");
  const [expanded, setExpanded] = useState(false);

  const statusFilter = controlledStatusFilter ?? internalStatusFilter;
  const clientFilter = controlledClientFilter ?? internalClientFilter;

  function setStatusFilter(next: StatusFilter) {
    if (onStatusFilterChange) onStatusFilterChange(next);
    else setInternalStatusFilter(next);
  }

  function setClientFilter(next: string) {
    if (onClientFilterChange) onClientFilterChange(next);
    else setInternalClientFilter(next);
  }

  const clients = useMemo(() => {
    const map = new Map<string, string>();
    for (const session of sessions) {
      if (session.client) {
        map.set(session.client.id, getDisplayName(session.client));
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [sessions]);

  const rows = useMemo<WeekWorkoutClientRowData[]>(() => {
    const now = new Date();
    const todayStart = startOfDay(now).getTime();
    const todayEnd = endOfDay(now).getTime();

    // One row per client. The dot strip is built from *every* session that
    // client has this week (an unfiltered view of the week is the point of the
    // strip), while the filters decide which clients appear at all.
    const byClient = new Map<string, { client: NonNullable<WeekSession["client"]>; all: WeekSession[]; matching: WeekSession[] }>();

    for (const session of sessions) {
      if (!session.client) continue;
      if (clientFilter !== "all" && session.client.id !== clientFilter) continue;

      const entry = byClient.get(session.client.id) ?? {
        client: session.client,
        all: [],
        matching: [],
      };
      entry.all.push(session);

      const scheduledAt = new Date(session.scheduledDate).getTime();
      const inScope =
        dateScope === "week" || (scheduledAt >= todayStart && scheduledAt <= todayEnd);
      if (inScope && matchesStatusFilter(session.status, statusFilter)) {
        entry.matching.push(session);
      }
      byClient.set(session.client.id, entry);
    }

    return Array.from(byClient.values())
      .filter((entry) => entry.matching.length > 0)
      .map((entry) => {
        const chronological = [...entry.all].sort(
          (a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime()
        );
        const upcoming = chronological.find(
          (s) =>
            new Date(s.scheduledDate).getTime() >= todayStart &&
            (s.status === "SCHEDULED" || s.status === "IN_PROGRESS")
        );
        const mostRecent = chronological[chronological.length - 1];

        return {
          client: entry.client,
          programName: entry.matching[0]?.workout?.program?.name ?? "Workout",
          days: buildWeekDays(entry.all, now),
          nextSessionDate: upcoming ? new Date(upcoming.scheduledDate) : null,
          displayStatus: upcoming?.status ?? mostRecent?.status ?? null,
          metrics: clientMetrics[entry.client.id],
        };
      })
      .sort((a, b) => {
        // Clients with something still coming up sort first, then by name.
        const aNext = a.nextSessionDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const bNext = b.nextSessionDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
        if (aNext !== bNext) return aNext - bNext;
        return a.client.firstName.localeCompare(b.client.firstName);
      });
  }, [sessions, clientMetrics, statusFilter, clientFilter, dateScope]);

  const visibleRows = expanded ? rows : rows.slice(0, DEFAULT_VISIBLE_ROWS);
  const hiddenCount = rows.length - visibleRows.length;

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-col gap-2 pb-2">
        <div className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4.5 w-4.5 text-primary" />
            <CardTitle className="text-base font-semibold">
              {dateScope === "today" ? "Today's Workouts" : "This Week's Workouts"}
            </CardTitle>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground"
            asChild
          >
            <Link href="/programs">
              View all <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <TabsList className="gap-0.5 rounded-full border border-border bg-muted/60 p-0.5">
              {STATUS_FILTERS.map((filter) => (
                <TabsTrigger
                  key={filter.value}
                  value={filter.value}
                  className="rounded-full px-2.5 text-xs data-active:bg-primary data-active:text-primary-foreground data-active:shadow-none"
                >
                  {filter.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          {clients.length > 0 && (
            <Select value={clientFilter} onValueChange={(v) => setClientFilter(v ?? "all")}>
              <SelectTrigger className="h-8 w-44" size="sm">
                <SelectValue placeholder="All Clients">
                  {(value: string | null) =>
                    !value || value === "all"
                      ? "All Clients"
                      : clients.find((c) => c.id === value)?.name ?? "All Clients"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Clients</SelectItem>
                {clients.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <CalendarDays className="h-9 w-9 text-muted-foreground/30" />
            <p className="mt-2.5 text-sm font-medium text-muted-foreground">
              {sessions.length === 0 ? "No workouts this week" : "No workouts match these filters"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground/60">
              {sessions.length === 0
                ? "Assign programs to your clients to get started"
                : "Try a different status, client, or date filter"}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {visibleRows.map((row) => (
              <WeekWorkoutClientRow key={row.client.id} row={row} />
            ))}
            {(hiddenCount > 0 || expanded) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-full text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setExpanded((prev) => !prev)}
              >
                {expanded
                  ? "Show fewer clients"
                  : `Show ${hiddenCount} more client${hiddenCount === 1 ? "" : "s"}`}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
