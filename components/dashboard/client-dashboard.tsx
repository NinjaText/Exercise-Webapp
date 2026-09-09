"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, Play, Flame, ChevronRight, CalendarX } from "lucide-react";
import { format } from "date-fns";
import { formatDate } from "@/lib/utils/formatting";
import { toLocalCalendarDate } from "@/lib/utils/calendar-date";
import { getDailyQuote } from "@/lib/constants/motivation";
import {
  countExercises,
  formatDayLabel,
  formatWorkoutMetaLine,
} from "@/lib/utils/workout-format";
import { TrainerMessageBanner, type TrainerMessagePreview } from "./trainer-message-banner";
import { ProgramProgressBar, type ProgramProgressSummary } from "./program-progress-bar";
import { WeekStrip } from "./week-strip";
import { QuickResourcesRow, type QuickResourceItem } from "./quick-resources-row";

// Re-exported from lib/utils/workout-format so the existing callers (and the
// component's unit tests) keep importing them from here.
export { countExercises, formatDayLabel, formatWorkoutMetaLine };

function isSameLocalDay(a: Date, b: Date) {
  const localA = toLocalCalendarDate(a);
  return (
    localA.getFullYear() === b.getFullYear() &&
    localA.getMonth() === b.getMonth() &&
    localA.getDate() === b.getDate()
  );
}

interface DashboardSession {
  id: string;
  scheduledDate: Date;
  status: string;
  workout?: {
    name?: string | null;
    dayIndex?: number | null;
    weekIndex?: number | null;
    estimatedMinutes?: number | null;
    blocks: { exercises: { id: string }[] }[];
  } | null;
}

interface ClientDashboardProps {
  firstName: string;
  upcomingSessions: DashboardSession[];
  /** Every session in the calendar window — the week strip slices "this week" out of it. */
  calendarSessions: DashboardSession[];
  weeklyCompliance: number;
  recentAssessments: { id: string; assessmentType: string; value: number; unit: string; createdAt: Date }[];
  currentStreak: number;
  workoutsCompleted: number;
  exercisesCompleted: number;
  minutesExercised: number;
  unreadTrainerMessage: TrainerMessagePreview | null;
  programProgress: ProgramProgressSummary | null;
  resources: QuickResourceItem[];
}

export function ClientDashboard({
  firstName,
  upcomingSessions,
  calendarSessions,
  weeklyCompliance,
  recentAssessments,
  currentStreak,
  workoutsCompleted,
  exercisesCompleted,
  minutesExercised,
  unreadTrainerMessage,
  programProgress,
  resources,
}: ClientDashboardProps) {
  const totalWeekSessions = weeklyCompliance + upcomingSessions.length;
  const compliancePercent =
    totalWeekSessions > 0
      ? Math.min(Math.round((weeklyCompliance / totalWeekSessions) * 100), 100)
      : 0;

  const today = new Date();
  const todayWorkout =
    upcomingSessions.find((s) => isSameLocalDay(new Date(s.scheduledDate), today)) ?? null;
  const nextFutureSession = !todayWorkout && upcomingSessions.length > 0 ? upcomingSessions[0] : null;
  const quote = getDailyQuote(today);

  const weekStripSessions = calendarSessions.map((s) => ({
    id: s.id,
    scheduledDate: s.scheduledDate,
    status: s.status,
    workout: s.workout ? { name: s.workout.name ?? null } : null,
  }));

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Welcome Back, {firstName}!</h1>
        <p className="mt-1 text-muted-foreground">Stay on track with your exercises and progress.</p>
      </div>

      <TrainerMessageBanner message={unreadTrainerMessage} />

      {/* Workout hero — always reflects today (or the next upcoming session) */}
      {todayWorkout ? (
        <div className="relative overflow-hidden rounded-2xl bg-muted p-4 sm:p-6 shadow-sm">
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Badge className="mb-3 border-border bg-background text-foreground text-xs font-medium uppercase tracking-wide">
                Today&apos;s Workout
              </Badge>
              <h2 className="text-xl font-bold text-foreground">{formatDayLabel(todayWorkout.workout)}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatWorkoutMetaLine(
                  todayWorkout.workout?.estimatedMinutes,
                  countExercises(todayWorkout.workout)
                )}
              </p>
            </div>
            <Button
              size="lg"
              className="shrink-0 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold shadow-lg border-0"
              asChild
            >
              <Link href={`/sessions/${todayWorkout.id}`}>
                <Play className="mr-2 h-4 w-4 fill-current" />
                Start Today&apos;s Workout
              </Link>
            </Button>
          </div>
        </div>
      ) : nextFutureSession ? (
        <div className="relative overflow-hidden rounded-2xl bg-muted p-4 sm:p-6 shadow-sm">
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Badge className="mb-3 border-border bg-background text-foreground text-xs font-medium uppercase tracking-wide">
                Next Workout
              </Badge>
              <p className="text-sm font-medium text-muted-foreground">
                {format(toLocalCalendarDate(nextFutureSession.scheduledDate), "EEEE, MMM d")}
              </p>
              <h2 className="text-xl font-bold text-foreground">{formatDayLabel(nextFutureSession.workout)}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatWorkoutMetaLine(
                  nextFutureSession.workout?.estimatedMinutes,
                  countExercises(nextFutureSession.workout)
                )}
              </p>
            </div>
            <Button size="lg" variant="outline" className="shrink-0 font-semibold" asChild>
              <Link href={`/sessions/${nextFutureSession.id}`}>
                View Workout
                <ChevronRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="relative overflow-hidden rounded-2xl bg-muted p-4 sm:p-6 shadow-sm text-center">
          <CalendarX className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
          <h2 className="text-lg font-bold text-foreground">Nothing Scheduled Right Now</h2>
          <p className="mt-2 text-xs text-muted-foreground italic">{quote}</p>
        </div>
      )}

      {/* Two progress readings side by side: the whole-program arc, and this
          week's completion. They answer different questions, so both stay. */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ProgramProgressBar summary={programProgress} />

        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50">
                  <Flame className="h-4.5 w-4.5 text-amber-500" />
                </div>
                <div>
                  <p className="text-sm font-semibold">This Week</p>
                  <p className="text-xs text-muted-foreground">
                    {weeklyCompliance} of {totalWeekSessions} sessions completed
                  </p>
                </div>
              </div>
              <span className="text-2xl font-bold text-primary">{compliancePercent}%</span>
            </div>
            <Progress value={compliancePercent} className="h-2.5" />
            <div className="mt-3 flex justify-between text-xs text-muted-foreground/60">
              <span>Keep it up!</span>
              <span>{totalWeekSessions - weeklyCompliance} remaining</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Primary at-a-glance schedule — the month view now lives at /calendar */}
      <WeekStrip sessions={weekStripSessions} today={today} />

      <QuickResourcesRow resources={resources} />

      {/* Secondary stats row */}
      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: "Workouts Completed", value: exercisesCompleted, emoji: "✅", bg: "bg-violet-50" },
          { label: "Current Streak", value: `${currentStreak} ${currentStreak === 1 ? "day" : "days"}`, emoji: "🔥", bg: "bg-amber-50" },
          { label: "Exercises Completed", value: exercisesCompleted, emoji: "💪", bg: "bg-emerald-50" },
          { label: "Minutes Exercised", value: minutesExercised, emoji: "⏱", bg: "bg-blue-50" },
        ].map((stat) => (
          <Card key={stat.label} className="border-0 ring-1 ring-border/50 shadow-sm">
            <CardContent className="flex items-center gap-4 p-5">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl ${stat.bg}`}>
                {stat.emoji}
              </div>
              <div>
                <p className="text-2xl font-bold leading-none">{stat.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Assessments */}
      {recentAssessments.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4.5 w-4.5 text-primary" />
              <CardTitle className="text-base font-semibold">Recent Assessments</CardTitle>
            </div>
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground" asChild>
              <Link href="/assessments">
                View all <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recentAssessments.slice(0, 4).map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between rounded-xl border border-border/60 p-3"
                >
                  <p className="text-sm font-medium capitalize">
                    {a.assessmentType.replace(/_/g, " ")}
                  </p>
                  <div className="flex items-center gap-3">
                    <p className="text-sm font-bold text-primary">
                      {a.value} <span className="font-normal text-muted-foreground">{a.unit}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">{formatDate(a.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
