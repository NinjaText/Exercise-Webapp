"use client";

import { useMemo, useState } from "react";
import { addDays, format, isToday } from "date-fns";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Clock, Info, Moon } from "lucide-react";
import { cn } from "@/lib/utils";
import { toLocalCalendarDate } from "@/lib/utils/calendar-date";
import { groupSessionsByWeek } from "@/lib/utils/schedule-weeks";
import { ROLE_CLASSES, statusRole } from "@/lib/ui/status";
import { ScheduleAgendaDays, ScheduleWeekNav, agendaDayKey } from "./schedule-agenda";
import {
  castSession,
  STATUS_CONFIG,
  ReadOnlyPanel,
  type SessionData,
} from "./schedule-shared";

interface Props {
  rawSessions: Record<string, unknown>[];
}

export function ClientProgramScheduleView({ rawSessions }: Props) {
  const sessions = useMemo(() => rawSessions.map(castSession), [rawSessions]);
  const { weeks, defaultWeekIndex, weekStartDates } = useMemo(
    () => groupSessionsByWeek(sessions, new Date()),
    [sessions]
  );

  const [weekIndex, setWeekIndex] = useState(defaultWeekIndex);
  const [selectedSession, setSelectedSession] = useState<SessionData | null>(null);

  if (weeks.length === 0) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-info-border bg-info-soft p-3 text-body text-info-foreground">
        <Info className="h-4 w-4 mt-0.5 shrink-0 text-info-foreground" />
        <span>No workouts have been scheduled for this program yet.</span>
      </div>
    );
  }

  const clampedIndex = Math.max(0, Math.min(weekIndex, weeks.length - 1));
  const currentWeek = weeks[clampedIndex];
  const weekStart = weekStartDates[clampedIndex];
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const sessionsByDay = new Map<string, SessionData>();
  for (const session of currentWeek) {
    sessionsByDay.set(agendaDayKey(toLocalCalendarDate(session.scheduledDate)), session);
  }
  const agendaEntries = new Map<string, SessionData[]>(
    Array.from(sessionsByDay, ([key, session]) => [key, [session]])
  );

  return (
    <div className="space-y-4">
      <ScheduleWeekNav
        weekIndex={clampedIndex}
        weekCount={weeks.length}
        weekStart={weekStart}
        onPrevious={() => setWeekIndex((i) => Math.max(0, i - 1))}
        onNext={() => setWeekIndex((i) => Math.min(weeks.length - 1, i + 1))}
      />

      {/* Mobile: vertical day-by-day agenda list */}
      <ScheduleAgendaDays
        days={days}
        entriesByDay={agendaEntries}
        onSelect={setSelectedSession}
        className="sm:hidden"
      />

      {/* Desktop/tablet: 7-column week grid */}
      <div className="hidden overflow-x-auto pb-1 sm:block">
        <div className="grid min-w-[700px] grid-cols-7 gap-2">
          {days.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const session = sessionsByDay.get(key);
            const statusCfg = session ? STATUS_CONFIG[session.status] ?? STATUS_CONFIG.SCHEDULED : null;
            const dotClass = session ? ROLE_CLASSES[statusRole(session.status)].dot : null;
            const exerciseCount = session
              ? session.workout.blocks.reduce((sum, b) => sum + b.exercises.length, 0)
              : 0;
            const today = isToday(day);

            return (
              <div
                key={key}
                className={cn(
                  "flex min-h-40 flex-col rounded-lg border bg-card p-2",
                  today ? "border-primary/50 ring-1 ring-primary/30" : "border-border"
                )}
              >
                <div className="mb-1.5 flex items-baseline justify-between px-0.5">
                  <span className={cn("text-[11px] font-semibold uppercase tracking-wide", today ? "text-primary" : "text-muted-foreground")}>
                    {format(day, "EEE")}
                  </span>
                  <span className={cn("text-xs font-medium", today ? "text-primary" : "text-muted-foreground")}>
                    {format(day, "d")}
                  </span>
                </div>

                {session ? (
                  <button
                    onClick={() => setSelectedSession(session)}
                    className="flex flex-1 flex-col items-start gap-1.5 rounded-md border border-border bg-muted/30 p-2 text-left transition-colors hover:border-foreground/30 hover:bg-muted/50"
                  >
                    <span className={cn("h-2 w-2 shrink-0 rounded-full", dotClass)} />
                    <p className="line-clamp-2 text-xs font-semibold leading-snug text-foreground">
                      {session.workout.name}
                    </p>
                    <div className="mt-auto flex flex-col gap-0.5 text-[10px] text-muted-foreground">
                      {session.workout.estimatedMinutes && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-2.5 w-2.5" />
                          ~{session.workout.estimatedMinutes} min
                        </span>
                      )}
                      <span>
                        {exerciseCount} exercise{exerciseCount !== 1 ? "s" : ""}
                      </span>
                      <span className="font-medium">{statusCfg!.label}</span>
                    </div>
                  </button>
                ) : (
                  <div className="flex flex-1 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-muted-foreground">
                    <Moon className="h-3.5 w-3.5" />
                    <span className="text-[10px]">Rest day</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <Dialog
        open={selectedSession !== null}
        onOpenChange={(open) => { if (!open) setSelectedSession(null); }}
      >
        <DialogContent className="sm:max-w-lg max-h-[85dvh] p-0 flex flex-col overflow-hidden gap-0">
          {selectedSession && (
            <ReadOnlyPanel workout={selectedSession.workout} status={selectedSession.status} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
