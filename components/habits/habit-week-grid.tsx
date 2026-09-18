"use client";

import { cn } from "@/lib/utils";

interface DayLog {
  date: Date | string;
  completed: boolean;
}

interface HabitWeekGridProps {
  logs: DayLog[];
}

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

/** Returns midnight UTC for a given date-like value. */
function toDateOnly(d: Date | string): Date {
  const src = typeof d === "string" ? new Date(d) : d;
  return new Date(Date.UTC(src.getUTCFullYear(), src.getUTCMonth(), src.getUTCDate()));
}

/** Returns the Monday of the week containing `d` (UTC). */
function getWeekMonday(d: Date): Date {
  const day = d.getUTCDay(); // 0 = Sun
  const diff = (day + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff));
}

/**
 * Renders a compact Mon–Sun dot row for the current week.
 *
 * - Filled primary-colored dot = completed
 * - Outlined dot = past day, not completed
 * - Muted grey dot = future day (no data yet)
 */
export function HabitWeekGrid({ logs }: HabitWeekGridProps) {
  const today = toDateOnly(new Date());
  const monday = getWeekMonday(today);

  // Build a set of completed timestamps for O(1) lookup
  const completedDays = new Set(
    logs
      .filter((l) => l.completed)
      .map((l) => toDateOnly(l.date).getTime())
  );

  return (
    <div className="flex items-center gap-1" aria-label="This week's habit completion">
      {DAY_LABELS.map((label, index) => {
        const dayDate = new Date(monday.getTime() + index * 24 * 60 * 60 * 1000);
        const isFuture   = dayDate.getTime() > today.getTime();
        const isDone     = completedDays.has(dayDate.getTime());
        const isToday    = dayDate.getTime() === today.getTime();

        return (
          <div key={index} className="flex flex-col items-center gap-0.5">
            {/* Dot */}
            <div
              className={cn(
                "h-2 w-2 rounded-full transition-colors",
                isDone
                  ? "bg-success"
                  : isFuture
                  ? "bg-muted-foreground/20"
                  : "border border-muted-foreground/40 bg-transparent"
              )}
              aria-label={`${label}: ${isDone ? "done" : isFuture ? "upcoming" : "missed"}`}
            />
            {/* Day label */}
            <span
              className={cn(
                "text-[9px] font-medium leading-none",
                isToday ? "text-primary" : "text-muted-foreground/60"
              )}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
