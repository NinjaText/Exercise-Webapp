"use client";

import { useMemo } from "react";
import Link from "next/link";
import { addDays, format, isSameDay, isToday, startOfWeek } from "date-fns";
import { SectionCard } from "@/components/shared/section-card";
import { CalendarDays, Check } from "lucide-react";
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
    <SectionCard
      title="Your week"
      icon={CalendarDays}
      action={{ label: "View calendar", href: "/calendar" }}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-7 gap-1 sm:gap-2">
          {days.map((day) => (
            <WeekStripCell key={day.date.toISOString()} day={day} />
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {SESSION_STATUS_LEGEND.map((entry) => (
            <div key={entry.status} className="flex items-center gap-1.5">
              <div className={cn("size-2 rounded-full", entry.dot)} />
              <span className="text-caption">{entry.label}</span>
            </div>
          ))}
        </div>
      </div>
    </SectionCard>
  );
}

function WeekStripCell({ day }: { day: WeekStripDay }) {
  const { date, session } = day;
  const currentDay = isToday(date);
  const completed = session?.status === "COMPLETED";
  const label = session?.workout?.name ?? null;

  const content = (
    <>
      <span className="text-caption font-medium">
        {format(date, "EEE")}
      </span>
      <span className={cn("text-heading tabular-nums", currentDay && "text-primary")}>
        {format(date, "d")}
      </span>
      <span className="flex h-4 items-center justify-center">
        {completed ? (
          <Check className="size-3.5 text-success" aria-hidden />
        ) : session ? (
          <span className={cn("size-2 rounded-full", getSessionStatusDot(session.status))} />
        ) : (
          <span className="size-1 rounded-full bg-border-strong" />
        )}
      </span>
      <span className="line-clamp-2 min-h-8 text-center text-caption">
        {label ?? "Rest"}
      </span>
    </>
  );

  const className = cn(
    "flex min-w-0 flex-col items-center gap-1 rounded-lg border px-1 py-2 transition-colors motion-reduce:transition-none",
    currentDay ? "border-primary bg-primary/5" : "border-border",
    session &&
      "outline-none hover:border-border-strong hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-ring"
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
