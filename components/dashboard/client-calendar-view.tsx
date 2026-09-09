"use client";

import { useState } from "react";
import Link from "next/link";
import { format, startOfDay } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarX, ChevronRight, Play, X } from "lucide-react";
import { toLocalCalendarDate } from "@/lib/utils/calendar-date";
import { getDailyQuote } from "@/lib/constants/motivation";
import {
  countExercises,
  formatDayLabel,
  formatWorkoutMetaLine,
} from "@/lib/utils/workout-format";
import { ClientSessionCalendar } from "./client-session-calendar";

export interface ClientCalendarSessionItem {
  id: string;
  scheduledDate: Date;
  status: string;
  workout: {
    name: string | null;
    dayIndex?: number | null;
    weekIndex?: number | null;
    estimatedMinutes?: number | null;
    blocks: { exercises: { id: string }[] }[];
  } | null;
}

/**
 * The full-page month schedule. Owns the selected-day state that pairs the
 * calendar grid with the detail panel beneath it — the dashboard now shows
 * only the compact week strip and links here.
 */
export function ClientCalendarView({ sessions }: { sessions: ClientCalendarSessionItem[] }) {
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const quote = getDailyQuote();

  // When a day is selected: show that day's session if one exists, otherwise
  // the next session scheduled after it (never before).
  const exactMatch = selectedDate
    ? sessions.find((s) => isSameLocalDay(s.scheduledDate, selectedDate)) ?? null
    : null;
  const nextAfter =
    selectedDate && !exactMatch
      ? sessions
          .filter(
            (s) =>
              toLocalCalendarDate(s.scheduledDate).getTime() > startOfDay(selectedDate).getTime()
          )
          .sort(
            (a, b) =>
              toLocalCalendarDate(a.scheduledDate).getTime() -
              toLocalCalendarDate(b.scheduledDate).getTime()
          )[0] ?? null
      : null;
  const selectedSession = exactMatch ?? nextAfter;

  return (
    <div className="space-y-6">
      <ClientSessionCalendar
        sessions={sessions}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
      />

      {selectedDate && (
        <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
          <button
            type="button"
            onClick={() => setSelectedDate(null)}
            className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Clear selected day"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          {selectedSession ? (
            <div className="flex flex-col gap-4 pr-8 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <Badge variant="outline" className="mb-2 text-xs font-medium uppercase tracking-wide">
                  {exactMatch ? "Selected Day" : "Next Available"}
                </Badge>
                <p className="text-sm font-medium text-muted-foreground">
                  {format(toLocalCalendarDate(selectedSession.scheduledDate), "EEEE, MMM d")}
                </p>
                <h3 className="text-lg font-bold text-foreground">
                  {formatDayLabel(selectedSession.workout)}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatWorkoutMetaLine(
                    selectedSession.workout?.estimatedMinutes,
                    countExercises(selectedSession.workout)
                  )}
                </p>
              </div>
              {exactMatch && selectedSession.status !== "COMPLETED" ? (
                <Button size="lg" className="shrink-0 font-semibold" asChild>
                  <Link href={`/sessions/${selectedSession.id}`}>
                    <Play className="mr-2 h-4 w-4 fill-current" />
                    Start Workout
                  </Link>
                </Button>
              ) : (
                <Button size="lg" variant="outline" className="shrink-0 font-semibold" asChild>
                  <Link href={`/sessions/${selectedSession.id}`}>
                    View Workout
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              )}
            </div>
          ) : (
            <div className="pr-8 text-center">
              <CalendarX className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
              <h3 className="text-base font-bold text-foreground">
                No Workouts After {format(selectedDate, "MMM d")}
              </h3>
              <p className="mt-2 text-xs text-muted-foreground italic">{quote}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function isSameLocalDay(scheduledDate: Date, day: Date): boolean {
  const local = toLocalCalendarDate(scheduledDate);
  return (
    local.getFullYear() === day.getFullYear() &&
    local.getMonth() === day.getMonth() &&
    local.getDate() === day.getDate()
  );
}
