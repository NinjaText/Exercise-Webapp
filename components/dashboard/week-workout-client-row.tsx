"use client";

import Link from "next/link";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Flame } from "lucide-react";
import { formatDaysAgoLong, formatSessionStatus } from "@/lib/utils/formatting";
import { getDisplayName, getInitials } from "@/lib/utils/display-name";
import type { ClientMetrics } from "@/lib/services/dashboard-insights.service";

export const sessionStatusColors: Record<string, string> = {
  SCHEDULED: "bg-blue-100 text-blue-700",
  IN_PROGRESS: "bg-amber-100 text-amber-700",
  COMPLETED: "bg-success/15 text-success",
  MISSED: "bg-red-100 text-red-700",
};

/** One Mon–Sun cell of the week strip. */
export type DayDotStatus = "completed" | "missed" | "scheduled" | "none";

const dayDotStyles: Record<DayDotStatus, string> = {
  completed: "bg-success border-success",
  missed: "bg-red-500/20 border-red-500",
  scheduled: "bg-transparent border-muted-foreground/50",
  none: "bg-muted border-transparent",
};

const dayDotLabels: Record<DayDotStatus, string> = {
  completed: "Completed",
  missed: "Missed",
  scheduled: "Scheduled",
  none: "No workout",
};

export interface WeekDayDot {
  date: Date;
  status: DayDotStatus;
}

export interface WeekWorkoutClientRowData {
  client: { id: string; firstName: string; lastName: string; email: string };
  /** The program shown as the row's subtitle — the first one seen for this client this week. */
  programName: string;
  days: WeekDayDot[];
  nextSessionDate: Date | null;
  /** Status of the next upcoming session, else of the most recent one. */
  displayStatus: string | null;
  metrics?: ClientMetrics;
}

export function WeekWorkoutClientRow({ row }: { row: WeekWorkoutClientRowData }) {
  const { client, programName, days, nextSessionDate, displayStatus, metrics } = row;
  const initials = getInitials(client);
  const displayName = getDisplayName(client);

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/20 p-2.5 transition-colors hover:bg-muted/40">
      <Link
        href={`/clients/${client.id}`}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
          {initials}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold hover:underline">
            {displayName}
          </span>
          <span className="block truncate text-xs text-muted-foreground">{programName}</span>
          <span className="block truncate text-[11px] text-muted-foreground/70">
            {metrics?.lastCompletedAt
              ? `Active ${formatDaysAgoLong(metrics.lastCompletedAt)}`
              : "No completed workouts yet"}
          </span>
        </span>
      </Link>

      <div className="hidden shrink-0 items-center gap-1 sm:flex" aria-label="This week's workouts">
        {days.map((day) => (
          <span
            key={day.date.toISOString()}
            title={`${format(day.date, "EEE d MMM")} — ${dayDotLabels[day.status]}`}
            className={`h-2.5 w-2.5 rounded-full border ${dayDotStyles[day.status]}`}
          />
        ))}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        <div className="flex items-center gap-2">
          {nextSessionDate && (
            <span className="text-xs text-muted-foreground">
              Next: {format(nextSessionDate, "EEE, MMM d")}
            </span>
          )}
          {displayStatus && (
            <Badge
              className={`border-0 text-xs font-medium ${
                sessionStatusColors[displayStatus] ?? "bg-muted text-muted-foreground"
              }`}
            >
              {formatSessionStatus(displayStatus)}
            </Badge>
          )}
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
}
