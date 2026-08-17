"use client";

import { useState, useMemo } from "react";
import { WorkoutSessionTracker } from "./workout-session-tracker";
import { WorkoutChecklistTracker } from "./workout-checklist-tracker";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ClipboardList, Zap, ChevronRight, Dumbbell } from "lucide-react";
import type { SetLogEntry, SetLogCache } from "./types";
import { aggregateProgramEquipment } from "@/lib/utils/program-equipment";

type Mode = "pick" | "checklist" | "session";

interface Props {
  session: any;
  initialMode?: "checklist" | "session";
}

function isCircuitBlock(type: string) {
  const t = type.toUpperCase();
  return t === "CIRCUIT" || t === "SUPERSET" || t === "WARMUP" || t === "COOLDOWN";
}

export function WorkoutModeWrapper({ session, initialMode }: Props) {
  const [mode, setMode] = useState<Mode>(initialMode ?? "pick");

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
  const totalExercises = (session.workout?.blocks ?? []).reduce(
    (n: number, b: any) => n + (b.exercises?.length ?? 0),
    0
  );
  const isReturning = session.status === "IN_PROGRESS";
  const alreadyDone = sharedCompleted.size;

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div className="overflow-hidden rounded-2xl bg-muted p-6 shadow-sm">
        <div className="relative">
          {isReturning && (
            <Badge variant="outline" className="mb-3 text-xs">
              {alreadyDone > 0 ? `${alreadyDone} exercises done — continuing` : "In Progress"}
            </Badge>
          )}
          <h2 className="text-2xl font-bold text-foreground">{session.workout?.name ?? "Workout"}</h2>
          <p className="mt-1 text-muted-foreground text-sm">{totalExercises} exercises</p>
          {equipment.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <Dumbbell className="h-3.5 w-3.5 text-muted-foreground/70" />
              {equipment.map((item) => (
                <Badge key={item} variant="secondary" className="text-[11px] font-medium">
                  {item}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      <h3 className="text-center text-lg font-bold text-foreground">
        Select Your Workout Experience
      </h3>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setMode("checklist")}
          className="group flex flex-col rounded-2xl border-2 border-border/60 bg-card p-5 text-left shadow-sm transition-all hover:border-emerald-400 hover:bg-emerald-50/60 hover:shadow-lg hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 group-hover:bg-emerald-200 transition-colors">
            <ClipboardList className="h-5 w-5 text-emerald-600" />
          </div>
          <p className="font-semibold text-sm">Quick Checklist</p>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            Check off exercises as you go. Great for gym sessions.
          </p>
          <div className="mt-4 flex items-center gap-1 text-xs font-medium text-emerald-600">
            Start <ChevronRight className="h-3 w-3" />
          </div>
        </button>

        <button
          type="button"
          onClick={() => setMode("session")}
          className="group flex flex-col rounded-2xl border-2 border-border/60 bg-card p-5 text-left shadow-sm transition-all hover:border-blue-400 hover:bg-blue-50/60 hover:shadow-lg hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 group-hover:bg-blue-200 transition-colors">
            <Zap className="h-5 w-5 text-blue-600" />
          </div>
          <p className="font-semibold text-sm">Guided Workout</p>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            Guided step-by-step with timers and set logging.
          </p>
          <div className="mt-4 flex items-center gap-1 text-xs font-medium text-blue-600">
            Start <ChevronRight className="h-3 w-3" />
          </div>
        </button>
      </div>

      <Card className="border-0 shadow-sm ring-1 ring-border/50">
        <CardContent className="p-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Today&apos;s Workout</p>
          {(session.workout?.blocks ?? []).map((block: any) => (
            <div key={block.id} className="flex items-center gap-3 rounded-lg bg-muted/40 px-3 py-2">
              <span className="text-sm font-medium truncate flex-1">{block.name || block.type}</span>
              {block.rounds > 1 && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
                  {block.rounds} rounds
                </Badge>
              )}
              <span className="text-xs text-muted-foreground shrink-0">{block.exercises?.length ?? 0} ex.</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
