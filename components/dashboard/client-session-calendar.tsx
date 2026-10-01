"use client";

import { useState, useMemo } from "react";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  isToday,
  isSameDay,
  startOfDay,
  addMonths,
  subMonths,
} from "date-fns";
import { SectionCard } from "@/components/shared/section-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { toLocalCalendarDate } from "@/lib/utils/calendar-date";
import {
  SESSION_STATUS_LEGEND,
  getSessionStatusBadge,
  getSessionStatusDot,
  getSessionStatusLabel,
} from "@/lib/constants/session-status";

interface CalendarSession {
  id: string;
  scheduledDate: Date;
  status: string;
  workout: {
    name: string | null;
    blocks: { exercises: { id: string }[] }[];
  } | null;
}

interface Props {
  sessions: CalendarSession[];
  selectedDate: Date | null;
  onSelectDate: (date: Date | null) => void;
}

export function ClientSessionCalendar({ sessions, selectedDate, onSelectDate }: Props) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const { days, paddedStart } = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
    // Monday=0 ... Sunday=6
    const rawDay = getDay(monthStart); // 0=Sunday
    const paddedStart = rawDay === 0 ? 6 : rawDay - 1;
    return { days, paddedStart };
  }, [currentMonth]);

  function getSessionsForDay(date: Date): CalendarSession[] {
    return sessions.filter((s) => isSameDay(toLocalCalendarDate(s.scheduledDate), date));
  }

  const upcomingList = useMemo(() => {
    const today = startOfDay(new Date());
    return sessions
      .filter((s) => toLocalCalendarDate(s.scheduledDate) >= today)
      .sort((a, b) => toLocalCalendarDate(a.scheduledDate).getTime() - toLocalCalendarDate(b.scheduledDate).getTime());
  }, [sessions]);

  const monthNav = (
    <div className="hidden items-center gap-1 sm:flex">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Previous month"
        onClick={() => setCurrentMonth((m) => subMonths(m, 1))}
      >
        <ChevronLeft className="size-4" />
      </Button>
      <span className="w-32 text-center text-label tabular-nums" aria-live="polite">
        {format(currentMonth, "MMMM yyyy")}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Next month"
        onClick={() => setCurrentMonth((m) => addMonths(m, 1))}
      >
        <ChevronRight className="size-4" />
      </Button>
    </div>
  );

  return (
    <SectionCard title="My schedule" icon={Calendar} action={monthNav} contentClassName="space-y-4">
      {/* Mobile: upcoming list is the primary schedule view on small screens */}
      <div className="divide-y divide-border overflow-hidden rounded-lg border border-border sm:hidden">
        {upcomingList.length === 0 ? (
          <p className="p-4 text-center text-body text-muted-foreground">No upcoming sessions</p>
        ) : (
          upcomingList.map((s) => {
            const date = toLocalCalendarDate(s.scheduledDate);
            const isSelected = selectedDate ? isSameDay(date, selectedDate) : false;
            return (
              <button
                key={s.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => onSelectDate(isSelected ? null : date)}
                className={cn(
                  "flex min-h-14 w-full items-center justify-between gap-3 px-4 py-2.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none",
                  isSelected ? "bg-primary text-primary-foreground" : "hover:bg-surface-muted"
                )}
              >
                <div className="min-w-0">
                  <p className={cn("text-caption", isSelected && "text-primary-foreground/80")}>
                    {format(date, "EEE, MMM d")}
                  </p>
                  <p className="truncate text-body font-medium">{s.workout?.name ?? "Workout"}</p>
                </div>
                <Badge
                  className={cn(
                    "shrink-0 border-0",
                    isSelected ? "bg-primary-foreground/20 text-primary-foreground" : getSessionStatusBadge(s.status)
                  )}
                >
                  {getSessionStatusLabel(s.status)}
                </Badge>
              </button>
            );
          })
        )}
      </div>

      {/* Tablet and up: month grid with hairline cell borders */}
      <div className="hidden overflow-hidden rounded-lg border border-border sm:block">
        <div className="grid grid-cols-7 border-b border-border bg-surface-muted">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, idx) => (
            <div
              key={d}
              className={cn("py-2 text-center text-caption font-medium", idx < 6 && "border-r border-border")}
            >
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {Array.from({ length: paddedStart }).map((_, i) => (
            <div
              key={`pad-${i}`}
              className={cn("min-h-16 border-b border-border bg-surface-muted/40", i % 7 < 6 && "border-r")}
            />
          ))}
          {days.map((day) => {
            const daySessions = getSessionsForDay(day);
            const hasSession = daySessions.length > 0;
            const isSelected = selectedDate ? isSameDay(day, selectedDate) : false;
            const isCurrentDay = isToday(day);

            return (
              <button
                key={day.toISOString()}
                type="button"
                aria-pressed={isSelected}
                aria-label={`${format(day, "EEEE, MMMM d")}${hasSession ? ` — ${daySessions.map((s) => getSessionStatusLabel(s.status)).join(", ")}` : ""}`}
                onClick={() => onSelectDate(isSelected ? null : day)}
                className={cn(
                  "relative flex min-h-16 cursor-pointer flex-col items-center justify-start gap-1.5 border-b border-border p-1.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none",
                  (paddedStart + days.indexOf(day)) % 7 < 6 && "border-r",
                  !isSelected && "hover:bg-surface-muted",
                  isSelected && "bg-primary text-primary-foreground"
                )}
              >
                <span
                  className={cn(
                    "flex size-7 items-center justify-center rounded-full text-label tabular-nums",
                    isSelected
                      ? "text-primary-foreground"
                      : isCurrentDay
                        ? "bg-primary/10 font-semibold text-primary"
                        : "text-foreground"
                  )}
                >
                  {format(day, "d")}
                </span>
                {hasSession && (
                  <div className="flex gap-1">
                    {daySessions.slice(0, 3).map((s) => (
                      <div
                        key={s.id}
                        className={cn(
                          "size-2 rounded-full",
                          isSelected ? "bg-primary-foreground/80" : getSessionStatusDot(s.status)
                        )}
                      />
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {SESSION_STATUS_LEGEND.map((entry) => (
          <div key={entry.status} className="flex items-center gap-1.5">
            <div className={cn("size-2 rounded-full", entry.dot)} />
            <span className="text-caption">{entry.label}</span>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
