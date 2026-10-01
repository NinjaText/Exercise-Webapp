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
import {
  WORKOUT_STATE,
  WORKOUT_TOUCH,
  SET_FIELD,
  SET_FIELD_LABEL,
  SET_FIELD_INPUT,
  SET_FIELD_STATIC,
} from "./workout-tokens";
import { ROLE_CLASSES } from "@/lib/ui/status";
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
  setType?: string | null;
  targetReps?: number | null;
  targetDuration?: number | null;
  targetDurationUnit?: string | null;
  targetDistance?: number | null;
  targetPace?: string | null;
  targetHrZone?: string | null;
  repeatCount?: number | null;
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
  setLogs: { id: string; setIndex: number; actualReps?: number | null; actualWeight?: number | null; actualDuration?: number | null; actualDistance?: number | null; actualRPE?: number | null }[];
};
type BlockExercise = {
  id: string;
  exerciseId: string;
  notes?: string | null;
  activityType?: string | null;
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

const SEGMENT_LABELS: Record<string, string> = {
  WARMUP: "Warm-up",
  WORK: "Work",
  RECOVERY: "Recovery",
  COOLDOWN: "Cool-down",
};

// Only meaningful for Run / Interval Run exercises — labels an interval
// segment by what it is (not "Set 1"), and folds in the repeat count so
// "6 x 400m" reads as one row instead of six identical ones.
function segmentLabel(setType?: string | null, repeatCount?: number | null): string | null {
  if (!setType) return null;
  const base = SEGMENT_LABELS[setType];
  if (!base) return null;
  return setType === "WORK" && repeatCount ? `${base} ×${repeatCount}` : base;
}

// Renders a Run/Interval Run set's prescription as a single glance-able
// line — distance, duration, target pace, HR zone — since none of those
// are things a client fills in an input for the way reps/weight are.
function prescriptionSummary(set: BlockExerciseSet): string {
  const parts: string[] = [];
  if (set.targetDistance != null) parts.push(`${set.targetDistance} mi`);
  if (set.targetDuration != null) {
    parts.push(`${set.targetDuration}${set.targetDurationUnit === "MIN" ? "min" : "s"}`);
  }
  if (set.targetPace) parts.push(`@ ${set.targetPace}`);
  if (set.targetHrZone) parts.push(set.targetHrZone);
  return parts.join(" · ");
}

function getPrescriptionText(ex: BlockExercise, block: WorkoutBlock): string {
  const isCircuit = isCircuitBlock(block.type);
  const rounds = isCircuit ? block.rounds : 1;
  const set = ex.sets[0];
  if (!set) return "";
  if ((ex.activityType || "STRENGTH") !== "STRENGTH") {
    return prescriptionSummary(set) || `${ex.sets.length} ${ex.sets.length === 1 ? "segment" : "segments"}`;
  }
  const setsLabel = isCircuit
    ? `${rounds} ${rounds === 1 ? "set" : "sets"}`
    : `${ex.sets.length} ${ex.sets.length === 1 ? "set" : "sets"}`;
  if (set.targetReps) return `${setsLabel} × ${set.targetReps} reps`;
  if (set.targetDuration) return `${setsLabel} × ${set.targetDuration}${set.targetDurationUnit === "MIN" ? "min" : "s"}`;
  return setsLabel;
}

function getSetCount(ex: BlockExercise, block: WorkoutBlock): number {
  // Interval Run's segments are an ordered sequence, not repeating rounds —
  // never collapsed to the block's round count the way a circuit set is.
  if ((ex.activityType || "STRENGTH") === "INTERVAL_RUN") return ex.sets.length;
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
          actualDistance: sl.actualDistance ?? undefined,
          actualRPE: sl.actualRPE ?? undefined,
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
    Record<string, { actualReps?: number; actualWeight?: number; actualDuration?: number; actualDistance?: number; actualRPE?: number }>
  >({});

  // Keys of sets where the user clicked "Skip Exercise" — value is the typed "Other" reason
  const [pendingSkips, setPendingSkips] = useState<Record<string, string>>({});
  // Selected preset reason (from SKIP_REASONS) per pending skip
  const [skipReasonChoice, setSkipReasonChoice] = useState<Record<string, string>>({});

  // Exercise ids whose video is expanded (collapsed by default to reduce clutter)
  const [expandedVideos, setExpandedVideos] = useState<Set<string>>(new Set());
  // Exercise ids whose instructions are expanded (collapsed by default)
  const [expandedInstructions, setExpandedInstructions] = useState<Set<string>>(new Set());
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
    field: "actualReps" | "actualWeight" | "actualDuration" | "actualDistance" | "actualRPE",
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
          actualDistance: pending.actualDistance,
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
    <div className="flex w-full flex-col gap-4">
      {/* Header + progress — pinned. The negative top offset matches <main>'s
          gutter (p-4 / lg:p-6 / 2xl:p-8) so the opaque bar sits flush with the
          top of the scroll area and scrolled-past content can't peek above it. */}
      <div className="sticky -top-4 z-20 -mx-4 border-b border-border bg-canvas/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-canvas/80 sm:mx-0 sm:rounded-xl sm:rounded-t-none sm:border sm:bg-surface sm:shadow-xs lg:-top-6 2xl:-top-8">
        <div className="flex items-center gap-2.5">
          <div className={`flex size-6 shrink-0 items-center justify-center rounded-full ${WORKOUT_STATE.completed.soft}`}>
            <Check className={`size-3.5 ${WORKOUT_STATE.completed.text}`} aria-hidden />
          </div>
          <span className="shrink-0 text-heading">Checklist</span>
          <span className="shrink-0 text-caption tabular-nums">
            {doneCount}/{totalCount}
          </span>
          <div className="flex-1" />
          <Button variant="ghost" className={cn(WORKOUT_TOUCH, "-mr-2 shrink-0 px-3 text-muted-foreground")} onClick={onSwitchMode}>
            Switch to Session
          </Button>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Progress value={progress} className="h-1.5 flex-1 rounded-full" />
          <span className="w-9 shrink-0 text-right text-caption tabular-nums">
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
          <Card key={block.id} className="gap-0 overflow-hidden py-0">
            {/* Block header */}
            <button
              type="button"
              aria-expanded={isBlockExpanded}
              className="flex min-h-14 w-full items-center gap-3 px-5 py-3 text-left outline-none transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none"
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
                  <span className="text-heading text-foreground">{blockName}</span>
                  {isCircuit && block.rounds > 1 && (
                    <Badge variant="secondary">
                      {block.rounds} sets
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 text-caption tabular-nums">
                  {blockDone}/{blockTotal} exercises done
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {blockDone === blockTotal && blockTotal > 0 && (
                  <Badge className={`${WORKOUT_STATE.completed.soft} ${WORKOUT_STATE.completed.text} border-0`}>Done</Badge>
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
              <CardContent className="divide-y divide-border border-t border-border p-0">
                {block.exercises.map((ex) => {
                  const isFullyDone =
                    additionalCompleted?.has(ex.id) ||
                    getExerciseStatus(ex.id, getSetCount(ex, block), exerciseSetLogs) === "complete";
                  const isPartial =
                    getExerciseStatus(ex.id, getSetCount(ex, block), exerciseSetLogs) === "partial";
                  const isExOpen = expandedExercises.has(ex.id);
                  const setCount = getSetCount(ex, block);
                  const activityType = ex.activityType || "STRENGTH";
                  const isRunType = activityType !== "STRENGTH";
                  // Interval Run is a sequence of distinct segments — never
                  // treated as a repeating circuit round.
                  const showAsSegments = activityType === "INTERVAL_RUN";
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
                        aria-expanded={isExOpen}
                        className={cn(
                          "flex min-h-16 w-full cursor-pointer items-center gap-3 px-5 py-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none",
                          isFullyDone
                            ? WORKOUT_STATE.completed.soft
                            : isPartial
                            ? WORKOUT_STATE.partial.soft
                            : isUpNext
                            ? "bg-primary/5 ring-1 ring-inset ring-primary/30"
                            : "hover:bg-surface-muted"
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
                            "relative flex size-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors after:absolute after:-inset-2 after:content-[''] motion-reduce:transition-none",
                            isFullyDone
                              ? "border-success bg-success"
                              : isPartial
                              ? "border-warning bg-warning"
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
                              "flex items-center gap-1.5 text-body font-medium text-foreground",
                              isFullyDone && "text-muted-foreground"
                            )}
                          >
                            <span className="truncate">{ex.exercise.name}</span>
                            {isRunType && (
                              <span className={`shrink-0 rounded-full ${WORKOUT_STATE.current.soft} ${WORKOUT_STATE.current.text} border ${WORKOUT_STATE.current.border} px-1.5 py-0 text-caption font-medium`}>
                                {activityType === "INTERVAL_RUN" ? "Interval Run" : "Run"}
                              </span>
                            )}
                          </p>
                          <p className="text-caption">
                            {getPrescriptionText(ex, block)}
                            {isPartial && (
                              <span className={`ml-1.5 ${WORKOUT_STATE.partial.text} font-medium`}>· partial</span>
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
                        <div className="space-y-4 bg-surface-muted/50 px-5 pt-3 pb-5">
                          {/* Meta line — one quiet line instead of a wall of pills */}
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-body text-muted-foreground">
                              {isRunType
                                ? [
                                    `${ex.sets.length} ${ex.sets.length === 1 ? "segment" : "segments"}`,
                                    prescriptionSummary(ex.sets[0]) || null,
                                  ]
                                    .filter(Boolean)
                                    .join(" · ")
                                : [
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
                              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-caption font-medium">
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
                                className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-dashed border-border-strong bg-surface px-3 text-label text-muted-foreground outline-none transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                                onClick={() =>
                                  setExpandedVideos((prev) => new Set(prev).add(ex.id))
                                }
                              >
                                <PlayCircle className="size-4" aria-hidden />
                                Watch Video
                              </button>
                            )
                          )}

                          {/* Instructions (collapsed by default) */}
                          {ex.exercise.instructions && (
                            <div className="rounded-lg bg-surface px-3 ring-1 ring-border">
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedInstructions((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(ex.id)) next.delete(ex.id);
                                    else next.add(ex.id);
                                    return next;
                                  })
                                }
                                className="flex min-h-11 w-full items-center justify-between rounded-sm text-label text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                Instructions
                                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expandedInstructions.has(ex.id) ? "rotate-180" : ""}`} />
                              </button>
                              {expandedInstructions.has(ex.id) && (
                                <ul className="list-disc space-y-1 pb-3 pl-4 text-body text-muted-foreground">
                                  {instructionsToBullets(ex.exercise.instructions).map((line, idx) => (
                                    <li key={idx}>{line}</li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          )}

                          {/* Trainer notes */}
                          {ex.notes && (
                            <div className="rounded-lg bg-surface px-3 py-2.5 ring-1 ring-border">
                              <p className={`text-body ${WORKOUT_STATE.current.text}`}>
                                <span className="font-semibold">Tip:</span>{" "}
                                <span className="italic">{ex.notes}</span>
                              </p>
                            </div>
                          )}

                          {/* Per-set logging table */}
                          <div className="space-y-2">
                            <div className="flex items-center gap-3">
                              <p className="shrink-0 text-label text-muted-foreground">
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
                                      aria-label="Total sets done"
                                      className={cn(SET_FIELD_INPUT, "w-14 px-1 text-center")}
                                    />
                                    <span className="whitespace-nowrap text-caption">total</span>
                                  </div>
                                )}
                                {isFullyDone && (
                                  <span className={`flex items-center gap-0.5 text-caption font-medium ${WORKOUT_STATE.completed.text}`}>
                                    <Check className="h-3 w-3" /> All done
                                  </span>
                                )}
                              </div>
                            </div>

                            {setCount === 0 && (
                              <p className="text-caption">No sets prescribed.</p>
                            )}

                            {Array.from(
                              { length: setCount + (extraSetCounts[ex.id] ?? 0) },
                              (_, i) => {
                                const isExtra = i >= setCount;
                                const setDef = isExtra
                                  ? null
                                  : isCircuit && !showAsSegments
                                  ? ex.sets[0]
                                  : ex.sets[i];
                                const label = showAsSegments ? segmentLabel(setDef?.setType, setDef?.repeatCount) : null;
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
                                  const skipped = logEntry?.actualReps === 0 && !logEntry?.actualDuration && !logEntry?.actualDistance;
                                  const summary = skipped
                                    ? "Skipped"
                                    : [
                                        logEntry?.actualReps ? `${logEntry.actualReps} reps` : null,
                                        logEntry?.actualDistance ? `${logEntry.actualDistance} mi` : null,
                                        logEntry?.actualDuration ? `${logEntry.actualDuration}${setDef?.targetDurationUnit === "MIN" ? "min" : "s"}` : null,
                                        logEntry?.actualWeight ? `${logEntry.actualWeight} lbs` : null,
                                        logEntry?.actualRPE ? `RPE ${logEntry.actualRPE}` : null,
                                      ]
                                        .filter(Boolean)
                                        .join(" · ") || "Done";

                                  return (
                                    <div
                                      key={i}
                                      className={cn(
                                        "flex min-h-10 items-center gap-2.5 rounded-lg px-3 py-2",
                                        skipped ? WORKOUT_STATE.partial.soft : WORKOUT_STATE.completed.soft
                                      )}
                                    >
                                      <div
                                        className={cn(
                                          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                                          skipped ? WORKOUT_STATE.partial.dot : WORKOUT_STATE.completed.dot
                                        )}
                                      >
                                        <Check className="h-3 w-3 text-white" />
                                      </div>
                                      <span className="text-body text-foreground">
                                        {label ?? `Set ${i + 1}`}
                                        {isExtra && <span className="text-muted-foreground"> (extra)</span>}
                                      </span>
                                      <span
                                        className={cn(
                                          "ml-auto text-body tabular-nums",
                                          skipped ? WORKOUT_STATE.partial.text : "text-muted-foreground"
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
                                      "rounded-lg border p-3 transition-colors",
                                      isExtra
                                        ? "border-dashed border-border-strong bg-surface"
                                        : "border-border bg-surface"
                                    )}
                                  >
                                    {/* Set header */}
                                    <div className="mb-3 flex items-center gap-2">
                                      <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-caption font-semibold tabular-nums text-primary">
                                        {i + 1}
                                      </div>
                                      <span className="text-caption">
                                        {label ?? `Set ${i + 1}`}
                                        {isExtra && (
                                          <span className="ml-1">(extra)</span>
                                        )}
                                        {!isRunType && setDef?.targetReps && ` · target ${setDef.targetReps} reps`}
                                        {!isRunType && setDef?.targetDuration && ` · target ${setDef.targetDuration}${setDef.targetDurationUnit === "MIN" ? "min" : "s"}`}
                                        {isRunType && setDef && prescriptionSummary(setDef) && ` · ${prescriptionSummary(setDef)}`}
                                      </span>
                                      {/* Remove button for last unlogged extra set */}
                                      {isLastExtra && (
                                        <button
                                          type="button"
                                          aria-label="Remove extra set"
                                          className="-my-2 -mr-2 ml-auto flex size-11 items-center justify-center rounded-md text-muted-foreground outline-none hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring sm:size-9"
                                          onClick={() => removeExtraSet(ex.id, i)}
                                        >
                                          <X className="size-4" />
                                        </button>
                                      )}
                                    </div>

                                    {/* Inputs */}
                                    <div className="flex flex-wrap items-end gap-2">
                                        {/* Reps: always show for extra sets; for prescribed show when target reps or no duration */}
                                        {!isRunType && (isExtra || setDef?.targetReps != null || !setDef?.targetDuration) && (
                                          <label className={SET_FIELD}>
                                            <span className={SET_FIELD_LABEL}>
                                              Reps completed
                                            </span>
                                            <Input
                                              type="number"
                                              min={0}
                                              placeholder={setDef?.targetReps?.toString() ?? "0"}
                                              value={pending.actualReps ?? ""}
                                              onChange={(e) =>
                                                handleInputChange(ex.id, i, "actualReps", e.target.value)
                                              }
                                              className={cn(SET_FIELD_INPUT, "w-24")}
                                            />
                                          </label>
                                        )}
                                        {isRunType && (isExtra || setDef?.targetDistance != null) && (
                                          <label className={SET_FIELD}>
                                            <span className={SET_FIELD_LABEL}>
                                              Distance (mi)
                                            </span>
                                            <Input
                                              type="number"
                                              min={0}
                                              step={0.1}
                                              placeholder={setDef?.targetDistance?.toString() ?? "0"}
                                              value={pending.actualDistance ?? ""}
                                              onChange={(e) =>
                                                handleInputChange(ex.id, i, "actualDistance", e.target.value)
                                              }
                                              className={cn(SET_FIELD_INPUT, "w-24")}
                                            />
                                          </label>
                                        )}
                                        {(isExtra || setDef?.targetDuration != null) && (
                                          <label className={SET_FIELD}>
                                            <span className={SET_FIELD_LABEL}>
                                              Actual {setDef?.targetDurationUnit === "MIN" ? "min" : "secs"}
                                            </span>
                                            <Input
                                              type="number"
                                              min={0}
                                              placeholder={setDef?.targetDuration?.toString() ?? "0"}
                                              value={pending.actualDuration ?? ""}
                                              onChange={(e) =>
                                                handleInputChange(ex.id, i, "actualDuration", e.target.value)
                                              }
                                              className={cn(SET_FIELD_INPUT, "w-24")}
                                            />
                                          </label>
                                        )}
                                        {!isRunType && (isExtra || setDef?.targetWeight != null) && (
                                          <label className={SET_FIELD}>
                                            <span className={SET_FIELD_LABEL}>
                                              Weight used
                                            </span>
                                            <Input
                                              type="number"
                                              min={0}
                                              placeholder={setDef?.targetWeight?.toString() ?? "0"}
                                              value={pending.actualWeight ?? ""}
                                              onChange={(e) =>
                                                handleInputChange(ex.id, i, "actualWeight", e.target.value)
                                              }
                                              className={cn(SET_FIELD_INPUT, "w-24")}
                                            />
                                          </label>
                                        )}
                                        <label className={SET_FIELD}>
                                          <span className={SET_FIELD_LABEL}>
                                            RPE
                                          </span>
                                          <Input
                                            type="number"
                                            min={0}
                                            max={10}
                                            placeholder={setDef?.targetRPE?.toString() ?? "—"}
                                            value={pending.actualRPE ?? ""}
                                            onChange={(e) =>
                                              handleInputChange(ex.id, i, "actualRPE", e.target.value)
                                            }
                                            className={cn(SET_FIELD_INPUT, "w-16")}
                                          />
                                        </label>
                                        {setDef?.restAfter != null && (
                                          <div className={SET_FIELD}>
                                            <span className={SET_FIELD_LABEL}>
                                              Rest
                                            </span>
                                            <p className={SET_FIELD_STATIC}>
                                              {setDef.restAfter}s
                                            </p>
                                          </div>
                                        )}

                                        <div className="ml-auto flex gap-2">
                                          <Button
                                            size="sm"
                                            className={cn(WORKOUT_TOUCH, "gap-1")}
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
                                            className={cn(WORKOUT_TOUCH, "gap-1 border-warning-border text-warning-foreground hover:bg-warning-soft")}
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
                                        <div className="mt-3 space-y-2 rounded-lg border border-warning-border bg-warning-soft p-3">
                                          <p className="text-label text-warning-foreground">
                                            Why?
                                          </p>
                                          <div className="space-y-0.5">
                                            {SKIP_REASONS.map((reason) => (
                                              <label
                                                key={reason}
                                                className="flex min-h-11 cursor-pointer items-center gap-2.5 text-body text-warning-foreground sm:min-h-10"
                                              >
                                                <input
                                                  type="radio"
                                                  name={`skip-reason-${skipKey}`}
                                                  checked={choice === reason}
                                                  onChange={() =>
                                                    setSkipReasonChoice((prev) => ({ ...prev, [skipKey]: reason }))
                                                  }
                                                  className="size-4 accent-warning"
                                                />
                                                {reason}
                                              </label>
                                            ))}
                                          </div>
                                          {choice === "Other" && (
                                            <Textarea
                                              className="min-h-16 resize-none bg-surface"
                                              placeholder="Tell your trainer more…"
                                              value={pendingSkips[skipKey] ?? ""}
                                              onChange={(e) =>
                                                setPendingSkips((prev) => ({ ...prev, [skipKey]: e.target.value }))
                                              }
                                            />
                                          )}
                                          <div className="flex gap-2">
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              className={cn(WORKOUT_TOUCH, "border-warning-border text-warning-foreground hover:bg-warning-soft")}
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
                                              className={WORKOUT_TOUCH}
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
                              className={cn(WORKOUT_TOUCH, "w-full gap-1 border-dashed")}
                              onClick={() => addExtraSet(ex.id)}
                            >
                              <Plus className="size-4" />
                              Add Set
                            </Button>
                          </div>

                          {/* Client note */}
                          <div className={`space-y-1.5 rounded-lg ${ROLE_CLASSES.brand.soft} p-3`}>
                            <Label htmlFor={`client-note-${ex.id}`} className={ROLE_CLASSES.brand.text}>
                              Your notes
                            </Label>
                            <Textarea
                              id={`client-note-${ex.id}`}
                              placeholder="Anything you want your trainer to know about this exercise..."
                              value={clientNotes[ex.id] ?? ""}
                              onChange={(e) => handleClientNoteChange(ex.id, e.target.value)}
                              className={`min-h-16 resize-none bg-surface ${ROLE_CLASSES.brand.border}`}
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
        className="h-12 w-full sm:h-10"
        onClick={() => setShowEndDialog(true)}
      >
        <Trophy className="mr-2 h-4 w-4" />
        Finish Workout
      </Button>

      {/* End dialog */}
      <Dialog open={showEndDialog} onOpenChange={setShowEndDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl ${WORKOUT_STATE.completed.soft} ${WORKOUT_STATE.completed.text}`}>
              <Trophy className="h-8 w-8" />
            </div>
            <DialogTitle className="text-center text-xl">Great work!</DialogTitle>
            <p className="text-center text-sm text-muted-foreground">
              You completed {doneCount} of {totalCount} exercises.
            </p>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div>
              <Label htmlFor="checklist-rpe" className="font-semibold">
                How hard was this session?{" "}
                <span className="font-normal text-muted-foreground">RPE {rpe}/10</span>
              </Label>
              <div className="mt-3 flex items-center gap-3">
                <span className="text-xs text-muted-foreground">Easy</span>
                <input
                  id="checklist-rpe"
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
                      i < rpe ? "bg-primary" : "bg-muted"
                    }`}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="checklist-notes" className="font-semibold">
                Session Notes{" "}
                <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                id="checklist-notes"
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
              <p className={`text-sm font-semibold ${WORKOUT_STATE.completed.text}`}>Voice note sent ✓</p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="h-11" onClick={() => setShowEndDialog(false)}>
              Back
            </Button>
            <Button
              className="h-11 flex-1"
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
