"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  startSessionV2Action,
  updateSetLogV2Action,
  completeSessionV2Action,
  updateExerciseClientNoteAction,
} from "@/actions/session-v2-actions";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ExerciseImageLightbox } from "@/components/exercises/exercise-image-lightbox";
import { ExerciseVideoPlayer } from "@/components/exercises/exercise-video-player";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Check, SkipForward, X, PlayCircle, Loader2, Timer, ChevronRight, ChevronLeft, Trophy, RotateCcw, ClipboardList, Dumbbell } from "lucide-react";
import type { SetLogEntry, SetLogCache } from "./types";
import { instructionsToBullets } from "./format-instructions";
import { aggregateProgramEquipment } from "@/lib/utils/program-equipment";
import { VoiceMemoRecorder } from "@/components/voice-memo/VoiceMemoRecorder";
import { getWorkoutVoiceMemos } from "@/actions/voice-memo-actions";
import type { VoiceMemoData } from "@/actions/voice-memo-actions";

// ── Types ─────────────────────────────────────────────────────────────────────
type MediaItem = { id: string; url: string; type: string };
type BaseExercise = {
  id: string; name: string;
  imageUrl?: string | null; videoUrl?: string | null;
  bodyRegion?: string[] | null; instructions?: string | null;
  media: MediaItem[];
};
type SetLog = { id: string; setIndex: number; actualReps?: number | null; actualWeight?: number | null; actualDuration?: number | null; actualRPE?: number | null };
type BlockExerciseSet = { id: string; orderIndex: number; targetReps?: number | null; targetDuration?: number | null; targetWeight?: number | null; targetRPE?: number | null; restAfter?: number | null };
type SessionExerciseLog = { id: string; blockExerciseId: string; status: string; clientNote?: string | null; setLogs: SetLog[] };
type BlockExercise = { id: string; exerciseId: string; notes?: string | null; exercise: BaseExercise; sets: BlockExerciseSet[] };
type WorkoutBlock = {
  id: string;
  type: string;
  rounds: number;
  restBetweenRounds?: number | null;
  name?: string | null;
  exercises: BlockExercise[];
};
type WorkoutSessionV2 = {
  id: string; status: string;
  workout: { id: string; name: string; blocks: WorkoutBlock[] };
  exerciseLogs: SessionExerciseLog[];
};

// ── Flat item expansion ───────────────────────────────────────────────────────
type ExerciseFlatItem = {
  kind: "exercise";
  key: string;
  blockExercise: BlockExercise;
  round: number;
  totalRounds: number;
  isCircuit: boolean;
  blockName: string;
  blockId: string;
};

type RestFlatItem = {
  kind: "rest";
  key: string;
  blockId: string;
  blockName: string;
  restSeconds: number;
  afterRound: number;
  totalRounds: number;
};

type FlatItem = ExerciseFlatItem | RestFlatItem;

function isCircuitBlock(type: string): boolean {
  const t = type.toUpperCase();
  return t === "CIRCUIT" || t === "SUPERSET" || t === "WARMUP" || t === "COOLDOWN";
}

function buildFlatItems(blocks: WorkoutBlock[]): FlatItem[] {
  const items: FlatItem[] = [];
  for (const block of blocks) {
    const circuit = isCircuitBlock(block.type);
    const rounds = circuit ? Math.max(1, block.rounds || 1) : 1;
    const blockName = block.name || block.type;

    if (circuit) {
      for (let r = 0; r < rounds; r++) {
        for (const ex of block.exercises) {
          items.push({
            kind: "exercise",
            key: `${ex.id}_r${r}`,
            blockExercise: ex,
            round: r,
            totalRounds: rounds,
            isCircuit: true,
            blockName,
            blockId: block.id,
          });
        }
        if (r < rounds - 1 && block.restBetweenRounds && block.restBetweenRounds > 0) {
          items.push({
            kind: "rest",
            key: `rest_${block.id}_r${r}`,
            blockId: block.id,
            blockName,
            restSeconds: block.restBetweenRounds,
            afterRound: r,
            totalRounds: rounds,
          });
        }
      }
    } else {
      for (const ex of block.exercises) {
        items.push({
          kind: "exercise",
          key: ex.id,
          blockExercise: ex,
          round: 0,
          totalRounds: 1,
          isCircuit: false,
          blockName,
          blockId: block.id,
        });
      }
    }
  }
  return items;
}

type SetLogState = { actualReps?: number; actualWeight?: number; actualDuration?: number; actualRPE?: number; completed: boolean };

interface WorkoutSessionTrackerProps {
  session: WorkoutSessionV2;
  onSwitchMode?: () => void;
  additionalCompleted?: Set<string>;
  onExerciseToggle?: (blockExerciseId: string, done: boolean) => void;
  setLogCache?: SetLogCache;
  onSetLogged?: (blockExerciseId: string, setIndex: number, data: SetLogEntry) => void;
}

export function WorkoutSessionTracker({
  session,
  onSwitchMode,
  additionalCompleted,
  onExerciseToggle,
  setLogCache,
  onSetLogged,
}: WorkoutSessionTrackerProps) {
  const router = useRouter();

  const flatItems = useMemo(() => buildFlatItems(session.workout.blocks), [session.workout.blocks]);
  const exerciseItems = useMemo(() => flatItems.filter((i): i is ExerciseFlatItem => i.kind === "exercise"), [flatItems]);

  const [completedKeys, setCompletedKeys] = useState<Set<string>>(() => {
    const keys = new Set<string>();
    for (const log of session.exerciseLogs) {
      if (log.status === "COMPLETED") keys.add(log.blockExerciseId);
      for (const sl of log.setLogs) keys.add(`${log.blockExerciseId}_r${sl.setIndex}`);
    }
    // From cross-mode completions
    if (additionalCompleted) {
      for (const id of additionalCompleted) {
        keys.add(id); // Normal exercise key
      }
    }
    return keys;
  });

  const [skippedKeys, setSkippedKeys] = useState<Set<string>>(() => {
    const keys = new Set<string>();
    for (const log of session.exerciseLogs) {
      if (log.status === "SKIPPED") keys.add(log.blockExerciseId);
    }
    return keys;
  });

  const [currentIndex, setCurrentIndex] = useState(() => {
    const idx = flatItems.findIndex((item) => {
      if (item.kind !== "exercise") return false;
      const id = item.blockExercise.id;
      if (additionalCompleted?.has(id)) return false;
      if (!setLogCache?.[id]) return true;
      const block = session.workout.blocks.find((b) =>
        b.exercises.some((e) => e.id === id)
      );
      if (!block) return true;
      const setCount = isCircuitBlock(block.type)
        ? Math.max(1, block.rounds ?? 1)
        : item.blockExercise.sets.length;
      const allDone = Array.from({ length: setCount }, (_, i) => i).every(
        (i) => setLogCache[id]?.[i]?.completed
      );
      return !allDone;
    });
    return idx >= 0 ? idx : 0;
  });
  const currentIndexRef = useRef(0);
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);

  const [sessionActive, setSessionActive] = useState(session.status !== "SCHEDULED");
  const [showEndDialog, setShowEndDialog] = useState(false);
  const [rpe, setRpe] = useState(5);
  const [notes, setNotes] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [clientMemo, setClientMemo] = useState<VoiceMemoData | null>(null);
  const [memosLoaded, setMemosLoaded] = useState(false);
  const [timer, setTimer] = useState(0);
  const [timerActive, setTimerActive] = useState(session.status === "IN_PROGRESS");
  const [restCountdown, setRestCountdown] = useState<number | null>(null);
  const [activeSetLogs, setActiveSetLogs] = useState<Record<number, SetLogState>>({});
  const [loggingSet, setLoggingSet] = useState<number | null>(null);

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

  const totalItems = flatItems.length;
  const totalExerciseItems = exerciseItems.length;
  const equipment = useMemo(
    () => aggregateProgramEquipment([session.workout]),
    [session.workout]
  );

  const doneCount = useMemo(() => {
    return exerciseItems.filter(
      (item) =>
        completedKeys.has(item.key) ||
        skippedKeys.has(item.key) ||
        (additionalCompleted?.has(item.blockExercise.id) ?? false)
    ).length;
  }, [exerciseItems, completedKeys, skippedKeys, additionalCompleted]);

  const progress = totalExerciseItems > 0 ? (doneCount / totalExerciseItems) * 100 : 0;
  const currentItem = flatItems[currentIndex];

  const advanceToNext = useCallback(() => {
    const idx = currentIndexRef.current;
    if (idx < totalItems - 1) {
      setCurrentIndex(idx + 1);
    } else {
      setShowEndDialog(true);
      setTimerActive(false);
    }
  }, [totalItems]);

  // Session timer
  useEffect(() => {
    if (!timerActive) return;
    const interval = setInterval(() => setTimer((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [timerActive]);

  // Rest countdown tick
  useEffect(() => {
    if (restCountdown === null) return;
    if (restCountdown <= 0) { setRestCountdown(null); advanceToNext(); return; }
    const t = setTimeout(() => setRestCountdown((c) => (c ?? 1) - 1), 1000);
    return () => clearTimeout(t);
  }, [restCountdown, advanceToNext]);

  // Auto-start rest countdown when navigating to a rest item
  useEffect(() => {
    if (!sessionActive) return;
    const item = flatItems[currentIndex];
    if (item?.kind === "rest") {
      setRestCountdown(item.restSeconds);
    } else {
      setRestCountdown(null);
    }
  }, [currentIndex, sessionActive, flatItems]);

  // Initialize set logs when current exercise item changes
  useEffect(() => {
    if (!currentItem || currentItem.kind !== "exercise") { setActiveSetLogs({}); return; }
    const { blockExercise, round, isCircuit, key } = currentItem;
    const sessionLog = session.exerciseLogs.find((l) => l.blockExerciseId === blockExercise.id);
    const initial: Record<number, SetLogState> = {};

    if (isCircuit) {
      const targetSet = blockExercise.sets[0];
      const existing = sessionLog?.setLogs.find((sl) => sl.setIndex === round);
      const cacheEntry = setLogCache?.[blockExercise.id]?.[round];
      initial[0] = {
        actualReps: cacheEntry?.actualReps ?? existing?.actualReps ?? targetSet?.targetReps ?? undefined,
        actualWeight: cacheEntry?.actualWeight ?? existing?.actualWeight ?? targetSet?.targetWeight ?? undefined,
        actualDuration: cacheEntry?.actualDuration ?? existing?.actualDuration ?? targetSet?.targetDuration ?? undefined,
        actualRPE: cacheEntry?.actualRPE ?? existing?.actualRPE ?? targetSet?.targetRPE ?? undefined,
        completed: cacheEntry?.completed ?? (!!existing || completedKeys.has(key)),
      };
    } else {
      blockExercise.sets.forEach((set, i) => {
        const existing = sessionLog?.setLogs.find((sl) => sl.setIndex === i);
        const cacheEntry = setLogCache?.[blockExercise.id]?.[i];
        initial[i] = {
          actualReps: cacheEntry?.actualReps ?? existing?.actualReps ?? set.targetReps ?? undefined,
          actualWeight: cacheEntry?.actualWeight ?? existing?.actualWeight ?? set.targetWeight ?? undefined,
          actualDuration: cacheEntry?.actualDuration ?? existing?.actualDuration ?? set.targetDuration ?? undefined,
          actualRPE: cacheEntry?.actualRPE ?? existing?.actualRPE ?? set.targetRPE ?? undefined,
          completed: cacheEntry?.completed ?? (!!existing || completedKeys.has(key)),
        };
      });
    }
    setActiveSetLogs(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

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

  const formatTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  const handleStart = async () => {
    setIsLoading(true);
    const result = await startSessionV2Action(session.id);
    if (result.success) { setSessionActive(true); setTimerActive(true); }
    else toast.error(result.error ?? "Failed to start session");
    setIsLoading(false);
  };

  const handleSetInputChange = (index: number, field: string, value: string) => {
    setActiveSetLogs((prev) => ({
      ...prev,
      [index]: { ...prev[index], [field]: value === "" ? undefined : Number(value) },
    }));
  };

  const handleLogSet = async (setIdx: number) => {
    if (!currentItem || currentItem.kind !== "exercise") return;
    const { blockExercise, round, isCircuit, key } = currentItem;
    setLoggingSet(setIdx);
    const logData = activeSetLogs[setIdx];
    try {
      const dbSetIndex = isCircuit ? round : setIdx;
      await updateSetLogV2Action(session.id, blockExercise.id, dbSetIndex, {
        actualReps: logData?.actualReps,
        actualWeight: logData?.actualWeight,
        actualDuration: logData?.actualDuration,
        actualRPE: logData?.actualRPE,
      });
      setActiveSetLogs((prev) => ({ ...prev, [setIdx]: { ...prev[setIdx], completed: true } }));
      setCompletedKeys((prev) => new Set(prev).add(key));
      onExerciseToggle?.(blockExercise.id, true);
      onSetLogged?.(blockExercise.id, dbSetIndex, {
        actualReps: logData?.actualReps,
        actualWeight: logData?.actualWeight,
        actualDuration: logData?.actualDuration,
        actualRPE: logData?.actualRPE,
        completed: true,
      });

      if (!isCircuit) {
        const allDone = blockExercise.sets.every((_, i) => i === setIdx || activeSetLogs[i]?.completed);
        if (allDone) setTimeout(advanceToNext, 600);
      }
    } catch {
      toast.error("Failed to log set");
    } finally {
      setLoggingSet(null);
    }
  };

  const handleCompleteAll = async () => {
    if (!currentItem || currentItem.kind !== "exercise") return;
    const { blockExercise, round, isCircuit, key } = currentItem;
    setIsLoading(true);
    try {
      if (isCircuit) {
        if (!activeSetLogs[0]?.completed) {
          await updateSetLogV2Action(session.id, blockExercise.id, round, activeSetLogs[0] || {});
        }
      } else {
        for (let i = 0; i < blockExercise.sets.length; i++) {
          if (!activeSetLogs[i]?.completed) {
            await updateSetLogV2Action(session.id, blockExercise.id, i, activeSetLogs[i] || {});
          }
        }
      }
      setCompletedKeys((prev) => new Set(prev).add(key));
      onExerciseToggle?.(blockExercise.id, true);
      if (isCircuit) {
        onSetLogged?.(blockExercise.id, round, {
          actualReps: activeSetLogs[0]?.actualReps,
          actualWeight: activeSetLogs[0]?.actualWeight,
          actualDuration: activeSetLogs[0]?.actualDuration,
          actualRPE: activeSetLogs[0]?.actualRPE,
          completed: true,
        });
      } else {
        for (let i = 0; i < blockExercise.sets.length; i++) {
          onSetLogged?.(blockExercise.id, i, {
            actualReps: activeSetLogs[i]?.actualReps,
            actualWeight: activeSetLogs[i]?.actualWeight,
            actualDuration: activeSetLogs[i]?.actualDuration,
            actualRPE: activeSetLogs[i]?.actualRPE,
            completed: true,
          });
        }
      }
      advanceToNext();
    } catch {
      toast.error("Failed to save progress");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSkip = () => {
    if (!currentItem || currentItem.kind !== "exercise") return;
    setSkippedKeys((prev) => new Set(prev).add(currentItem.key));
    advanceToNext();
  };

  const handleEndSession = async () => {
    setIsLoading(true);
    const result = await completeSessionV2Action(session.id, rpe, notes);
    if (result.success) { toast.success("Workout completed! Great work!"); router.push("/dashboard"); }
    else toast.error(result.error ?? "Failed to complete session");
    setIsLoading(false);
  };

  // ── Pre-start screen ──────────────────────────────────────────────────────
  if (!sessionActive) {
    return (
      <div className="mx-auto max-w-lg">
        <div className="overflow-hidden rounded-2xl border-0 shadow-xl ring-1 ring-border/50">
          <div className="bg-muted p-8 text-center">
            <PlayCircle className="mx-auto mb-4 h-14 w-14 text-primary" strokeWidth={1.5} />
            <h2 className="text-2xl font-bold text-foreground">{session.workout.name}</h2>
            <p className="mt-3 text-muted-foreground">
              {session.workout.blocks.reduce((n, b) => n + b.exercises.length, 0)} exercises · Let&apos;s go!
            </p>
            {equipment.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
                <Dumbbell className="h-3.5 w-3.5 text-muted-foreground/70" />
                {equipment.map((item) => (
                  <Badge key={item} variant="secondary" className="text-[11px] font-medium">
                    {item}
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <div className="bg-card p-6">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Session Overview
            </p>
            <div className="space-y-2">
              {session.workout.blocks.map((block) => (
                <div key={block.id} className="flex items-center gap-3 rounded-lg bg-muted/40 px-3 py-2">
                  <span className="truncate text-sm font-medium">{block.name || block.type}</span>
                  {isCircuitBlock(block.type) && block.rounds > 1 && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
                      {block.rounds} rounds
                    </Badge>
                  )}
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    {block.exercises.length} ex.
                  </span>
                </div>
              ))}
            </div>
            <Button
              size="lg"
              className="mt-6 w-full"
              onClick={handleStart}
              disabled={isLoading}
            >
              {isLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <PlayCircle className="mr-2 h-5 w-5" />}
              Start Session
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Active workout ────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-lg space-y-4 pb-24">
      {/* Top bar */}
      <div className="flex items-center justify-between rounded-2xl border border-border/60 bg-card px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Timer className="h-4 w-4 text-primary" />
          {formatTime(timer)}
        </div>
        <Badge variant="outline" className="font-semibold">
          {doneCount} / {totalExerciseItems}
        </Badge>
        <div className="flex items-center gap-1">
          {onSwitchMode && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              onClick={onSwitchMode}
            >
              <ClipboardList className="h-3.5 w-3.5" />
              Checklist
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => { toast.info("Session preserved"); router.push("/dashboard"); }}
          >
            <X className="h-3.5 w-3.5" /> End
          </Button>
        </div>
      </div>

      {/* Progress */}
      <div className="space-y-1.5">
        <Progress value={progress} className="h-2 rounded-full" />
        <div className="flex justify-between text-[11px] text-muted-foreground">
          <span>{Math.round(progress)}% complete</span>
          <span>{totalExerciseItems - doneCount} remaining</span>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1 text-xs"
          disabled={currentIndex === 0}
          onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Prev
        </Button>
        <span className="text-sm font-semibold text-muted-foreground">
          {currentItem?.kind === "rest" ? "Rest" : `${currentIndex + 1} of ${totalItems}`}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1 text-xs"
          disabled={currentIndex === totalItems - 1}
          onClick={() => setCurrentIndex((i) => Math.min(totalItems - 1, i + 1))}
        >
          Next <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Rest card */}
      {currentItem?.kind === "rest" && (
        <Card className="overflow-hidden border-0 shadow-md ring-1 ring-border/50">
          <div className="h-1 w-full bg-amber-400" />
          <CardContent className="p-6 text-center space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50">
              <Timer className="h-8 w-8 text-amber-500" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {currentItem.blockName}
              </p>
              <p className="text-lg font-bold mt-1">Rest Between Rounds</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                After round {currentItem.afterRound + 1} of {currentItem.totalRounds}
              </p>
            </div>
            <div className="text-5xl font-bold tabular-nums text-amber-500">
              {restCountdown !== null ? formatTime(restCountdown) : formatTime(currentItem.restSeconds)}
            </div>
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => { setRestCountdown(null); advanceToNext(); }}
            >
              <SkipForward className="h-4 w-4" />
              Skip Rest
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Exercise card */}
      {currentItem?.kind === "exercise" && (() => {
        const { blockExercise, round, totalRounds, isCircuit, blockName, key } = currentItem;
        const isCompleted = completedKeys.has(key) || (additionalCompleted?.has(blockExercise.id) ?? false);
        const isSkipped = skippedKeys.has(key);
        const targetSet = blockExercise.sets[0];

        return (
          <Card className="overflow-hidden border-0 shadow-md ring-1 ring-border/50">
            <div className={`h-1 w-full ${isCompleted ? "bg-emerald-500" : isSkipped ? "bg-muted" : "bg-primary"}`} />
            <CardContent className="p-5 space-y-4">
              {/* Block + round badges */}
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5">{blockName}</Badge>
                {isCircuit && totalRounds > 1 && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 bg-indigo-50 text-indigo-700 border-indigo-200">
                    <RotateCcw className="h-2.5 w-2.5 mr-1" />
                    Round {round + 1} / {totalRounds}
                  </Badge>
                )}
              </div>

              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-xl font-bold leading-tight">{blockExercise.exercise.name}</h3>
                {isCompleted && (
                  <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 border shrink-0">
                    <Check className="mr-1 h-3 w-3" /> Done
                  </Badge>
                )}
                {isSkipped && (
                  <Badge className="bg-muted text-muted-foreground border shrink-0">Skipped</Badge>
                )}
              </div>

              {/* Video (preferred) or image — one compact box, no separate thumbnail below */}
              {blockExercise.exercise.videoUrl || blockExercise.exercise.media.length > 0 ? (
                <div className="mx-auto w-full max-w-xs">
                  <ExerciseVideoPlayer
                    videoUrl={blockExercise.exercise.videoUrl ?? undefined}
                    mediaItems={blockExercise.exercise.media.map((m) => ({ id: m.id, url: m.url, mediaType: m.type }))}
                  />
                </div>
              ) : (
                <ExerciseImageLightbox
                  src={blockExercise.exercise.imageUrl ?? undefined}
                  alt={blockExercise.exercise.name}
                  bodyRegion={blockExercise.exercise.bodyRegion?.[0] ?? ""}
                  label={blockExercise.exercise.name.split(" ").slice(0, 2).join(" ")}
                  thumbnailClassName="relative h-40 w-full overflow-hidden rounded-xl"
                />
              )}

              {/* Instructions */}
              {blockExercise.exercise.instructions && (
                <div className="rounded-xl bg-muted/40 px-4 py-3">
                  <ul className="space-y-1 text-sm leading-relaxed text-muted-foreground list-disc pl-4">
                    {instructionsToBullets(blockExercise.exercise.instructions).map((line, idx) => (
                      <li key={idx}>{line}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Trainer notes */}
              {blockExercise.notes && (
                <div className="rounded-xl bg-muted/60 px-3 py-2.5">
                  <p className="text-sm text-blue-700">
                    <span className="font-semibold">Tip:</span>{" "}
                    <span className="italic">{blockExercise.notes}</span>
                  </p>
                </div>
              )}

              {/* Circuit: single round log entry */}
              {isCircuit && targetSet && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Log Set
                  </p>
                  <div className={`flex items-center gap-3 rounded-xl border p-3 transition-colors ${activeSetLogs[0]?.completed ? "border-emerald-200 bg-emerald-50/50" : "border-border bg-background"}`}>
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${activeSetLogs[0]?.completed ? "bg-emerald-500 text-white" : "bg-primary/10 text-primary"}`}>
                      {activeSetLogs[0]?.completed ? <Check className="h-4 w-4" /> : round + 1}
                    </div>
                    <div className="flex flex-1 flex-wrap gap-2">
                      {targetSet.targetReps != null && (
                        <div className="space-y-0.5">
                          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Reps completed</Label>
                          <Input type="number" placeholder={targetSet.targetReps.toString()} value={activeSetLogs[0]?.actualReps ?? ""} onChange={(e) => handleSetInputChange(0, "actualReps", e.target.value)} className="h-8 w-20 text-sm" disabled={activeSetLogs[0]?.completed} />
                        </div>
                      )}
                      {targetSet.targetWeight != null && (
                        <div className="space-y-0.5">
                          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Weight</Label>
                          <Input type="number" placeholder={targetSet.targetWeight.toString()} value={activeSetLogs[0]?.actualWeight ?? ""} onChange={(e) => handleSetInputChange(0, "actualWeight", e.target.value)} className="h-8 w-20 text-sm" disabled={activeSetLogs[0]?.completed} />
                        </div>
                      )}
                      {targetSet.targetDuration != null && (
                        <div className="space-y-0.5">
                          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Secs</Label>
                          <Input type="number" placeholder={targetSet.targetDuration.toString()} value={activeSetLogs[0]?.actualDuration ?? ""} onChange={(e) => handleSetInputChange(0, "actualDuration", e.target.value)} className="h-8 w-20 text-sm" disabled={activeSetLogs[0]?.completed} />
                        </div>
                      )}
                      <div className="space-y-0.5">
                        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">RPE</Label>
                        <Input type="number" min={0} max={10} placeholder={targetSet.targetRPE?.toString() ?? "—"} value={activeSetLogs[0]?.actualRPE ?? ""} onChange={(e) => handleSetInputChange(0, "actualRPE", e.target.value)} className="h-8 w-16 text-sm" disabled={activeSetLogs[0]?.completed} />
                      </div>
                      {targetSet.restAfter != null && (
                        <div className="space-y-0.5">
                          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Rest</Label>
                          <p className="h-8 flex items-center text-sm text-muted-foreground">{targetSet.restAfter}s</p>
                        </div>
                      )}
                    </div>
                    <Button
                      size="icon"
                      variant="outline"
                      className={`h-8 w-8 shrink-0 rounded-full border-2 ${activeSetLogs[0]?.completed ? "border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-500" : "border-muted-foreground/30 bg-transparent"}`}
                      onClick={() => handleLogSet(0)}
                      disabled={activeSetLogs[0]?.completed || loggingSet === 0}
                    >
                      {loggingSet === 0 ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </div>
              )}

              {/* Normal: all sets */}
              {!isCircuit && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Sets</p>
                  {blockExercise.sets.map((set, i) => {
                    const logData = activeSetLogs[i] || {};
                    const isSetDone = logData.completed;
                    return (
                      <div key={set.id} className={`flex items-center gap-3 rounded-xl border p-3 transition-colors ${isSetDone ? "border-emerald-200 bg-emerald-50/50" : "border-border bg-background"}`}>
                        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${isSetDone ? "bg-emerald-500 text-white" : "bg-primary/10 text-primary"}`}>
                          {isSetDone ? <Check className="h-4 w-4" /> : i + 1}
                        </div>
                        <div className="flex flex-1 flex-wrap gap-2">
                          {set.targetReps != null && (
                            <div className="space-y-0.5">
                              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Reps completed</Label>
                              <Input type="number" placeholder={set.targetReps.toString()} value={logData.actualReps ?? ""} onChange={(e) => handleSetInputChange(i, "actualReps", e.target.value)} className="h-8 w-20 text-sm" disabled={isSetDone} />
                            </div>
                          )}
                          {set.targetWeight != null && (
                            <div className="space-y-0.5">
                              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Weight</Label>
                              <Input type="number" placeholder={set.targetWeight.toString()} value={logData.actualWeight ?? ""} onChange={(e) => handleSetInputChange(i, "actualWeight", e.target.value)} className="h-8 w-20 text-sm" disabled={isSetDone} />
                            </div>
                          )}
                          {set.targetDuration != null && (
                            <div className="space-y-0.5">
                              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Secs</Label>
                              <Input type="number" placeholder={set.targetDuration.toString()} value={logData.actualDuration ?? ""} onChange={(e) => handleSetInputChange(i, "actualDuration", e.target.value)} className="h-8 w-20 text-sm" disabled={isSetDone} />
                            </div>
                          )}
                          <div className="space-y-0.5">
                            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">RPE</Label>
                            <Input type="number" min={0} max={10} placeholder={set.targetRPE?.toString() ?? "—"} value={logData.actualRPE ?? ""} onChange={(e) => handleSetInputChange(i, "actualRPE", e.target.value)} className="h-8 w-16 text-sm" disabled={isSetDone} />
                          </div>
                          {set.restAfter != null && (
                            <div className="space-y-0.5">
                              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Rest</Label>
                              <p className="h-8 flex items-center text-sm text-muted-foreground">{set.restAfter}s</p>
                            </div>
                          )}
                        </div>
                        <Button
                          size="icon"
                          variant="outline"
                          className={`h-8 w-8 shrink-0 rounded-full border-2 ${isSetDone ? "border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-500" : "border-muted-foreground/30 bg-transparent"}`}
                          onClick={() => handleLogSet(i)}
                          disabled={isSetDone || loggingSet === i}
                        >
                          {loggingSet === i ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Client note */}
              <div className="space-y-1.5 rounded-xl bg-violet-50/30 p-3">
                <Label htmlFor={`client-note-${blockExercise.id}`} className="text-xs font-semibold uppercase tracking-widest text-violet-600/80">
                  Your Notes
                </Label>
                <Textarea
                  id={`client-note-${blockExercise.id}`}
                  placeholder="Anything you want your trainer to know about this exercise..."
                  value={clientNotes[blockExercise.id] ?? ""}
                  onChange={(e) => handleClientNoteChange(blockExercise.id, e.target.value)}
                  className="min-h-14 text-xs italic resize-none bg-background/70 border-violet-100"
                />
              </div>

              {/* Action buttons */}
              <div className="flex gap-3 pt-1">
                <Button
                  className="flex-1"
                  onClick={handleCompleteAll}
                  disabled={isLoading}
                >
                  {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                  Complete
                </Button>
                <Button variant="outline" className="flex-1 gap-2" onClick={handleSkip} disabled={isLoading}>
                  <SkipForward className="h-4 w-4" /> Skip
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* End session dialog */}
      <Dialog open={showEndDialog} onOpenChange={setShowEndDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-700">
              <Trophy className="h-8 w-8" />
            </div>
            <DialogTitle className="text-center text-xl">Great work!</DialogTitle>
            <p className="text-center text-sm text-muted-foreground">
              You completed {doneCount} of {totalExerciseItems} exercises in {formatTime(timer)}.
            </p>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div>
              <Label className="font-semibold">
                How hard was this session? <span className="font-normal text-muted-foreground">RPE {rpe}/10</span>
              </Label>
              <div className="mt-3 flex items-center gap-3">
                <span className="text-xs text-muted-foreground">Easy</span>
                <input type="range" min={0} max={10} value={rpe} onChange={(e) => setRpe(Number(e.target.value))} className="flex-1 accent-primary" />
                <span className="text-xs text-muted-foreground">Max</span>
              </div>
              <div className="mt-2 flex gap-1">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i < rpe ? i < 4 ? "bg-emerald-500" : i < 7 ? "bg-amber-500" : "bg-red-500" : "bg-muted"}`} />
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="font-semibold">Session Notes <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Textarea placeholder="How did it feel? Any pain or discomfort to flag?" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="resize-none" />
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
            <Button variant="outline" onClick={() => { toast.info("Session preserved"); router.push("/dashboard"); }}>
              Skip &amp; Exit
            </Button>
            <Button
              className="flex-1"
              onClick={handleEndSession}
              disabled={isLoading}
            >
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
              Complete Session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
