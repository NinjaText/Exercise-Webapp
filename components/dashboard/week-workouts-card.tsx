"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CalendarDays, ChevronRight, Flame } from "lucide-react";
import { formatRelativeTime, formatSessionStatus } from "@/lib/utils/formatting";
import type { ClientMetrics } from "@/lib/services/dashboard-insights.service";

interface WeekSession {
  id: string;
  scheduledDate: Date;
  status: string;
  client?: { id: string; firstName: string; lastName: string } | null;
  workout?: {
    program?: { id: string; name: string } | null;
  } | null;
}

const sessionStatusColors: Record<string, string> = {
  SCHEDULED: "bg-blue-100 text-blue-700",
  IN_PROGRESS: "bg-amber-100 text-amber-700",
  COMPLETED: "bg-success/15 text-success",
  MISSED: "bg-red-100 text-red-700",
};

type StatusFilter = "all" | "due" | "completed" | "missed";

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "due", label: "Due" },
  { value: "completed", label: "Completed" },
  { value: "missed", label: "Missed" },
];

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

export function WeekWorkoutsCard({
  sessions,
  clientMetrics,
}: {
  sessions: WeekSession[];
  clientMetrics: Record<string, ClientMetrics>;
}) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [clientFilter, setClientFilter] = useState<string>("all");

  const clients = useMemo(() => {
    const map = new Map<string, string>();
    for (const session of sessions) {
      if (session.client) {
        map.set(session.client.id, `${session.client.firstName} ${session.client.lastName}`);
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [sessions]);

  const filteredSessions = sessions.filter((session) => {
    if (!matchesStatusFilter(session.status, statusFilter)) return false;
    if (clientFilter !== "all" && session.client?.id !== clientFilter) return false;
    return true;
  });

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 pb-3">
        <div className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4.5 w-4.5 text-primary" />
            <CardTitle className="text-base font-semibold">This Week&apos;s Workouts</CardTitle>
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
            <TabsList className="gap-0.5 rounded-full border border-border bg-muted/60 p-1">
              {STATUS_FILTERS.map((filter) => (
                <TabsTrigger
                  key={filter.value}
                  value={filter.value}
                  className="rounded-full px-3 text-xs data-active:bg-primary data-active:text-primary-foreground data-active:shadow-none"
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
      <CardContent>
        {filteredSessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <CalendarDays className="h-10 w-10 text-muted-foreground/30" />
            <p className="mt-3 text-sm font-medium text-muted-foreground">
              {sessions.length === 0 ? "No workouts this week" : "No workouts match these filters"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground/60">
              {sessions.length === 0
                ? "Assign programs to your clients to get started"
                : "Try a different status or client filter"}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredSessions.slice(0, 8).map((session) => {
              const metrics = session.client ? clientMetrics[session.client.id] : undefined;
              const detailParts: string[] = [];
              if (metrics?.programWeek) {
                detailParts.push(`Week ${metrics.programWeek.current} of ${metrics.programWeek.total}`);
              }
              if (metrics?.lastCompletedAt) {
                detailParts.push(`Last ${formatRelativeTime(metrics.lastCompletedAt)}`);
              }
              return (
                <div
                  key={session.id}
                  className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/20 p-3 transition-colors hover:bg-muted/40"
                >
                  {session.client && (
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground font-medium text-xs">
                      {session.client.firstName[0]}
                      {session.client.lastName[0]}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    {session.client && (
                      <p className="truncate text-sm font-semibold">
                        {session.client.firstName} {session.client.lastName}
                      </p>
                    )}
                    <p className="truncate text-xs text-muted-foreground">
                      {session.workout?.program?.name || "Workout"}
                    </p>
                    {detailParts.length > 0 && (
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground/70">
                        {detailParts.join(" · ")}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(session.scheduledDate), "EEE, MMM d")}
                      </span>
                      <Badge
                        className={`text-xs font-medium border-0 ${sessionStatusColors[session.status] || "bg-muted text-muted-foreground"}`}
                      >
                        {formatSessionStatus(session.status)}
                      </Badge>
                    </div>
                    {metrics && metrics.streak > 1 && (
                      <span className="flex items-center gap-0.5 text-[11px] font-medium text-amber-600">
                        <Flame className="h-3 w-3" />
                        {metrics.streak} streak
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
