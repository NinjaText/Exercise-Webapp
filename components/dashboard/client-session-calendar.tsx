"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
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
  isAfter,
} from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, ChevronLeft, ChevronRight, ClipboardList, Zap } from "lucide-react";
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
}

const STATUS_DOT: Record<string, string> = {
  COMPLETED: "bg-emerald-500",
  IN_PROGRESS: "bg-amber-500",
  SCHEDULED: "bg-blue-500",
};

export function ClientSessionCalendar({ sessions }: Props) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(() => {
    // Auto-select today if there's a session
    return new Date();
  });

  const today = startOfDay(new Date());

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

  function isClickable(date: Date, daySessions: CalendarSession[]): boolean {
    // Only today or past dates with non-completed sessions
    if (isAfter(startOfDay(date), today)) return false;
    return daySessions.some((s) => s.status === "SCHEDULED" || s.status === "IN_PROGRESS");
  }

  const selectedSessions = selectedDate ? getSessionsForDay(selectedDate) : [];
  const selectedIsClickable = selectedDate ? isClickable(selectedDate, selectedSessions) : false;

  return (
    <Card id="sessions">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" />
          <CardTitle className="text-base font-semibold">My Schedule</CardTitle>
        </div>
        <div className="flex items-center gap-1">
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
        {/* Selected day detail — surfaced above the calendar so it's visible without scrolling */}
        {selectedDate && selectedSessions.length > 0 && (
          <div className="pb-3 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {isToday(selectedDate) ? "Today" : format(selectedDate, "EEEE, MMMM d")}
            </p>
            {selectedSessions.map((session) => {
              const exerciseCount = session.workout?.blocks.reduce((n, b) => n + b.exercises.length, 0) ?? 0;
              const isCompleted = session.status === "COMPLETED";
              return (
                <div key={session.id} className="rounded-xl border border-border/60 bg-muted/30 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-sm">{session.workout?.name ?? "Workout"}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{exerciseCount} exercises</p>
                    </div>
                    <Badge
                      className={cn(
                        "text-[10px] border-0 shrink-0",
                        isCompleted
                          ? "bg-emerald-100 text-emerald-700"
                          : session.status === "IN_PROGRESS"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-blue-100 text-blue-700"
                      )}
                    >
                      {session.status === "IN_PROGRESS"
                        ? "In Progress"
                        : session.status === "COMPLETED"
                          ? "Completed"
                          : "Scheduled"}
                    </Badge>
                  </div>

                  {isCompleted ? (
                    <p className="text-xs text-emerald-600 font-medium">✓ Workout completed</p>
                  ) : selectedIsClickable ? (
                    <div className="grid grid-cols-2 gap-2">
                      <Link href={`/sessions/${session.id}?mode=checklist`} className="block">
                        <div className="flex flex-col gap-1 rounded-lg border border-border/60 bg-background p-3 hover:bg-muted/50 hover:border-emerald-200 transition-colors cursor-pointer">
                          <div className="flex items-center gap-1.5">
                            <ClipboardList className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                            <span className="text-xs font-semibold">Checklist</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground">Check off as you go</p>
                        </div>
                      </Link>
                      <Link href={`/sessions/${session.id}?mode=session`} className="block">
                        <div className="flex flex-col gap-1 rounded-lg border border-border/60 bg-background p-3 hover:bg-muted/50 hover:border-blue-200 transition-colors cursor-pointer">
                          <div className="flex items-center gap-1.5">
                            <Zap className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                            <span className="text-xs font-semibold">Full Session</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground">Guided with logging</p>
                        </div>
                      </Link>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Available on the scheduled date.</p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Calendar grid with grid lines */}
        <div className="rounded-lg border border-border overflow-hidden">
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
            const isFutureDay = isAfter(startOfDay(day), today);
            const isCurrentDay = isToday(day);

            return (
              <button
                key={day.toISOString()}
                type="button"
                onClick={() => {
                  if (hasSession) {
                    setSelectedDate(isSelected ? null : day);
                  }
                }}
                disabled={!hasSession}
                className={cn(
                  "relative flex flex-col items-center justify-start p-1 py-1.5 transition-colors min-h-[44px]",
                  "border-b border-border",
                  (paddedStart + days.indexOf(day)) % 7 < 6 && "border-r border-border",
                  !hasSession && "cursor-default",
                  hasSession && !isSelected && "cursor-pointer hover:bg-muted/60",
                  isSelected && "bg-primary text-primary-foreground",
                  isCurrentDay && !isSelected && "ring-2 ring-primary ring-inset rounded-[4px]",
                  isFutureDay && hasSession && "opacity-50"
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
        <div className="flex items-center gap-4 pt-1">
          {[
            { color: "bg-blue-500", label: "Scheduled" },
            { color: "bg-amber-500", label: "In Progress" },
            { color: "bg-emerald-500", label: "Completed" },
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
