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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { toLocalCalendarDate } from "@/lib/utils/calendar-date";

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

const STATUS_DOT: Record<string, string> = {
  COMPLETED: "bg-emerald-500",
  IN_PROGRESS: "bg-amber-500",
  SCHEDULED: "bg-blue-500",
  MISSED: "bg-slate-400",
};

const SESSION_STATUS_BADGE: Record<string, string> = {
  COMPLETED: "bg-emerald-100 text-emerald-700",
  IN_PROGRESS: "bg-amber-100 text-amber-700",
  SCHEDULED: "bg-blue-100 text-blue-700",
  MISSED: "bg-slate-100 text-slate-700",
};
const SESSION_STATUS_LABEL: Record<string, string> = {
  COMPLETED: "Completed",
  IN_PROGRESS: "In Progress",
  SCHEDULED: "Scheduled",
  MISSED: "Missed",
};

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

  return (
    <Card id="sessions">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" />
          <CardTitle className="text-base font-semibold">My Schedule</CardTitle>
        </div>
        <div className="hidden sm:flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCurrentMonth((m) => subMonths(m, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium w-28 text-center">{format(currentMonth, "MMMM yyyy")}</span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCurrentMonth((m) => addMonths(m, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Mobile: upcoming list is the primary schedule view on small screens */}
        <div className="sm:hidden divide-y divide-border rounded-lg border border-border overflow-hidden">
          {upcomingList.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">No upcoming sessions</p>
          ) : (
            upcomingList.map((s) => {
              const date = toLocalCalendarDate(s.scheduledDate);
              const isSelected = selectedDate ? isSameDay(date, selectedDate) : false;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onSelectDate(isSelected ? null : date)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors",
                    isSelected ? "bg-primary text-primary-foreground" : "hover:bg-muted/60"
                  )}
                >
                  <div className="min-w-0">
                    <p className={cn("text-xs font-medium", isSelected ? "text-primary-foreground/80" : "text-muted-foreground")}>
                      {format(date, "EEE, MMM d")}
                    </p>
                    <p className="truncate text-sm font-semibold">{s.workout?.name ?? "Workout"}</p>
                  </div>
                  <Badge
                    className={cn(
                      "shrink-0 border-0 text-[10px]",
                      isSelected ? "bg-primary-foreground/20 text-primary-foreground" : SESSION_STATUS_BADGE[s.status] ?? "bg-blue-100 text-blue-700"
                    )}
                  >
                    {SESSION_STATUS_LABEL[s.status] ?? "Scheduled"}
                  </Badge>
                </button>
              );
            })
          )}
        </div>

        {/* Desktop: calendar grid with grid lines */}
        <div className="hidden sm:block rounded-lg border border-border overflow-hidden">
          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 bg-muted/40 border-b border-border">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, idx) => (
              <div
                key={d}
                className={cn(
                  "text-[10px] font-semibold uppercase tracking-wide text-muted-foreground py-1.5 text-center",
                  idx < 6 && "border-r border-border"
                )}
              >
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7">
            {Array.from({ length: paddedStart }).map((_, i) => (
              <div
                key={`pad-${i}`}
                className={cn(
                  "min-h-[44px] border-b border-border",
                  i % 7 < 6 && "border-r border-border"
                )}
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
                onClick={() => onSelectDate(isSelected ? null : day)}
                className={cn(
                  "relative flex flex-col items-center justify-start p-1 py-1.5 transition-colors min-h-[44px] cursor-pointer",
                  "border-b border-border",
                  (paddedStart + days.indexOf(day)) % 7 < 6 && "border-r border-border",
                  !isSelected && "hover:bg-muted/60",
                  isSelected && "bg-primary text-primary-foreground",
                  isCurrentDay && !isSelected && "ring-2 ring-primary ring-inset rounded-[4px]"
                )}
              >
                <span className={cn("text-xs font-medium", isSelected ? "text-primary-foreground" : "text-foreground")}>
                  {format(day, "d")}
                </span>
                {hasSession && (
                  <div className="flex gap-1 mt-1">
                    {daySessions.slice(0, 3).map((s) => (
                      <div
                        key={s.id}
                        className={cn(
                          "h-2 w-2 rounded-full ring-1 ring-white/60",
                          isSelected ? "bg-primary-foreground/80" : STATUS_DOT[s.status] ?? "bg-muted-foreground"
                        )}
                      />
                    ))}
                  </div>
                )}
              </button>
            );
          })}
          </div>   {/* closes grid grid-cols-7 (day cells) */}
        </div>     {/* closes rounded-lg border wrapper */}

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1">
          {[
            { color: "bg-blue-500", label: "Scheduled" },
            { color: "bg-amber-500", label: "In Progress" },
            { color: "bg-emerald-500", label: "Completed" },
            { color: "bg-slate-400", label: "Missed" },
          ].map((l) => (
            <div key={l.label} className="flex items-center gap-1.5">
              <div className={cn("h-2 w-2 rounded-full", l.color)} />
              <span className="text-[10px] text-muted-foreground">{l.label}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
