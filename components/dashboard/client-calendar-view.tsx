"use client";

import { useState } from "react";
import Link from "next/link";
import { format, startOfDay } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
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
    // The selected-day panel sits ABOVE the grid: starting today's workout is
    // the reason a client opens this page, so it must not sit below the fold.
    <div className="flex flex-col gap-6">
      {selectedDate && (
        <Card className="relative">
          <CardContent>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setSelectedDate(null)}
              className="absolute top-3 right-3 text-muted-foreground"
              aria-label="Clear selected day"
            >
              <X className="size-4" />
            </Button>
            {selectedSession ? (
              <div className="flex flex-col gap-4 pr-10 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <StatusBadge
                    status={exactMatch ? "SELECTED" : "NEXT"}
                    role={exactMatch ? "info" : "neutral"}
                    label={exactMatch ? "Selected day" : "Next available"}
                  />
                  <p className="mt-2 text-label text-muted-foreground">
                    {format(toLocalCalendarDate(selectedSession.scheduledDate), "EEEE, MMM d")}
                  </p>
                  <h3 className="text-title text-foreground">
                    {formatDayLabel(selectedSession.workout)}
                  </h3>
                  <p className="mt-1 text-body text-muted-foreground">
                    {formatWorkoutMetaLine(
                      selectedSession.workout?.estimatedMinutes,
                      countExercises(selectedSession.workout)
                    )}
                  </p>
                </div>
                {exactMatch && selectedSession.status !== "COMPLETED" ? (
                  <Button size="lg" className="h-11 shrink-0 sm:h-10" asChild>
                    <Link href={`/sessions/${selectedSession.id}`}>
                      <Play className="mr-2 size-4 fill-current" />
                      Start Workout
                    </Link>
                  </Button>
                ) : (
                  <Button size="lg" variant="outline" className="h-11 shrink-0 sm:h-10" asChild>
                    <Link href={`/sessions/${selectedSession.id}`}>
                      View Workout
                      <ChevronRight className="ml-2 size-4" />
                    </Link>
                  </Button>
                )}
              </div>
            ) : (
              <EmptyState
                size="compact"
                icon={CalendarX}
                title={`No Workouts After ${format(selectedDate, "MMM d")}`}
                description={quote}
              />
            )}
          </CardContent>
        </Card>
      )}

      <ClientSessionCalendar
        sessions={sessions}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
      />
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
