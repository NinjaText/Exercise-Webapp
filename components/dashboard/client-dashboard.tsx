"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import {
  CalendarDays,
  CalendarCheck,
  CalendarX,
  Play,
  ChevronRight,
  Flame,
  CheckCircle2,
  Dumbbell,
  Timer,
  ClipboardCheck,
} from "lucide-react";
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
import { DashboardInboxCard } from "@/components/dashboard/dashboard-inbox-card";
import type { getInboxThreads } from "@/lib/services/message.service";

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
  inboxThreads: Awaited<ReturnType<typeof getInboxThreads>>;
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
  inboxThreads,
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
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description={format(today, "EEEE, MMMM d")}
        breadcrumb={[{ label: "Dashboard" }]}
      />

      <TrainerMessageBanner message={unreadTrainerMessage} />

      {/* Up next — always reflects today (or the next upcoming session) */}
      <SectionCard title="Up next" icon={CalendarDays}>
        {todayWorkout ? (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <StatusBadge status="TODAY" role="info" label="TODAY" />
              <h3 className="mt-2 text-lg font-semibold text-foreground">
                {formatDayLabel(todayWorkout.workout)}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatWorkoutMetaLine(
                  todayWorkout.workout?.estimatedMinutes,
                  countExercises(todayWorkout.workout)
                )}
              </p>
            </div>
            <Button size="lg" className="h-11 shrink-0 font-semibold sm:h-9" asChild>
              <Link href={`/sessions/${todayWorkout.id}`}>
                <Play className="mr-2 h-4 w-4 fill-current" />
                Start workout
              </Link>
            </Button>
          </div>
        ) : nextFutureSession ? (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <StatusBadge status="UPCOMING" role="neutral" label="UPCOMING" />
              <p className="mt-2 text-sm font-medium text-muted-foreground">
                {format(toLocalCalendarDate(nextFutureSession.scheduledDate), "EEEE, MMM d")}
              </p>
              <h3 className="text-lg font-semibold text-foreground">
                {formatDayLabel(nextFutureSession.workout)}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatWorkoutMetaLine(
                  nextFutureSession.workout?.estimatedMinutes,
                  countExercises(nextFutureSession.workout)
                )}
              </p>
            </div>
            <Button size="lg" variant="outline" className="h-11 shrink-0 font-semibold sm:h-9" asChild>
              <Link href={`/sessions/${nextFutureSession.id}`}>
                Preview
                <ChevronRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        ) : (
          <EmptyState
            size="compact"
            icon={CalendarX}
            title="Nothing scheduled right now"
            description={quote}
          />
        )}
      </SectionCard>

      {/* Two progress readings side by side: the whole-program arc, and this
          week's completion. They answer different questions, so both stay. */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ProgramProgressBar summary={programProgress} />

        <SectionCard title="This week" icon={CalendarCheck}>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {weeklyCompliance} of {totalWeekSessions} sessions completed
            </p>
            <span className="text-2xl font-bold text-primary">{compliancePercent}%</span>
          </div>
          <Progress value={compliancePercent} className="h-2.5" />
          <div className="mt-3 flex justify-between text-xs text-muted-foreground/60">
            <span>Keep it up!</span>
            <span>{totalWeekSessions - weeklyCompliance} remaining</span>
          </div>
        </SectionCard>
      </div>

      {/* Primary at-a-glance schedule — the month view now lives at /calendar */}
      <WeekStrip sessions={weekStripSessions} today={today} />

      <QuickResourcesRow resources={resources} />

      <DashboardInboxCard threads={inboxThreads} />

      {/* Secondary stats row */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard
          size="compact"
          label="Current streak"
          value={`${currentStreak} ${currentStreak === 1 ? "day" : "days"}`}
          icon={Flame}
          role="warning"
        />
        <StatCard
          size="compact"
          label="Workouts completed"
          value={workoutsCompleted}
          icon={CheckCircle2}
          role="success"
        />
        <StatCard
          size="compact"
          label="Exercises completed"
          value={exercisesCompleted}
          icon={Dumbbell}
          role="info"
        />
        <StatCard
          size="compact"
          label="Minutes exercised"
          value={minutesExercised}
          icon={Timer}
          role="neutral"
        />
      </div>

      {/* Recent Assessments */}
      {recentAssessments.length > 0 && (
        <SectionCard
          title="Assessments"
          icon={ClipboardCheck}
          action={{ label: "View all", href: "/assessments" }}
        >
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
        </SectionCard>
      )}
    </div>
  );
}
