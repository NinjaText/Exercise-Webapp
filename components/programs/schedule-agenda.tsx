"use client";

import { addDays, format, isToday } from "date-fns";
import { ChevronLeft, ChevronRight, Clock, Moon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROLE_CLASSES, statusRole } from "@/lib/ui/status";
import { STATUS_CONFIG, type WorkoutData } from "./schedule-shared";

/** Anything the agenda can list on a day: a client session or a program workout. */
export interface AgendaEntry {
  id: string;
  status: string;
  workout: WorkoutData;
}

/** "yyyy-MM-dd" of a local calendar date — the key `ScheduleAgendaDays` looks entries up by. */
export function agendaDayKey(day: Date): string {
  return format(day, "yyyy-MM-dd");
}

/** Week header with previous/next buttons: "Week 2 of 6 · Sep 14 – Sep 20". */
export function ScheduleWeekNav({
  weekIndex,
  weekCount,
  weekStart,
  onPrevious,
  onNext,
}: {
  weekIndex: number;
  weekCount: number;
  weekStart: Date;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-card px-3 py-2 shadow-xs ring-1 ring-border">
      <button
        onClick={onPrevious}
        disabled={weekIndex === 0}
        aria-label="Previous week"
        className="flex h-8 w-8 pointer-coarse:size-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:opacity-30 disabled:pointer-events-none"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <div className="text-center">
        <h2 className="text-label text-foreground sm:text-heading">
          Week {weekIndex + 1} of {weekCount}
        </h2>
        <p className="text-caption">
          {format(weekStart, "MMM d")} – {format(addDays(weekStart, 6), "MMM d")}
        </p>
      </div>
      <button
        onClick={onNext}
        disabled={weekIndex === weekCount - 1}
        aria-label="Next week"
        className="flex h-8 w-8 pointer-coarse:size-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:opacity-30 disabled:pointer-events-none"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

/**
 * Vertical day-by-day list for phones: one row per day, each listing that
 * day's entries (tap to open) or "Rest day".
 */
export function ScheduleAgendaDays<T extends AgendaEntry>({
  days,
  entriesByDay,
  onSelect,
  className,
}: {
  days: Date[];
  /** Entries per `agendaDayKey(day)`, already in display order. */
  entriesByDay: Map<string, T[]>;
  onSelect: (entry: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {days.map((day) => {
        const key = agendaDayKey(day);
        const entries = entriesByDay.get(key) ?? [];
        const today = isToday(day);

        return (
          <div
            key={key}
            className={cn(
              "flex items-stretch gap-3 rounded-lg border bg-card p-2.5",
              today ? "border-primary/50 ring-1 ring-primary/30" : "border-border"
            )}
          >
            <div className="flex w-12 shrink-0 flex-col items-center justify-center rounded-md bg-muted/40 py-1.5">
              <span className={cn("text-[10px] font-semibold uppercase tracking-wide", today ? "text-primary" : "text-muted-foreground")}>
                {format(day, "EEE")}
              </span>
              <span className={cn("text-base font-bold", today ? "text-primary" : "text-foreground")}>
                {format(day, "d")}
              </span>
            </div>

            {entries.length > 0 ? (
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                {entries.map((entry) => (
                  <AgendaEntryButton key={entry.id} entry={entry} onSelect={() => onSelect(entry)} />
                ))}
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-dashed border-border text-muted-foreground">
                <Moon className="h-3.5 w-3.5" />
                <span className="text-xs">Rest day</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AgendaEntryButton({ entry, onSelect }: { entry: AgendaEntry; onSelect: () => void }) {
  const statusCfg = STATUS_CONFIG[entry.status] ?? STATUS_CONFIG.SCHEDULED;
  const dotClass = ROLE_CLASSES[statusRole(entry.status)].dot;
  const exerciseCount = entry.workout.blocks.reduce((sum, b) => sum + b.exercises.length, 0);

  return (
    <button
      onClick={onSelect}
      className="flex flex-1 items-center gap-2 rounded-md border border-border bg-muted/30 p-2 text-left transition-colors hover:border-foreground/30 hover:bg-muted/50"
    >
      <span className={cn("h-2 w-2 shrink-0 rounded-full", dotClass)} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold leading-snug text-foreground">
          {entry.workout.name}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
          {entry.workout.estimatedMinutes && (
            <span className="flex items-center gap-1">
              <Clock className="h-2.5 w-2.5" />
              ~{entry.workout.estimatedMinutes} min
            </span>
          )}
          <span>
            {exerciseCount} exercise{exerciseCount !== 1 ? "s" : ""}
          </span>
          <span className="font-medium">{statusCfg.label}</span>
        </div>
      </div>
    </button>
  );
}
