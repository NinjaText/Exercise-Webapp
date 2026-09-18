"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  CalendarDays,
  ChevronRight,
  Clock,
  Dumbbell,
  Library,
  Lightbulb,
  Play,
  X,
} from "lucide-react";
import { toLocalCalendarDate } from "@/lib/utils/calendar-date";
import { getProgramSchedulingType } from "@/lib/utils/program-scheduling";
import { getProgramCategoryVisual } from "@/lib/utils/program-visual";
import { formatWorkoutMetaLine } from "@/lib/utils/workout-format";
import { getDailyQuickTip } from "@/lib/constants/motivation";
import type { ProgramProgress } from "@/lib/services/program.service";

export type ClientProgramsTab = "programs" | "resources";

export interface ClientProgramCard {
  id: string;
  name: string;
  description: string | null;
  status: string;
  schedulingType: string | null;
  startDate: Date | null;
  durationWeeks: number | null;
  tags: string[];
  activities: string[];
  goals: string[];
  bodyAreas: string[];
  workouts: { id: string; name: string }[];
  _count: { workouts: number };
  /** Week X of Y, precomputed server-side via computeProgramWeek. */
  week: { current: number; total: number } | null;
}

interface Props {
  programs: ClientProgramCard[];
  progressByProgramId: Record<string, ProgramProgress>;
  initialTab: ClientProgramsTab;
}

/**
 * The client's own "My Programs" surface — a card list, not the trainer's
 * table. Split out of program-list-client.tsx so the trainer's dense
 * table/filter machinery no longer has to carry client-role conditionals.
 */
export function ClientProgramsView({ programs, progressByProgramId, initialTab }: Props) {
  const [tab, setTab] = useState<ClientProgramsTab>(initialTab);

  const { scheduled, resources } = useMemo(() => {
    const scheduled: ClientProgramCard[] = [];
    const resources: ClientProgramCard[] = [];
    for (const program of programs) {
      if (getProgramSchedulingType(program) === "ON_DEMAND") resources.push(program);
      else scheduled.push(program);
    }
    return { scheduled, resources };
  }, [programs]);

  return (
    <Tabs
      value={tab}
      onValueChange={(v) => setTab(v as ClientProgramsTab)}
      className="gap-6"
    >
      <PageHeader
        title="My Programs"
        description={`You have ${scheduled.length} ${
          scheduled.length === 1 ? "program" : "programs"
        } assigned.`}
        tabs={
          <TabsList variant="line">
            <TabsTrigger value="programs">Programs ({scheduled.length})</TabsTrigger>
            <TabsTrigger value="resources">Resources ({resources.length})</TabsTrigger>
          </TabsList>
        }
      />

      {tab === "programs" ? (
        <ProgramsTab programs={scheduled} progressByProgramId={progressByProgramId} />
      ) : (
        <ResourcesTab resources={resources} />
      )}
    </Tabs>
  );
}

// ---------------------------------------------------------------- Programs

function ProgramsTab({
  programs,
  progressByProgramId,
}: {
  programs: ClientProgramCard[];
  progressByProgramId: Record<string, ProgramProgress>;
}) {
  if (programs.length === 0) {
    return (
      <ClientEmptyState
        title="No programs yet"
        description="When your trainer assigns you a program, it will appear here."
      />
    );
  }

  // Only one "Continue" button on the page is filled — the first program (in
  // list order) that actually has an upcoming workout to continue is "current".
  const currentProgramId =
    programs.find((p) => progressByProgramId[p.id]?.nextSession)?.id ?? null;

  return (
    <div className="space-y-4">
      <QuickTipCallout />
      {programs.map((program) => (
        <ScheduledProgramCard
          key={program.id}
          program={program}
          progress={progressByProgramId[program.id]}
          isCurrent={program.id === currentProgramId}
        />
      ))}
    </div>
  );
}

function ScheduledProgramCard({
  program,
  progress,
  isCurrent,
}: {
  program: ClientProgramCard;
  progress?: ProgramProgress;
  isCurrent: boolean;
}) {
  const { icon: Icon, label: categoryLabel } = getProgramCategoryVisual(program);
  const completed = progress?.completed ?? 0;
  const total = progress?.total ?? 0;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  const next = progress?.nextSession ?? null;

  return (
    <div className="rounded-2xl ring-1 ring-border bg-card p-4 shadow-none sm:p-5">
      <div className="flex items-start gap-3.5">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/programs/${program.id}`}
              className="truncate text-base font-semibold hover:text-primary hover:underline"
            >
              {program.name}
            </Link>
            <StatusBadge status={program.status} size="sm" />
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {categoryLabel} · {program._count.workouts}{" "}
            {program._count.workouts === 1 ? "workout" : "workouts"}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between text-xs">
          {program.week ? (
            <StatusBadge
              status="week"
              role="info"
              dot={false}
              label={`Week ${program.week.current} of ${program.week.total}`}
            />
          ) : (
            <span className="font-medium">Progress</span>
          )}
          <span className="text-muted-foreground">
            {completed} of {total} workouts · {percent}%
          </span>
        </div>
        <Progress value={percent} className="h-2" />
      </div>

      <div className="mt-4 flex flex-col gap-3 rounded-xl border border-border/60 bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
        {next ? (
          <>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Next Workout
              </p>
              <p className="truncate text-sm font-semibold">{next.workoutName}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {format(toLocalCalendarDate(next.scheduledDate), "EEE, MMM d")}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {formatWorkoutMetaLine(next.estimatedMinutes, next.exerciseCount)}
                </span>
              </p>
            </div>
            <Button
              variant={isCurrent ? "default" : "outline"}
              className="h-11 shrink-0 font-semibold sm:h-9"
              asChild
            >
              <Link href={`/sessions/${next.sessionId}`}>
                <Play className="mr-2 h-4 w-4 fill-current" />
                Continue Workout
              </Link>
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {total > 0 && completed >= total
                ? "You've finished every workout in this program. Nice work."
                : "No upcoming workouts scheduled."}
            </p>
            <Button variant="outline" className="shrink-0 font-semibold" asChild>
              <Link href={`/programs/${program.id}`}>
                View Program
                <ChevronRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

// --------------------------------------------------------------- Resources

function ResourcesTab({ resources }: { resources: ClientProgramCard[] }) {
  if (resources.length === 0) {
    return (
      <ClientEmptyState
        title="No resources yet"
        description="Resources are anytime routines — warm-ups, mobility, recovery — that your trainer can share with you."
      />
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {resources.map((resource) => (
        <ResourceCard key={resource.id} resource={resource} />
      ))}
    </div>
  );
}

function ResourceCard({ resource }: { resource: ClientProgramCard }) {
  const { icon: Icon, label } = getProgramCategoryVisual(resource);

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-foreground">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <Link
            href={`/programs/${resource.id}`}
            className="block truncate text-sm font-semibold hover:text-primary hover:underline"
          >
            {resource.name}
          </Link>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <Dumbbell className="h-3.5 w-3.5" />
            {label} · {resource._count.workouts}{" "}
            {resource._count.workouts === 1 ? "workout" : "workouts"}
          </p>
        </div>
      </div>

      {resource.description && (
        <p className="line-clamp-2 text-xs text-muted-foreground">{resource.description}</p>
      )}

      <Button size="sm" variant="outline" className="mt-auto w-full font-semibold" asChild>
        <Link href={`/programs/${resource.id}`}>
          View Resource
          <ChevronRight className="ml-1.5 h-3.5 w-3.5" />
        </Link>
      </Button>
    </div>
  );
}

// ------------------------------------------------------------------ Shared

const QUICK_TIP_STORAGE_PREFIX = "rehabai.quickTip.dismissed.";

/**
 * localStorage is an external store, so it's read through
 * useSyncExternalStore rather than an effect: the repo lints synchronous
 * setState inside effects as an error, and this also gives React a proper
 * server snapshot so hydration never mismatches.
 */
const tipDismissalListeners = new Set<() => void>();
/** Fallback for browsers where localStorage throws — dismissal still holds for the session. */
const tipsDismissedThisSession = new Set<string>();

function subscribeToTipDismissals(onChange: () => void): () => void {
  tipDismissalListeners.add(onChange);
  return () => {
    tipDismissalListeners.delete(onChange);
  };
}

function readTipDismissed(key: string): boolean {
  if (tipsDismissedThisSession.has(key)) return true;
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    // Private mode / blocked storage: show the tip rather than hiding it.
    return false;
  }
}

/**
 * Rotating, dismissible coaching tip. Dismissal is per-tip and lives in
 * localStorage rather than the schema — it's a UI preference, not data the
 * trainer or any other device needs to see.
 */
function QuickTipCallout() {
  const tip = getDailyQuickTip();
  const storageKey = QUICK_TIP_STORAGE_PREFIX + tip.id;

  const dismissed = useSyncExternalStore(
    subscribeToTipDismissals,
    () => readTipDismissed(storageKey),
    // Server render (and the hydrating render) can't know what this browser
    // stored, so assume dismissed — the tip fades in rather than flashing out.
    () => true
  );

  function dismiss() {
    tipsDismissedThisSession.add(storageKey);
    try {
      window.localStorage.setItem(storageKey, "1");
    } catch {
      // Dismissal simply won't persist across reloads; not worth surfacing.
    }
    for (const listener of tipDismissalListeners) listener();
  }

  if (dismissed) return null;

  return (
    <div className="flex items-start gap-3 rounded-xl border border-warning-border bg-warning-soft p-3 text-sm">
      <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-warning-foreground" />
      <p className="flex-1 text-muted-foreground">
        <span className="font-medium text-foreground">Quick tip.</span> {tip.text}
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss tip"
        className="shrink-0 rounded-md p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function ClientEmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border p-12 text-center">
      <Library className="mx-auto h-12 w-12 text-muted-foreground/40" />
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
