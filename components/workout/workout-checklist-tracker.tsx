"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  updateSetLogV2Action,
  completeSessionV2Action,
  updateExerciseActualSetsAction,
  updateExerciseClientNoteAction,
  markExerciseDoneAction,
} from "@/actions/session-v2-actions";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ExerciseVideoPlayer } from "@/components/exercises/exercise-video-player";
import {
  Check, Trophy, Loader2, ChevronDown, ChevronUp, ChevronRight,
  AlertCircle, Plus, X, Dumbbell, PlayCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SetLogEntry, SetLogCache } from "./types";
import { instructionsToBullets } from "./format-instructions";
import { formatBodyRegion } from "@/lib/utils/formatting";
import { VoiceMemoRecorder } from "@/components/voice-memo/VoiceMemoRecorder";
import { getWorkoutVoiceMemos } from "@/actions/voice-memo-actions";
import type { VoiceMemoData } from "@/actions/voice-memo-actions";

// ── Types ─────────────────────────────────────────────────────────────────────
type MediaItem = { id: string; url: string; type: string };
type BaseExercise = {
  id: string;
  name: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  bodyRegion?: string[] | null;
  instructions?: string | null;
  media: MediaItem[];
};
type BlockExerciseSet = {
  id: string;
  orderIndex: number;
  targetReps?: number | null;
  targetDuration?: number | null;
  targetDurationUnit?: string | null;
  targetWeight?: number | null;
  targetRPE?: number | null;
  restAfter?: number | null;
};
type SessionExerciseLog = {
  id: string;
  blockExerciseId: string;
  status: string;
  actualSets?: number | null;
  clientNote?: string | null;
  setLogs: { id: string; setIndex: number; actualReps?: number | null; actualWeight?: number | null; actualDuration?: number | null }[];
};
type BlockExercise = {
  id: string;
  exerciseId: string;
  notes?: string | null;
  exercise: BaseExercise;
  sets: BlockExerciseSet[];
};
type WorkoutBlock = {
  id: string;
  type: string;
  rounds: number;
  restBetweenRounds?: number | null;
  name?: string | null;
  exercises: BlockExercise[];
};
type WorkoutSessionV2 = {
  id: string;
  status: string;
  workout: { id: string; name: string; blocks: WorkoutBlock[] };
  exerciseLogs: SessionExerciseLog[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function isCircuitBlock(type: string) {
  const t = type.toUpperCase();
  return t === "CIRCUIT" || t === "SUPERSET" || t === "WARMUP" || t === "COOLDOWN";
}

function getPrescriptionText(ex: BlockExercise, block: WorkoutBlock): string {
  const isCircuit = isCircuitBlock(block.type);
  const rounds = isCircuit ? block.rounds : 1;
  const set = ex.sets[0];
  if (!set) return "";
  const setsLabel = isCircuit
    ? `${rounds} ${rounds === 1 ? "set" : "sets"}`
    : `${ex.sets.length} ${ex.sets.length === 1 ? "set" : "sets"}`;
  if (set.targetReps) return `${setsLabel} × ${set.targetReps} reps`;
  if (set.targetDuration) return `${setsLabel} × ${set.targetDuration}${set.targetDurationUnit === "MIN" ? "min" : "s"}`;
  return setsLabel;
}

function getSetCount(ex: BlockExercise, block: WorkoutBlock): number {
  return isCircuitBlock(block.type) ? Math.max(1, block.rounds ?? 1) : ex.sets.length;
}

function getExerciseStatus(
  blockExerciseId: string,
  setCount: number,
  logs: SetLogCache
): "pending" | "partial" | "complete" {
  if (setCount === 0) return "complete";
  const exLogs = logs[blockExerciseId];
  if (!exLogs) return "pending";
  const completedCount = Object.values(exLogs).filter((l) => l.completed).length;
  if (completedCount === 0) return "pending";
  if (completedCount >= setCount) return "complete";
  return "partial";
}

const SKIP_REASONS = ["Too painful", "Too difficult", "No equipment", "Too tired", "Other"] as const;

// ── Component ─────────────────────────────────────────────────────────────────
interface Props {
  session: WorkoutSessionV2;
  onSwitchMode: () => void;
  additionalCompleted?: Set<string>;
  setLogCache?: SetLogCache;
  onSetLogged?: (blockExerciseId: string, setIndex: number, data: SetLogEntry) => void;
}

export function WorkoutChecklistTracker({
  session,
  onSwitchMode,
  additionalCompleted,
  setLogCache: externalCache,
  onSetLogged,
}: Props) {
  const router = useRouter();

  // ── Set log state ──────────────────────────────────────────────────────────
  const [exerciseSetLogs, setExerciseSetLogs] = useState<SetLogCache>(() => {
    const result: SetLogCache = {};
    for (const log of session.exerciseLogs) {
      for (const sl of log.setLogs) {
        if (!result[log.blockExerciseId]) result[log.blockExerciseId] = {};
        result[log.blockExerciseId][sl.setIndex] = {
          actualReps: sl.actualReps ?? undefined,
          actualWeight: sl.actualWeight ?? undefined,
          actualDuration: sl.actualDuration ?? undefined,
          completed: true,
        };
      }
    }
    // Merge external cache (set in session mode before switching here)
    if (externalCache) {
      for (const [id, sets] of Object.entries(externalCache)) {
        result[id] = { ...(result[id] ?? {}), ...sets };
      }
    }
    return result;
  });

  // Pending input values (before the user taps "Done")
  const [pendingInputs, setPendingInputs] = useState<
    Record<string, { actualReps?: number; actualWeight?: number; actualDuration?: number; actualRPE?: number }>
  >({});

  // Keys of sets where the user clicked "Skip Exercise" — value is the typed "Other" reason
  const [pendingSkips, setPendingSkips] = useState<Record<string, string>>({});
  // Selected preset reason (from SKIP_REASONS) per pending skip
  const [skipReasonChoice, setSkipReasonChoice] = useState<Record<string, string>>({});

  // Exercise ids whose video is expanded (collapsed by default to reduce clutter)
  const [expandedVideos, setExpandedVideos] = useState<Set<string>>(new Set());
  const [togglingExerciseId, setTogglingExerciseId] = useState<string | null>(null);

  // Actual sets logged per exercise (exercise-level, separate from per-set rows)
  const [actualSetsByExercise, setActualSetsByExercise] = useState<Record<string, number>>(() => {
    const result: Record<string, number> = {};
    for (const log of session.exerciseLogs) {
      if (log.actualSets != null) result[log.blockExerciseId] = log.actualSets;
    }
    return result;
  });

  // Client's own note per exercise, auto-saved as they type
  const [clientNotes, setClientNotes] = useState<Record<string, string>>(() => {
    const result: Record<string, string> = {};
    for (const log of session.exerciseLogs) {
      if (log.clientNote) result[log.blockExerciseId] = log.clientNote;
    }
    return result;
  });

  const saveClientNote = useDebouncedCallback((blockExerciseId: string, note: string) => {
    updateExerciseClientNoteAction(session.id, blockExerciseId, note);
  }, 600);

  function handleClientNoteChange(blockExerciseId: string, note: string) {
    setClientNotes((prev) => ({ ...prev, [blockExerciseId]: note }));
    saveClientNote(blockExerciseId, note);
  }

  const [loggingKey, setLoggingKey] = useState<string | null>(null);

  // Extra sets the client adds beyond what was prescribed
  const [extraSetCounts, setExtraSetCounts] = useState<Record<string, number>>({});

  function addExtraSet(exerciseId: string) {
    setExtraSetCounts((prev) => ({ ...prev, [exerciseId]: (prev[exerciseId] ?? 0) + 1 }));
  }

  function removeExtraSet(exerciseId: string, setIndex: number) {
    if (exerciseSetLogs[exerciseId]?.[setIndex]?.completed) return;
    setExtraSetCounts((prev) => ({ ...prev, [exerciseId]: Math.max(0, (prev[exerciseId] ?? 0) - 1) }));
    setPendingInputs((prev) => {
      const next = { ...prev };
      delete next[inputKey(exerciseId, setIndex)];
      return next;
    });
  }

  // ── Accordion state ────────────────────────────────────────────────────────
  const [expandedBlocks, setExpandedBlocks] = useState<Set<string>>(
    () => new Set(session.workout.blocks.map((b) => b.id))
  );

  const [expandedExercises, setExpandedExercises] = useState<Set<string>>(() => {
    // Build the initial logs cache inline (can't reference sibling useState)
    const initialLogs: SetLogCache = {};
    for (const log of session.exerciseLogs) {
      for (const sl of log.setLogs) {
        if (!initialLogs[log.blockExerciseId]) initialLogs[log.blockExerciseId] = {};
        initialLogs[log.blockExerciseId][sl.setIndex] = { completed: true };
      }
    }
    if (externalCache) {
      for (const [id, sets] of Object.entries(externalCache)) {
        initialLogs[id] = { ...(initialLogs[id] ?? {}), ...sets };
      }
    }
    // Auto-open the first incomplete exercise
    for (const block of session.workout.blocks) {
      for (const ex of block.exercises) {
        const setCount = getSetCount(ex, block);
        const status = getExerciseStatus(ex.id, setCount, initialLogs);
        if (status !== "complete" && !additionalCompleted?.has(ex.id)) {
          return new Set([ex.id]);
        }
      }
    }
    return new Set();
  });

  // ── Finish dialog ──────────────────────────────────────────────────────────
  const [showEndDialog, setShowEndDialog] = useState(false);
  const [rpe, setRpe] = useState(5);
  const [notes, setNotes] = useState("");
  const [isCompleting, setIsCompleting] = useState(false);
  const [clientMemo, setClientMemo] = useState<VoiceMemoData | null>(null);
  const [memosLoaded, setMemosLoaded] = useState(false);

  // Load voice memos when the end dialog opens
  useEffect(() => {
    if (!showEndDialog || memosLoaded) return;
    getWorkoutVoiceMemos(session.workout.id).then((result) => {
      if (result.success && result.data) {
        setClientMemo(result.data.client);
      }
      setMemosLoaded(true);
    });
  }, [showEndDialog, memosLoaded, session.workout.id]);

  // ── Derived progress ───────────────────────────────────────────────────────
  const allExercises = session.workout.blocks.flatMap((b) =>
    b.exercises.map((ex) => ({ ex, block: b }))
  );
  const totalCount = allExercises.length;
  const doneCount = allExercises.filter(({ ex, block }) => {
    if (additionalCompleted?.has(ex.id)) return true;
    const setCount = getSetCount(ex, block);
    return getExerciseStatus(ex.id, setCount, exerciseSetLogs) === "complete";
  }).length;
  const progress = totalCount > 0 ? (doneCount / totalCount) * 100 : 0;

  // First not-yet-finished exercise — highlighted so the client knows where they are.
  const firstUnfinishedId = useMemo(() => {
    for (const { ex, block } of allExercises) {
      if (additionalCompleted?.has(ex.id)) continue;
      const setCount = getSetCount(ex, block);
      if (getExerciseStatus(ex.id, setCount, exerciseSetLogs) !== "complete") return ex.id;
    }
    return null;
  }, [allExercises, additionalCompleted, exerciseSetLogs]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  function inputKey(exerciseId: string, setIndex: number) {
    return `${exerciseId}_${setIndex}`;
  }

  function handleInputChange(
    exerciseId: string,
    setIndex: number,
    field: "actualReps" | "actualWeight" | "actualDuration" | "actualRPE",
    value: string
  ) {
    const key = inputKey(exerciseId, setIndex);
    setPendingInputs((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] ?? {}),
        [field]: value === "" ? undefined : Number(value),
      },
    }));
  }

  async function handleLogSet(
    block: WorkoutBlock,
    ex: BlockExercise,
    setIndex: number,
    skipSet = false,
    skipReason?: string,
    skipKey?: string
  ) {
    const key = inputKey(ex.id, setIndex);
    setLoggingKey(key);

    const pending = pendingInputs[key] ?? {};
    const data = skipSet
      ? { actualReps: 0, notes: skipReason || undefined }
      : {
          actualReps: pending.actualReps,
          actualWeight: pending.actualWeight,
          actualDuration: pending.actualDuration,
          actualRPE: pending.actualRPE,
        };

    const result = await updateSetLogV2Action(session.id, ex.id, setIndex, data);

    if (result.success) {
      if (skipKey) {
        setPendingSkips((prev) => {
          const next = { ...prev };
          delete next[skipKey];
          return next;
        });
      }

      const entry: SetLogEntry = { ...data, completed: true };

      // loggingKey prevents concurrent logging, so exerciseSetLogs is current
      // for all previously-logged sets. Build the updated state synchronously.
      const updatedExLogs = {
        ...(exerciseSetLogs[ex.id] ?? {}),
        [setIndex]: entry,
      };
      const setCount = getSetCount(ex, block);
      const allDone = Array.from({ length: setCount }, (_, i) => i).every(
        (i) => updatedExLogs[i]?.completed
      );

      setExerciseSetLogs((prev) => ({
        ...prev,
        [ex.id]: { ...(prev[ex.id] ?? {}), [setIndex]: entry },
      }));

      onSetLogged?.(ex.id, setIndex, entry);

      if (allDone) {
        setExpandedExercises((prev) => {
          const next = new Set(prev);
          next.delete(ex.id);
          return next;
        });
        // Auto-open next incomplete exercise
        const updatedCache: SetLogCache = { ...exerciseSetLogs, [ex.id]: updatedExLogs };
        let found = false;
        for (const b of session.workout.blocks) {
          for (const e of b.exercises) {
            if (found) {
              const sc = getSetCount(e, b);
              const st = getExerciseStatus(e.id, sc, updatedCache);
              if (st !== "complete" && !additionalCompleted?.has(e.id)) {
                setExpandedExercises((prev) => new Set([...prev, e.id]));
                break;
              }
            }
            if (e.id === ex.id) found = true;
          }
        }
      }
    } else {
      toast.error(result.error ?? "Failed to log set");
    }

    setLoggingKey(null);
  }

  // Click-the-circle toggle: checks off every set at once, or unchecks them all.
  async function toggleExerciseDone(block: WorkoutBlock, ex: BlockExercise) {
    const setCount = getSetCount(ex, block);
    const isDone =
      additionalCompleted?.has(ex.id) ||
      getExerciseStatus(ex.id, setCount, exerciseSetLogs) === "complete";
    const nextDone = !isDone;

    setTogglingExerciseId(ex.id);
    const result = await markExerciseDoneAction(session.id, ex.id, setCount, nextDone);
    if (result.success) {
      const entries: SetLogCache[string] = {};
      for (let i = 0; i < Math.max(1, setCount); i++) {
        entries[i] = { completed: nextDone };
        onSetLogged?.(ex.id, i, { completed: nextDone });
      }
      setExerciseSetLogs((prev) => ({ ...prev, [ex.id]: entries }));
    } else {
      toast.error(result.error ?? "Failed to update exercise");
    }
    setTogglingExerciseId(null);
  }

  async function handleFinish() {
    setIsCompleting(true);
    const result = await completeSessionV2Action(session.id, rpe, notes || undefined);
    if (result.success) {
      toast.success("Workout completed! Great work!");
      router.push("/dashboard");
    } else {
      toast.error(result.error ?? "Failed to complete session");
    }
    setIsCompleting(false);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-lg space-y-4 pb-24">
      {/* Header + progress — pinned. The -mt-6/pt-9 pair bleeds into the scroll
          container's own top padding (main has a fixed p-6) so the opaque
          background reaches the true top of the viewport with no gap where
          scrolled-past content could peek through above it. */}
      <div className="sticky -top-6 z-20 rounded-md bg-background mx-3 px-3 py-4 shadow-[0_1px_0_0_rgb(0_0_0/0.06),0_6px_16px_-8px_rgb(0_0_0/0.12)] sm:mx-0">
        <div className="flex items-center gap-2.5">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100">
            <Check className="h-3 w-3 text-emerald-600" />
          </div>
          <span className="text-sm font-semibold shrink-0">Checklist</span>
          <span className="text-xs font-medium text-muted-foreground shrink-0">
            {doneCount}/{totalCount}
          </span>
          <div className="flex-1" />
          <Button variant="ghost" size="sm" className="h-7 -mr-2 text-xs text-muted-foreground shrink-0" onClick={onSwitchMode}>
            Switch to Session
          </Button>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Progress value={progress} className="h-1.5 flex-1 rounded-full" />
          <span className="w-9 shrink-0 text-right text-[11px] font-medium text-muted-foreground">
            {Math.round(progress)}%
          </span>
        </div>
      </div>

      {/* Blocks */}
      {session.workout.blocks.map((block) => {
        const isBlockExpanded = expandedBlocks.has(block.id);
        const blockDone = block.exercises.filter((ex) => {
          if (additionalCompleted?.has(ex.id)) return true;
          const sc = getSetCount(ex, block);
          return getExerciseStatus(ex.id, sc, exerciseSetLogs) === "complete";
        }).length;
        const blockTotal = block.exercises.length;
        const blockName = block.name || block.type;
        const isCircuit = isCircuitBlock(block.type);

        return (
          <Card key={block.id} className="overflow-hidden border-0 shadow-sm ring-1 ring-border/50">
            {/* Block header */}
            <button
              type="button"
              className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
              onClick={() =>
                setExpandedBlocks((prev) => {
                  const next = new Set(prev);
                  if (next.has(block.id)) next.delete(block.id);
                  else next.add(block.id);
                  return next;
                })
              }
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-base font-extrabold uppercase tracking-wide text-primary">{blockName}</span>
                  {isCircuit && block.rounds > 1 && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {block.rounds} sets
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {blockDone}/{blockTotal} exercises done
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {blockDone === blockTotal && blockTotal > 0 && (
                  <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px] px-1.5">Done</Badge>
                )}
                {isBlockExpanded ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </button>

            {/* Exercise rows */}
            {isBlockExpanded && (
              <CardContent className="p-0 border-t divide-y divide-border/40">
                {block.exercises.map((ex) => {
                  const isFullyDone =
                    additionalCompleted?.has(ex.id) ||
                    getExerciseStatus(ex.id, getSetCount(ex, block), exerciseSetLogs) === "complete";
                  const isPartial =
                    getExerciseStatus(ex.id, getSetCount(ex, block), exerciseSetLogs) === "partial";
                  const isExOpen = expandedExercises.has(ex.id);
                  const setCount = getSetCount(ex, block);
                  const hasVideo =
                    ex.exercise.videoUrl || ex.exercise.media.some((m) => m.type === "VIDEO");
                  const isUpNext = ex.id === firstUnfinishedId;
                  const thumbnailUrl =
                    ex.exercise.imageUrl ?? ex.exercise.media.find((m) => m.type === "IMAGE")?.url;
                  const isToggling = togglingExerciseId === ex.id;

                  return (
                    <div key={ex.id}>
                      {/* Exercise header row */}
                      <div
                        role="button"
                        tabIndex={0}
                        className={cn(
                          "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors cursor-pointer",
                          isFullyDone
                            ? "bg-emerald-50/50"
                            : isPartial
                            ? "bg-amber-50/30"
                            : isUpNext
                            ? "bg-primary/5 ring-1 ring-inset ring-primary/30"
                            : "hover:bg-muted/30"
                        )}
                        onClick={() =>
                          setExpandedExercises((prev) => {
                            const next = new Set(prev);
                            if (next.has(ex.id)) next.delete(ex.id);
                            else next.add(ex.id);
                            return next;
                          })
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setExpandedExercises((prev) => {
                              const next = new Set(prev);
                              if (next.has(ex.id)) next.delete(ex.id);
                              else next.add(ex.id);
                              return next;
                            });
                          }
                        }}
                      >
                        {/* Status indicator — click to check/uncheck without opening the row */}
                        <button
                          type="button"
                          aria-label={isFullyDone ? "Mark exercise incomplete" : "Mark exercise done"}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleExerciseDone(block, ex);
                          }}
                          disabled={isToggling}
                          className={cn(
                            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                            isFullyDone
                              ? "border-emerald-500 bg-emerald-500"
                              : isPartial
                              ? "border-amber-400 bg-amber-400"
                              : "border-muted-foreground/30 bg-background hover:border-primary"
                          )}
                        >
                          {isToggling ? (
                            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                          ) : isFullyDone ? (
                            <Check className="h-3 w-3 text-white" />
                          ) : isPartial ? (
                            <span className="h-1.5 w-1.5 rounded-full bg-white" />
                          ) : null}
                        </button>

                        {/* Thumbnail — lets clients recognize the exercise without opening it */}
                        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-muted">
                          {thumbnailUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={thumbnailUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center">
                              <Dumbbell className="h-4 w-4 text-muted-foreground/50" />
                            </div>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <p
                            className={cn(
                              "text-[15px] font-semibold text-foreground",
                              isFullyDone && "text-muted-foreground"
                            )}
                          >
                            {ex.exercise.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {getPrescriptionText(ex, block)}
                            {isPartial && (
                              <span className="ml-1.5 text-amber-600 font-medium">· partial</span>
                            )}
                            {isUpNext && !isPartial && (
                              <span className="ml-1.5 text-primary font-semibold">· up next</span>
                            )}
                          </p>
                        </div>

                        <ChevronRight
                          className={cn(
                            "h-4 w-4 text-muted-foreground shrink-0 transition-transform",
                            isExOpen && "rotate-90"
                          )}
                        />
                      </div>

                      {/* Exercise body */}
                      {isExOpen && (
                        <div className="px-4 pb-4 pt-3 bg-muted/20 space-y-4">
                          {/* Meta line — one quiet line instead of a wall of pills */}
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm text-muted-foreground">
                              {[
                                `${isCircuit ? block.rounds : ex.sets.length} ${
                                  (isCircuit ? block.rounds : ex.sets.length) === 1 ? "set" : "sets"
                                }`,
                                ex.sets[0]?.targetReps ? `${ex.sets[0].targetReps} reps` : null,
                                ex.sets[0]?.targetDuration ? `${ex.sets[0].targetDuration}${ex.sets[0].targetDurationUnit === "MIN" ? "min" : "s"} hold` : null,
                                ex.sets[0]?.restAfter ? `${ex.sets[0].restAfter}s rest` : null,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                            {ex.exercise.bodyRegion && ex.exercise.bodyRegion.length > 0 && (
                              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                                {ex.exercise.bodyRegion.map(formatBodyRegion).join(", ")}
                              </span>
                            )}
                          </div>

                          {/* Video — collapsed by default to keep the list compact */}
                          {hasVideo && (
                            expandedVideos.has(ex.id) ? (
                              <ExerciseVideoPlayer
                                videoUrl={ex.exercise.videoUrl ?? undefined}
                                mediaItems={ex.exercise.media.map((m) => ({
                                  id: m.id,
                                  url: m.url,
                                  mediaType: m.type,
                                }))}
                              />
                            ) : (
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 rounded-xl border border-dashed border-border/60 bg-muted/30 px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
                                onClick={() =>
                                  setExpandedVideos((prev) => new Set(prev).add(ex.id))
                                }
                              >
                                <PlayCircle className="h-4 w-4" />
                                Watch Video
                              </button>
                            )
                          )}

                          {/* Instructions */}
                          {ex.exercise.instructions && (
                            <div className="rounded-xl bg-muted/60 px-3 py-2.5">
                              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                                Instructions
                              </p>
                              <ul className="space-y-1 text-sm leading-relaxed text-muted-foreground list-disc pl-4">
                                {instructionsToBullets(ex.exercise.instructions).map((line, idx) => (
                                  <li key={idx}>{line}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Trainer notes */}
                          {ex.notes && (
                            <div className="rounded-xl bg-muted/60 px-3 py-2.5">
                              <p className="text-sm text-blue-700">
                                <span className="font-semibold">Tip:</span>{" "}
                                <span className="italic">{ex.notes}</span>
                              </p>
                            </div>
                          )}

                          {/* Per-set logging table */}
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-3">
                              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground shrink-0">
                                Sets
                              </p>
                              <div className="ml-auto flex items-center gap-2">
                                {setCount > 1 && (
                                  <div className="flex items-center gap-1">
                                    <Input
                                      type="number"
                                      min={0}
                                      placeholder="—"
                                      value={actualSetsByExercise[ex.id] ?? ""}
                                      onChange={(e) => {
                                        const val = e.target.value === "" ? undefined : Number(e.target.value);
                                        setActualSetsByExercise((prev) => {
                                          const next = { ...prev };
                                          if (val === undefined) delete next[ex.id];
                                          else next[ex.id] = val;
                                          return next;
                                        });
                                        updateExerciseActualSetsAction(
                                          session.id,
                                          ex.id,
                                          e.target.value === "" ? null : Number(e.target.value)
                                        );
                                      }}
                                      className="h-6 w-12 px-1 text-xs text-center"
                                    />
                                    <span className="text-[11px] text-muted-foreground/70 whitespace-nowrap">total</span>
                                  </div>
                                )}
                                {isFullyDone && (
                                  <span className="text-[11px] text-emerald-600 font-medium flex items-center gap-0.5">
                                    <Check className="h-3 w-3" /> All done
                                  </span>
                                )}
                              </div>
                            </div>

                            {setCount === 0 && (
                              <p className="text-xs text-muted-foreground">No sets prescribed.</p>
                            )}

                            {Array.from(
                              { length: setCount + (extraSetCounts[ex.id] ?? 0) },
                              (_, i) => {
                                const isExtra = i >= setCount;
                                const setDef = isExtra
                                  ? null
                                  : isCircuit
                                  ? ex.sets[0]
                                  : ex.sets[i];
                                const logEntry = exerciseSetLogs[ex.id]?.[i];
                                const isDone = logEntry?.completed ?? false;
                                const key = inputKey(ex.id, i);
                                const pending = pendingInputs[key] ?? {};
                                const isLogging = loggingKey === key;
                                const isLastExtra =
                                  isExtra && i === setCount + (extraSetCounts[ex.id] ?? 0) - 1;

                                // Done sets collapse to a compact single-line receipt —
                                // showing 3+ full editable cards for already-completed sets
                                // is the main source of clutter once a client is mid-workout.
                                if (isDone) {
                                  const skipped = logEntry?.actualReps === 0 && !logEntry?.actualDuration;
                                  const summary = skipped
                                    ? "Skipped"
                                    : [
                                        logEntry?.actualReps ? `${logEntry.actualReps} reps` : null,
                                        logEntry?.actualDuration ? `${logEntry.actualDuration}s` : null,
                                        logEntry?.actualWeight ? `${logEntry.actualWeight} lbs` : null,
                                        logEntry?.actualRPE ? `RPE ${logEntry.actualRPE}` : null,
                                      ]
                                        .filter(Boolean)
                                        .join(" · ") || "Done";

                                  return (
                                    <div
                                      key={i}
                                      className={cn(
                                        "flex items-center gap-2.5 rounded-lg px-3 py-1.5",
                                        skipped ? "bg-amber-50/60" : "bg-emerald-50/60"
                                      )}
                                    >
                                      <div
                                        className={cn(
                                          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                                          skipped ? "bg-amber-400" : "bg-emerald-500"
                                        )}
                                      >
                                        <Check className="h-3 w-3 text-white" />
                                      </div>
                                      <span className="text-sm text-foreground">
                                        Set {i + 1}
                                        {isExtra && <span className="text-muted-foreground"> (extra)</span>}
                                      </span>
                                      <span
                                        className={cn(
                                          "ml-auto text-sm",
                                          skipped ? "text-amber-600" : "text-muted-foreground"
                                        )}
                                      >
                                        {summary}
                                      </span>
                                    </div>
                                  );
                                }

                                return (
                                  <div
                                    key={i}
                                    className={cn(
                                      "rounded-xl border p-3 transition-colors",
                                      isExtra
                                        ? "border-dashed border-muted-foreground/30 bg-background"
                                        : "border-border bg-background"
                                    )}
                                  >
                                    {/* Set header */}
                                    <div className="flex items-center gap-2 mb-2">
                                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                                        {i + 1}
                                      </div>
                                      <span className="text-xs text-muted-foreground">
                                        {`Set ${i + 1}`}
                                        {isExtra && (
                                          <span className="ml-1 text-[10px] text-muted-foreground/60">(extra)</span>
                                        )}
                                        {setDef?.targetReps && ` · target ${setDef.targetReps} reps`}
                                        {setDef?.targetDuration && ` · target ${setDef.targetDuration}${setDef.targetDurationUnit === "MIN" ? "min" : "s"}`}
                                      </span>
                                      {/* Remove button for last unlogged extra set */}
                                      {isLastExtra && (
                                        <button
                                          type="button"
                                          className="ml-auto text-muted-foreground hover:text-destructive"
                                          onClick={() => removeExtraSet(ex.id, i)}
                                        >
                                          <X className="h-3.5 w-3.5" />
                                        </button>
                                      )}
                                    </div>

                                    {/* Inputs */}
                                    <div className="flex flex-wrap gap-2 items-end">
                                        {/* Reps: always show for extra sets; for prescribed show when target reps or no duration */}
                                        {(isExtra || setDef?.targetReps != null || !setDef?.targetDuration) && (
                                          <div className="space-y-0.5">
                                            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                                              Reps completed
                                            </Label>
                                            <Input
                                              type="number"
                                              min={0}
                                              placeholder={setDef?.targetReps?.toString() ?? "0"}
                                              value={pending.actualReps ?? ""}
                                              onChange={(e) =>
                                                handleInputChange(ex.id, i, "actualReps", e.target.value)
                                              }
                                              className="h-8 w-24 text-sm"
                                            />
                                          </div>
                                        )}
                                        {(isExtra || setDef?.targetDuration != null) && (
                                          <div className="space-y-0.5">
                                            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                                              Actual {setDef?.targetDurationUnit === "MIN" ? "min" : "secs"}
                                            </Label>
                                            <Input
                                              type="number"
                                              min={0}
                                              placeholder={setDef?.targetDuration?.toString() ?? "0"}
                                              value={pending.actualDuration ?? ""}
                                              onChange={(e) =>
                                                handleInputChange(ex.id, i, "actualDuration", e.target.value)
                                              }
                                              className="h-8 w-24 text-sm"
                                            />
                                          </div>
                                        )}
                                        {(isExtra || setDef?.targetWeight != null) && (
                                          <div className="space-y-0.5">
                                            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                                              Weight used
                                            </Label>
                                            <Input
                                              type="number"
                                              min={0}
                                              placeholder={setDef?.targetWeight?.toString() ?? "0"}
                                              value={pending.actualWeight ?? ""}
                                              onChange={(e) =>
                                                handleInputChange(ex.id, i, "actualWeight", e.target.value)
                                              }
                                              className="h-8 w-24 text-sm"
                                            />
                                          </div>
                                        )}
                                        <div className="space-y-0.5">
                                          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                                            RPE
                                          </Label>
                                          <Input
                                            type="number"
                                            min={0}
                                            max={10}
                                            placeholder={setDef?.targetRPE?.toString() ?? "—"}
                                            value={pending.actualRPE ?? ""}
                                            onChange={(e) =>
                                              handleInputChange(ex.id, i, "actualRPE", e.target.value)
                                            }
                                            className="h-8 w-16 text-sm"
                                          />
                                        </div>
                                        {setDef?.restAfter != null && (
                                          <div className="space-y-0.5">
                                            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                                              Rest
                                            </Label>
                                            <p className="h-8 flex items-center text-sm text-muted-foreground">
                                              {setDef.restAfter}s
                                            </p>
                                          </div>
                                        )}

                                        <div className="flex gap-1.5 ml-auto">
                                          <Button
                                            size="sm"
                                            className="h-8 gap-1 text-xs"
                                            onClick={() => handleLogSet(block, ex, i)}
                                            disabled={isLogging}
                                          >
                                            {isLogging ? (
                                              <Loader2 className="h-3 w-3 animate-spin" />
                                            ) : (
                                              <Check className="h-3 w-3" />
                                            )}
                                            Done
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-8 gap-1 text-xs text-amber-600 border-amber-200 hover:bg-amber-50"
                                            onClick={() =>
                                              setPendingSkips((prev) => ({ ...prev, [inputKey(ex.id, i)]: "" }))
                                            }
                                            disabled={isLogging || inputKey(ex.id, i) in pendingSkips}
                                          >
                                            <AlertCircle className="h-3 w-3" />
                                            Skip Exercise
                                          </Button>
                                        </div>
                                    </div>
                                    {inputKey(ex.id, i) in pendingSkips && (() => {
                                      const skipKey = inputKey(ex.id, i);
                                      const choice = skipReasonChoice[skipKey];
                                      const canSkip = !!choice && (choice !== "Other" || pendingSkips[skipKey].trim().length > 0);
                                      return (
                                        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/50 p-2.5 space-y-2">
                                          <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">
                                            Why?
                                          </p>
                                          <div className="space-y-1.5">
                                            {SKIP_REASONS.map((reason) => (
                                              <label
                                                key={reason}
                                                className="flex items-center gap-2 text-xs text-amber-800 cursor-pointer"
                                              >
                                                <input
                                                  type="radio"
                                                  name={`skip-reason-${skipKey}`}
                                                  checked={choice === reason}
                                                  onChange={() =>
                                                    setSkipReasonChoice((prev) => ({ ...prev, [skipKey]: reason }))
                                                  }
                                                  className="accent-amber-600"
                                                />
                                                {reason}
                                              </label>
                                            ))}
                                          </div>
                                          {choice === "Other" && (
                                            <Textarea
                                              className="h-14 text-xs resize-none bg-white"
                                              placeholder="Tell your trainer more…"
                                              value={pendingSkips[skipKey] ?? ""}
                                              onChange={(e) =>
                                                setPendingSkips((prev) => ({ ...prev, [skipKey]: e.target.value }))
                                              }
                                            />
                                          )}
                                          <div className="flex gap-1.5">
                                            <Button
                                              size="sm"
                                              className="h-7 text-xs bg-amber-500 hover:bg-amber-600 text-white border-0"
                                              onClick={() => {
                                                const reason = choice === "Other" ? pendingSkips[skipKey] : choice;
                                                handleLogSet(block, ex, i, true, reason, skipKey);
                                                setSkipReasonChoice((prev) => {
                                                  const next = { ...prev };
                                                  delete next[skipKey];
                                                  return next;
                                                });
                                              }}
                                              disabled={isLogging || !canSkip}
                                            >
                                              Skip this set
                                            </Button>
                                            <Button
                                              size="sm"
                                              variant="ghost"
                                              className="h-7 text-xs"
                                              onClick={() => {
                                                setPendingSkips((prev) => {
                                                  const next = { ...prev };
                                                  delete next[skipKey];
                                                  return next;
                                                });
                                                setSkipReasonChoice((prev) => {
                                                  const next = { ...prev };
                                                  delete next[skipKey];
                                                  return next;
                                                });
                                              }}
                                            >
                                              Cancel
                                            </Button>
                                          </div>
                                        </div>
                                      );
                                    })()}
                                  </div>
                                );
                              }
                            )}

                            {/* Add extra set */}
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="w-full h-8 text-xs border-dashed gap-1"
                              onClick={() => addExtraSet(ex.id)}
                            >
                              <Plus className="h-3 w-3" />
                              Add Set
                            </Button>
                          </div>

                          {/* Client note */}
                          <div className="space-y-1.5 rounded-xl bg-violet-50/30 p-3">
                            <Label htmlFor={`client-note-${ex.id}`} className="text-xs font-semibold uppercase tracking-wider text-violet-600/80">
                              Your Notes
                            </Label>
                            <Textarea
                              id={`client-note-${ex.id}`}
                              placeholder="Anything you want your trainer to know about this exercise..."
                              value={clientNotes[ex.id] ?? ""}
                              onChange={(e) => handleClientNoteChange(ex.id, e.target.value)}
                              className="min-h-16 text-sm italic resize-none bg-background/70 border-violet-100"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            )}
          </Card>
        );
      })}

      {/* Finish button */}
      <Button
        size="lg"
        className="w-full"
        onClick={() => setShowEndDialog(true)}
      >
        <Trophy className="mr-2 h-4 w-4" />
        Finish Workout
      </Button>

      {/* End dialog */}
      <Dialog open={showEndDialog} onOpenChange={setShowEndDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-700">
              <Trophy className="h-8 w-8" />
            </div>
            <DialogTitle className="text-center text-xl">Great work!</DialogTitle>
            <p className="text-center text-sm text-muted-foreground">
              You completed {doneCount} of {totalCount} exercises.
            </p>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div>
              <Label className="font-semibold">
                How hard was this session?{" "}
                <span className="font-normal text-muted-foreground">RPE {rpe}/10</span>
              </Label>
              <div className="mt-3 flex items-center gap-3">
                <span className="text-xs text-muted-foreground">Easy</span>
                <input
                  type="range"
                  min={0}
                  max={10}
                  value={rpe}
                  onChange={(e) => setRpe(Number(e.target.value))}
                  className="flex-1 accent-primary"
                />
                <span className="text-xs text-muted-foreground">Max</span>
              </div>
              <div className="mt-2 flex gap-1">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div
                    key={i}
                    className={`h-1.5 flex-1 rounded-full transition-colors ${
                      i < rpe
                        ? i < 4
                          ? "bg-emerald-500"
                          : i < 7
                          ? "bg-amber-500"
                          : "bg-red-500"
                        : "bg-muted"
                    }`}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="font-semibold">
                Session Notes{" "}
                <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                placeholder="How did it feel?"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="resize-none"
              />
            </div>
            {!clientMemo ? (
              <div className="space-y-1.5">
                <p className="text-sm font-semibold">
                  Leave a voice note{" "}
                  <span className="font-normal text-muted-foreground">(optional)</span>
                </p>
                <VoiceMemoRecorder
                  workoutId={session.workout.id}
                  role="CLIENT"
                  onSuccess={(memo) => setClientMemo(memo)}
                />
              </div>
            ) : (
              <p className="text-sm font-semibold text-emerald-700">Voice note sent ✓</p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowEndDialog(false)}>
              Back
            </Button>
            <Button
              className="flex-1"
              onClick={handleFinish}
              disabled={isCompleting}
            >
              {isCompleting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-2 h-4 w-4" />
              )}
              Complete Session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
