"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, Clock, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { toLocalCalendarDate } from "@/lib/utils/calendar-date";
import { groupSessionsByWeek } from "@/lib/utils/schedule-weeks";
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
  const { weeks, defaultWeekIndex } = useMemo(
    () => groupSessionsByWeek(sessions, new Date()),
    [sessions]
  );

  const [weekIndex, setWeekIndex] = useState(defaultWeekIndex);
  const [selectedSession, setSelectedSession] = useState<SessionData | null>(null);

  if (weeks.length === 0) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-800">
        <Info className="h-4 w-4 mt-0.5 shrink-0 text-violet-500" />
        <span>No workouts have been scheduled for this program yet.</span>
      </div>
    );
  }

  const clampedIndex = Math.max(0, Math.min(weekIndex, weeks.length - 1));
  const currentWeek = weeks[clampedIndex];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2">
        <button
          onClick={() => setWeekIndex((i) => Math.max(0, i - 1))}
          disabled={clampedIndex === 0}
          aria-label="Previous week"
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:opacity-30 disabled:pointer-events-none"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <h2 className="text-sm font-bold tracking-tight sm:text-base">
          Week {clampedIndex + 1} of {weeks.length}
        </h2>
        <button
          onClick={() => setWeekIndex((i) => Math.min(weeks.length - 1, i + 1))}
          disabled={clampedIndex === weeks.length - 1}
          aria-label="Next week"
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:opacity-30 disabled:pointer-events-none"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {currentWeek.length === 0 ? (
        <p className="px-1 text-sm text-muted-foreground">
          No workouts scheduled this week.
        </p>
      ) : (
        <div className="space-y-2">
          {currentWeek.map((session) => {
            const statusCfg = STATUS_CONFIG[session.status] ?? STATUS_CONFIG.SCHEDULED;
            const exerciseCount = session.workout.blocks.reduce(
              (sum, b) => sum + b.exercises.length,
              0
            );
            const date = toLocalCalendarDate(session.scheduledDate);

            return (
              <button
                key={session.id}
                onClick={() => setSelectedSession(session)}
                className="flex w-full items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-left transition-colors hover:border-foreground/30"
              >
                <div
                  className={cn("h-2 w-2 shrink-0 rounded-full")}
                  style={{ backgroundColor: statusCfg.dot }}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    {format(date, "EEEE, MMM d")}
                  </p>
                  <p className="truncate text-sm font-semibold leading-snug text-foreground">
                    {session.workout.name}
                  </p>
                  <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                    {session.workout.estimatedMinutes && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        ~{session.workout.estimatedMinutes} min
                      </span>
                    )}
                    <span>
                      {exerciseCount} exercise{exerciseCount !== 1 ? "s" : ""}
                    </span>
                  </p>
                </div>
                <span className="shrink-0 text-[10px] font-medium text-muted-foreground">
                  {statusCfg.label}
                </span>
              </button>
            );
          })}
        </div>
      )}

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
