"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatCard } from "@/components/shared/stat-card";
import { EmptyState } from "@/components/shared/empty-state";
import {
  CalendarDays,
  CalendarX,
  Play,
  ChevronRight,
  Flame,
  CheckCircle2,
  Dumbbell,
  Timer,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toLocalCalendarDate } from "@/lib/utils/calendar-date";
import { getDailyQuote } from "@/lib/constants/motivation";
import {
  countExercises,
  formatDayLabel,
  formatWorkoutMetaLine,
} from "@/lib/utils/workout-format";
import { isVideoWorkout } from "@/lib/utils/follow-along";
import { TrainerMessageBanner, type TrainerMessagePreview } from "./trainer-message-banner";
import { WeekStrip } from "./week-strip";
import { QuickResourcesList, type QuickResourceItem } from "./quick-resources-list";
import { DashboardInboxCard } from "@/components/dashboard/dashboard-inbox-card";
import { CoachingCard } from "@/components/dashboard/coaching-card";
import {
  TodaysReflectionCard,
  type TodaysReflectionCardData,
} from "@/components/dashboard/todays-reflection-card";
import type { CoachingViewModel } from "@/lib/clubs/coaching-view";
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
    /** Follow-along video day — meta reads "Follow-along · N min" and the CTA "Start session". */
    videoUrl?: string | null;
    videoDurationSec?: number | null;
    program?: { contentFormat?: string | null } | null;
    blocks: { exercises: { id: string }[] }[];
  } | null;
}

interface ClientDashboardProps {
  firstName: string;
  upcomingSessions: DashboardSession[];
  /** Every session in the calendar window — the week strip slices "this week" out of it. */
  calendarSessions: DashboardSession[];
  currentStreak: number;
  workoutsCompleted: number;
  exercisesCompleted: number;
  minutesExercised: number;
  unreadTrainerMessage: TrainerMessagePreview | null;
  resources: QuickResourceItem[];
  inboxThreads: Awaited<ReturnType<typeof getInboxThreads>>;
  /** False for orgs without messaging (clubs): no Inbox card, no trainer banner. */
  showInbox?: boolean;
  /** Club members only, and only when the club offers coaching; null/absent renders no card. */
  coaching?: CoachingViewModel | null;
  /** Today's Reflection card (sits between Up next and Resources/Inbox); null/absent renders nothing. */
  todaysReflection?: TodaysReflectionCardData | null;
}

/**
 * One screen, top to bottom: the stats that answer "how am I doing", the single
 * action that matters today, then Resources and Inbox side by side, with this
 * week's schedule closing the page.
 */
export function ClientDashboard({
  firstName,
  upcomingSessions,
  calendarSessions,
  currentStreak,
  workoutsCompleted,
  exercisesCompleted,
  minutesExercised,
  unreadTrainerMessage,
  resources,
  inboxThreads,
  showInbox = true,
  coaching = null,
  todaysReflection = null,
}: ClientDashboardProps) {
  const today = new Date();
  const todayWorkout =
    upcomingSessions.find((s) => isSameLocalDay(new Date(s.scheduledDate), today)) ?? null;
  const nextFutureSession = !todayWorkout && upcomingSessions.length > 0 ? upcomingSessions[0] : null;
  const quote = getDailyQuote(today);

  const weekStripSessions = calendarSessions.map((s) => ({
    id: s.id,
    scheduledDate: s.scheduledDate,
    status: s.status,
    workout: s.workout
      ? { name: s.workout.name ?? null, videoUrl: s.workout.videoUrl, videoDurationSec: s.workout.videoDurationSec }
      : null,
  }));

  // With no Resources the card renders nothing, so the two-column split would
  // strand the Inbox at half width — drop to a single column instead.
  const hasResources = resources.length > 0;
  const pairResourcesWithInbox = hasResources && showInbox;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description={format(today, "EEEE, MMMM d")}
        breadcrumb={[{ label: "Dashboard" }]}
      />

      {showInbox && <TrainerMessageBanner message={unreadTrainerMessage} />}

      {coaching && <CoachingCard coaching={coaching} />}

      {/* Lifetime totals — paired on phones, one row from tablet up */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
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

      {/* Up next — always reflects today (or the next upcoming session) */}
      {todayWorkout ? (
        <UpNextHero
          eyebrow="Today"
          title={formatDayLabel(todayWorkout.workout)}
          meta={formatWorkoutMetaLine(
            todayWorkout.workout?.estimatedMinutes,
            countExercises(todayWorkout.workout),
            todayWorkout.workout
          )}
          href={`/sessions/${todayWorkout.id}`}
          action={
            <>
              <Play className="mr-2 size-4 fill-current" />
              {isVideoWorkout(todayWorkout.workout) ? "Start session" : "Start workout"}
            </>
          }
        />
      ) : nextFutureSession ? (
        <UpNextHero
          eyebrow={format(toLocalCalendarDate(nextFutureSession.scheduledDate), "EEEE, MMM d")}
          title={formatDayLabel(nextFutureSession.workout)}
          meta={formatWorkoutMetaLine(
            nextFutureSession.workout?.estimatedMinutes,
            countExercises(nextFutureSession.workout),
            nextFutureSession.workout
          )}
          href={`/sessions/${nextFutureSession.id}`}
          action={
            <>
              Preview
              <ChevronRight className="ml-2 size-4" />
            </>
          }
        />
      ) : (
        <SectionCard title="Up next" icon={CalendarDays}>
          <EmptyState
            size="compact"
            icon={CalendarX}
            title="Nothing scheduled right now"
            description={quote}
          />
        </SectionCard>
      )}

      {todaysReflection && <TodaysReflectionCard data={todaysReflection} />}

      {/* What the client can pull on their own, next to what's waiting for them.
          Both cards take `h-full` so the column stretch gives them a matching
          height whichever one has more rows. */}
      <div className={cn("grid gap-6", pairResourcesWithInbox && "lg:grid-cols-2")}>
        <QuickResourcesList resources={resources} className="h-full" />
        {showInbox && <DashboardInboxCard threads={inboxThreads} className="h-full" />}
      </div>

      {/* Primary at-a-glance schedule — the month view lives at /calendar */}
      <WeekStrip sessions={weekStripSessions} today={today} />
    </div>
  );
}

/**
 * The client's next workout, set apart from the rest of the dashboard as a
 * filled brand-blue panel so it reads as the one thing to act on. Gradient
 * stops derive from --primary, so org branding recolours it automatically.
 */
function UpNextHero({
  eyebrow,
  title,
  meta,
  href,
  action,
}: {
  eyebrow: string;
  title: string;
  meta: string;
  href: string;
  action: ReactNode;
}) {
  return (
    <section
      aria-label="Up next"
      className="relative isolate overflow-hidden rounded-2xl bg-primary bg-[linear-gradient(135deg,var(--primary),color-mix(in_oklch,var(--primary),black_28%))] p-5 text-primary-foreground shadow-lg shadow-primary/25 ring-1 ring-primary/40 duration-500 animate-in fade-in slide-in-from-bottom-3 motion-reduce:animate-none sm:p-6"
    >
      {/* Soft light blooms + a faint watermark, purely decorative */}
      <div aria-hidden className="pointer-events-none absolute -top-24 -right-16 -z-10 size-72 rounded-full bg-primary-foreground/10 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-28 left-1/3 -z-10 size-64 rounded-full bg-primary-foreground/5 blur-3xl" />
      <Dumbbell aria-hidden className="pointer-events-none absolute right-6 -bottom-6 -z-10 hidden size-40 -rotate-12 text-primary-foreground/[0.07] sm:block" />

      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-caption font-semibold tracking-wide text-primary-foreground/80 uppercase">
            <CalendarDays className="size-4" aria-hidden />
            Up next
            <span aria-hidden className="text-primary-foreground/40">•</span>
            <span className="normal-case tracking-normal">{eyebrow}</span>
          </p>
          <h2 className="mt-2 text-title text-primary-foreground sm:text-display">{title}</h2>
          <p className="mt-1 text-body text-primary-foreground/80">{meta}</p>
        </div>
        <Button
          size="lg"
          variant="outline"
          className="h-11 w-full shrink-0 border-transparent bg-primary-foreground font-semibold text-primary shadow-md hover:bg-primary-foreground/90 hover:text-primary sm:h-10 sm:w-auto"
          asChild
        >
          <Link href={href}>{action}</Link>
        </Button>
      </div>
    </section>
  );
}
