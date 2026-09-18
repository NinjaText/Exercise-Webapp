"use client";

import { useTransition } from "react";
import { cn } from "@/lib/utils";
import { Check, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { logHabitAction, deleteHabitAction } from "@/actions/habit-actions";
import { HabitWeekGrid } from "./habit-week-grid";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

// ─── Types ────────────────────────────────────────────────────────────────────

interface HabitLog {
  date: Date | string;
  completed: boolean;
}

interface Habit {
  id: string;
  name: string;
  icon: string | null;
  targetValue: number | null;
  unit: string | null;
  logs: HabitLog[]; // today's log is the first element (or empty array)
  stats?: {
    currentStreak: number;
    totalCompletions: number;
    thisWeekCompletions: number;
  };
  weekLogs?: HabitLog[]; // Mon–Sun logs for current week (optional)
}

interface HabitCardProps {
  habit: Habit;
  onToggle?: (habitId: string, completed: boolean) => void;
  showDelete?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function HabitCard({ habit, onToggle, showDelete = false }: HabitCardProps) {
  const [isPending, startTransition] = useTransition();

  const todayLog = habit.logs[0] ?? null;
  const isCompleted = todayLog?.completed ?? false;
  const streak = habit.stats?.currentStreak ?? 0;

  function handleToggle() {
    const nextCompleted = !isCompleted;

    startTransition(async () => {
      const result = await logHabitAction(habit.id, nextCompleted);

      if (result.success) {
        toast.success(nextCompleted ? "Habit logged!" : "Habit unmarked");
        onToggle?.(habit.id, nextCompleted);
      } else {
        toast.error(result.error ?? "Failed to update habit");
      }
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteHabitAction(habit.id);

      if (result.success) {
        toast.success("Habit removed");
      } else {
        toast.error(result.error ?? "Failed to remove habit");
      }
    });
  }

  return (
    <div
      className={cn(
        "group relative flex flex-col gap-4 rounded-xl p-5 ring-1 ring-border shadow-none transition-all duration-200",
        "hover:-translate-y-0.5 hover:shadow-sm hover:ring-border-strong",
        isCompleted && "ring-success-border bg-success-soft"
      )}
    >
      {/* Top row: icon + name + delete button */}
      <div className="flex items-start gap-3">
        {/* Habit icon */}
        <div
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-2xl",
            isCompleted ? "bg-success-soft" : "bg-muted"
          )}
          aria-hidden="true"
        >
          {habit.icon ?? "🎯"}
        </div>

        {/* Name + streak */}
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-tight truncate">{habit.name}</p>

          {/* Target value if set */}
          {habit.targetValue && habit.unit && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Target: {habit.targetValue} {habit.unit}
            </p>
          )}

          {/* Streak */}
          {streak > 0 && (
            <p className="mt-1 text-sm font-bold text-warning">
              🔥 {streak} day streak
            </p>
          )}
        </div>

        {/* Delete button (conditionally shown) */}
        {showDelete && (
          <AlertDialog>
            {/* base-ui AlertDialogTrigger does not support asChild — render the
                button as children so the primitive wraps it with the open handler. */}
            <AlertDialogTrigger
              className="shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100 outline-none"
              aria-label="Remove habit"
              disabled={isPending}
            >
              <Trash2 className="h-4 w-4" />
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove habit?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will deactivate &ldquo;{habit.name}&rdquo;. Your historical log data
                  will be preserved. You can re-add this habit at any time.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  variant="destructive"
                >
                  Remove
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {/* Week grid */}
      <HabitWeekGrid logs={habit.weekLogs ?? habit.logs} />

      {/* Complete button */}
      <button
        onClick={handleToggle}
        disabled={isPending}
        aria-label={isCompleted ? "Mark as not done" : "Mark as done"}
        className={cn(
          "mt-auto flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring",
          isCompleted
            ? "bg-success text-white hover:bg-success/90"
            : "bg-primary/10 text-primary hover:bg-primary/20"
        )}
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isCompleted ? (
          <>
            <Check className="h-4 w-4" />
            Done today
          </>
        ) : (
          "Mark done"
        )}
      </button>
    </div>
  );
}
