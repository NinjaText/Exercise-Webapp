"use client";

import { useMemo } from "react";
import Link from "next/link";
import { addDays, format, isSameDay, isToday, startOfWeek } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarDays, Check, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { toLocalCalendarDate } from "@/lib/utils/calendar-date";
import {
  SESSION_STATUS_LEGEND,
  getSessionStatusDot,
  getSessionStatusLabel,
} from "@/lib/constants/session-status";

export interface WeekStripSession {
  id: string;
  scheduledDate: Date;
  status: string;
  workout: { name: string | null } | null;
}

interface Props {
  sessions: WeekStripSession[];
  /** Injected so the strip stays deterministic in tests and matches the page's "now". */
  today?: Date;
}

interface WeekStripDay {
  date: Date;
  session: WeekStripSession | null;
}

/**
 * Compact Mon–Sun strip — the client dashboard's primary at-a-glance schedule.
 *
 * Anchored to a Monday-start week to match lib/utils/schedule-weeks.ts and
 * client-program-schedule-view.tsx, so "this week" means the same thing on the
 * dashboard as it does inside a program's schedule.
 */
export function WeekStrip({ sessions, today = new Date() }: Props) {
  const days: WeekStripDay[] = useMemo(() => {
    const weekStart = startOfWeek(today, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(weekStart, i);
      const session =
        sessions.find((s) => isSameDay(toLocalCalendarDate(s.scheduledDate), date)) ?? null;
      return { date, session };
    });
  }, [sessions, today]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary" />
          <CardTitle className="text-base font-semibold">This Week</CardTitle>
        </div>
        <Link
          href="/calendar"
          className="inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline"
        >
          View Calendar <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-7 gap-1.5">
          {days.map((day) => (
            <WeekStripCell key={day.date.toISOString()} day={day} />
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {SESSION_STATUS_LEGEND.map((entry) => (
            <div key={entry.status} className="flex items-center gap-1.5">
              <div className={cn("h-2 w-2 rounded-full", entry.dot)} />
              <span className="text-[10px] text-muted-foreground">{entry.label}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function WeekStripCell({ day }: { day: WeekStripDay }) {
  const { date, session } = day;
  const currentDay = isToday(date);
  const completed = session?.status === "COMPLETED";
  const label = session?.workout?.name ?? null;

  const content = (
    <>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {format(date, "EEE")}
      </span>
      <span className={cn("text-sm font-bold", currentDay && "text-primary")}>
        {format(date, "d")}
      </span>
      <span className="flex h-4 items-center justify-center">
        {completed ? (
          <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
        ) : session ? (
          <span className={cn("h-2 w-2 rounded-full", getSessionStatusDot(session.status))} />
        ) : (
          <span className="h-1 w-1 rounded-full bg-border" />
        )}
      </span>
      <span className="line-clamp-2 min-h-6 text-center text-[10px] leading-tight text-muted-foreground">
        {label ?? "Rest"}
      </span>
    </>
  );

  const className = cn(
    "flex flex-col items-center gap-1 rounded-lg border p-1.5 transition-colors",
    currentDay ? "border-primary bg-primary/5" : "border-border/60",
    session && "hover:bg-muted/60"
  );

  if (!session) {
    return <div className={className}>{content}</div>;
  }

  return (
    <Link
      href={`/sessions/${session.id}`}
      className={className}
      title={`${format(date, "EEE d MMM")} — ${label ?? "Workout"} (${getSessionStatusLabel(session.status)})`}
    >
      {content}
    </Link>
  );
}
