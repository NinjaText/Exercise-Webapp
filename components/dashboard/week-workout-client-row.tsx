"use client";

import Link from "next/link";
import { format } from "date-fns";
import { Flame } from "lucide-react";
import { formatDaysAgoLong } from "@/lib/utils/formatting";
import { getDisplayName, getInitials } from "@/lib/utils/display-name";
import { StatusBadge } from "@/components/shared/status-badge";
import { ROLE_CLASSES } from "@/lib/ui/status";
import { cn } from "@/lib/utils";
import type { ClientMetrics } from "@/lib/services/dashboard-insights.service";

/** One Mon–Sun cell of the week strip. */
export type DayDotStatus = "completed" | "missed" | "scheduled" | "none";

const dayDotStyles: Record<DayDotStatus, string> = {
  completed: cn(ROLE_CLASSES.success.dot, "border-success"),
  missed: cn(ROLE_CLASSES.warning.dot, "border-warning"),
  scheduled: "bg-info-soft border-info",
  none: "bg-muted border-transparent",
};

const dayDotLabels: Record<DayDotStatus, string> = {
  completed: "Completed",
  missed: "Missed",
  scheduled: "Scheduled",
  none: "No workout",
};

/**
 * Monday-first weekday initials, matching the order `buildWeekDays` emits.
 * Duplicate letters (T/T, S/S) are intentional — the product doc specifies
 * exactly "M T W T F S S".
 */
const DAY_INITIALS = ["M", "T", "W", "T", "F", "S", "S"] as const;

export interface WeekDayDot {
  date: Date;
  status: DayDotStatus;
}

export interface WeekWorkoutClientRowData {
  client: { id: string; firstName: string; lastName: string; email: string };
  /** The program shown as the row's subtitle — the one behind the next session, else the most recent. */
  programName: string;
  /** How many *other* programs this client has sessions from this week, shown as "+N". */
  otherProgramCount?: number;
  days: WeekDayDot[];
  nextSessionDate: Date | null;
  /** Status of the next upcoming session, else of the most recent one. */
  displayStatus: string | null;
  metrics?: ClientMetrics;
}

export function WeekWorkoutClientRow({ row }: { row: WeekWorkoutClientRowData }) {
  const { client, programName, otherProgramCount = 0, days, nextSessionDate, displayStatus, metrics } = row;
  const initials = getInitials(client);
  const displayName = getDisplayName(client);

  return (
    // A container, not a viewport, query: this row sits in a half-width card
    // on laptops and a full-width one on phones, so its own width decides
    // whether the week strip and next-session date still fit.
    <div className="@container rounded-lg border border-border bg-surface-muted/50 p-3 transition-colors hover:bg-surface-muted motion-reduce:transition-none">
      <div className="flex items-center gap-3">
        <Link
          href={`/clients/${client.id}`}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface text-xs font-medium text-muted-foreground ring-1 ring-border">
            {initials}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-label text-foreground hover:underline">
              {displayName}
            </span>
            <span className="flex min-w-0 items-baseline gap-1 text-caption">
              <span className="truncate">{programName}</span>
              {otherProgramCount > 0 && (
                <span className="shrink-0 font-medium">+{otherProgramCount}</span>
              )}
            </span>
            <span className="block truncate text-caption">
              {metrics?.lastCompletedAt
                ? `Active ${formatDaysAgoLong(metrics.lastCompletedAt)}`
                : "No completed workouts yet"}
            </span>
          </span>
        </Link>

        <div className="hidden shrink-0 items-center gap-1.5 @md:flex" aria-label="This week's workouts">
          {days.map((day, i) => (
            <span
              key={day.date.toISOString()}
              title={`${format(day.date, "EEE d MMM")} — ${dayDotLabels[day.status]}`}
              className="flex w-4 flex-col items-center gap-1"
            >
              <span className="text-[10px] font-medium leading-none text-muted-foreground">
                {DAY_INITIALS[i]}
              </span>
              <span className={`h-2.5 w-2.5 rounded-full border ${dayDotStyles[day.status]}`} />
            </span>
          ))}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <div className="flex items-center gap-2">
            {nextSessionDate && (
              <span className="hidden text-caption tabular-nums @xl:inline">
                Next: {format(nextSessionDate, "EEE, MMM d")}
              </span>
            )}
            {displayStatus && (
              <StatusBadge status={displayStatus} size="sm" />
            )}
          </div>
          {metrics && metrics.streak > 1 && (
            <span className="flex items-center gap-0.5 text-caption font-medium text-warning-foreground">
              <Flame className="h-3 w-3" />
              {metrics.streak} streak
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
