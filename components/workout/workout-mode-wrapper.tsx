"use client";

import { useState, useMemo, useEffect } from "react";
import { WorkoutSessionTracker, isSessionStartable, isEarlyStart } from "./workout-session-tracker";
import { WorkoutChecklistTracker } from "./workout-checklist-tracker";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ClipboardList, Zap, ChevronRight, Dumbbell, type LucideIcon } from "lucide-react";
import type { SetLogEntry, SetLogCache } from "./types";
import { aggregateProgramEquipment } from "@/lib/utils/program-equipment";
import { formatDate } from "@/lib/utils/formatting";
import { toLocalCalendarDate } from "@/lib/utils/calendar-date";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { WORKOUT_STATE } from "./workout-tokens";

type Mode = "pick" | "checklist" | "session";

/** The slice of a workout block the mode picker summarises. */
type PickerBlock = {
  id: string;
  type: string;
  name?: string | null;
  rounds?: number | null;
  exercises?: { id: string }[];
};

interface Props {
  // The raw Prisma include from the session page; each tracker narrows it to
  // its own WorkoutSessionV2 shape.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  session: any;
  initialMode?: "checklist" | "session";
}

function isCircuitBlock(type: string) {
  const t = type.toUpperCase();
  return t === "CIRCUIT" || t === "SUPERSET" || t === "WARMUP" || t === "COOLDOWN";
}

export function WorkoutModeWrapper({ session, initialMode }: Props) {
  const [mode, setMode] = useState<Mode>("pick");
  const [pendingMode, setPendingMode] = useState<Exclude<Mode, "pick"> | null>(null);
  const [showEarlyStartConfirm, setShowEarlyStartConfirm] = useState(false);

  function enterMode(next: Exclude<Mode, "pick">) {
    if (isSessionStartable(session.status) && isEarlyStart(session.scheduledDate)) {
      setPendingMode(next);
      setShowEarlyStartConfirm(true);
    } else {
      setMode(next);
    }
  }

  useEffect(() => {
    if (initialMode) enterMode(initialMode);
    // Intentionally runs once on mount only — initialMode is a fixed prop for this component's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cache of set-level logs accumulated across both modes this session.
  // blockExerciseId -> setIndex -> entry
  const [setLogCache, setSetLogCache] = useState<SetLogCache>(() => {
    const cache: SetLogCache = {};
    for (const log of session.exerciseLogs ?? []) {
      for (const sl of log.setLogs ?? []) {
        if (!cache[log.blockExerciseId]) cache[log.blockExerciseId] = {};
        cache[log.blockExerciseId][sl.setIndex] = {
          actualReps: sl.actualReps ?? undefined,
          actualWeight: sl.actualWeight ?? undefined,
          actualDuration: sl.actualDuration ?? undefined,
          actualDistance: sl.actualDistance ?? undefined,
          actualRPE: sl.actualRPE ?? undefined,
          completed: true,
        };
      }
    }
    return cache;
  });

  // Number of prescribed sets per blockExerciseId (used to derive completion).
  const setCountMap = useMemo<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    for (const block of session.workout?.blocks ?? []) {
      const circuit = isCircuitBlock(block.type);
      for (const ex of block.exercises ?? []) {
        map[ex.id] = circuit ? Math.max(1, block.rounds ?? 1) : (ex.sets?.length ?? 0);
      }
    }
    return map;
  }, [session.workout?.blocks]);

  // Derive the set of fully-completed blockExerciseIds from the cache.
  const sharedCompleted = useMemo<Set<string>>(() => {
    const s = new Set<string>();
    // Legacy: exercises marked COMPLETED via markExerciseDoneAction
    for (const log of session.exerciseLogs ?? []) {
      if (log.status === "COMPLETED") s.add(log.blockExerciseId);
    }
    // New: exercises whose every prescribed set appears in the cache as completed
    for (const [id, sets] of Object.entries(setLogCache)) {
      const total = setCountMap[id] ?? 0;
      if (total === 0) continue;
      const allDone = Array.from({ length: total }, (_, i) => i).every(
        (i) => sets[i]?.completed
      );
      if (allDone) s.add(id);
    }
    return s;
  }, [session.exerciseLogs, setLogCache, setCountMap]);

  function handleSetLogged(
    blockExerciseId: string,
    setIndex: number,
    data: SetLogEntry
  ) {
    setSetLogCache((prev) => ({
      ...prev,
      [blockExerciseId]: { ...(prev[blockExerciseId] ?? {}), [setIndex]: data },
    }));
  }

  const equipment = useMemo(
    () => aggregateProgramEquipment(session.workout ? [session.workout] : []),
    [session.workout]
  );

  if (mode === "checklist") {
    return (
      <WorkoutChecklistTracker
        session={session}
        onSwitchMode={() => setMode("session")}
        additionalCompleted={sharedCompleted}
        setLogCache={setLogCache}
        onSetLogged={handleSetLogged}
      />
    );
  }

  if (mode === "session") {
    return (
      <WorkoutSessionTracker
        session={session}
        onSwitchMode={() => setMode("checklist")}
        additionalCompleted={sharedCompleted}
        setLogCache={setLogCache}
        onSetLogged={handleSetLogged}
      />
    );
  }

  // ── Mode picker ──────────────────────────────────────────────────────────
  const blocks: PickerBlock[] = session.workout?.blocks ?? [];
  const totalExercises = blocks.reduce(
    (n, b) => n + (b.exercises?.length ?? 0),
    0
  );
  const isReturning = session.status === "IN_PROGRESS";
  const alreadyDone = sharedCompleted.size;

  return (
    <div className="flex w-full flex-col gap-6">
      {/* The page header already names the workout; this summary answers
          "what am I in for" before the client picks how to train. */}
      <Card>
        <CardContent className="flex flex-col gap-3">
          {isReturning && (
            <Badge variant="outline" className="w-fit">
              {alreadyDone > 0 ? `${alreadyDone} exercises done — continuing` : "In Progress"}
            </Badge>
          )}
          <p className="text-heading text-foreground">
            {totalExercises} exercises
            {blocks.length > 1 && (
              <span className="font-normal text-muted-foreground"> · {blocks.length} blocks</span>
            )}
          </p>
          {equipment.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <Dumbbell className="size-3.5 text-muted-foreground" aria-hidden />
              {equipment.map((item) => (
                <Badge key={item} variant="secondary">
                  {item}
                </Badge>
              ))}
            </div>
          )}
          {blocks.length > 0 && (
            <ul className="mt-1 divide-y divide-border overflow-hidden rounded-lg border border-border">
              {blocks.map((block) => (
                <li key={block.id} className="flex min-h-11 items-center gap-3 bg-surface-muted/50 px-3 py-2">
                  <span className="flex-1 truncate text-label text-foreground">{block.name || block.type}</span>
                  {(block.rounds ?? 0) > 1 && (
                    <Badge variant="secondary" className="shrink-0">
                      {block.rounds} rounds
                    </Badge>
                  )}
                  <span className="shrink-0 text-caption tabular-nums">{block.exercises?.length ?? 0} ex.</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <section aria-labelledby="workout-mode-heading" className="flex flex-col gap-3">
        <h2 id="workout-mode-heading" className="text-heading text-foreground">
          Choose how to train
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ModeOption
            onClick={() => enterMode("checklist")}
            icon={ClipboardList}
            tone={WORKOUT_STATE.completed}
            title="Quick Checklist"
            description="Check off exercises as you go. Great for gym sessions."
          />
          <ModeOption
            onClick={() => enterMode("session")}
            icon={Zap}
            tone={WORKOUT_STATE.current}
            title="Guided Workout"
            description="Guided step-by-step with timers and set logging."
          />
        </div>
      </section>

      <ConfirmDialog
        open={showEarlyStartConfirm}
        onOpenChange={setShowEarlyStartConfirm}
        title="Start early?"
        description={`This workout is scheduled for ${formatDate(toLocalCalendarDate(session.scheduledDate))}. Start it today instead?`}
        confirmLabel="Start Today"
        cancelLabel="Cancel"
        onConfirm={() => {
          setShowEarlyStartConfirm(false);
          if (pendingMode) setMode(pendingMode);
        }}
      />
    </div>
  );
}

/**
 * One mode choice: a full-width card on phones (comfortably over the 44px
 * target), side by side from `sm`. Calm hover — border and shadow only.
 */
function ModeOption({
  onClick,
  icon: Icon,
  tone,
  title,
  description,
}: {
  onClick: () => void;
  icon: LucideIcon;
  tone: { soft: string; text: string };
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center gap-4 rounded-xl border border-border bg-surface p-4 text-left shadow-xs outline-none transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none sm:flex-col sm:items-start sm:gap-3 sm:p-5"
    >
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${tone.soft}`}>
        <Icon className={`size-5 ${tone.text}`} aria-hidden />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-heading text-foreground">{title}</span>
        <span className="text-caption">{description}</span>
      </span>
      <ChevronRight
        className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none sm:hidden"
        aria-hidden
      />
      <span className={`hidden items-center gap-1 text-label sm:flex ${tone.text}`}>
        Start <ChevronRight className="size-3.5" aria-hidden />
      </span>
    </button>
  );
}
