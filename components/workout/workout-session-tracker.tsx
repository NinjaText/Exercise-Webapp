"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { isAfter, startOfDay } from "date-fns";
import {
  startSessionV2Action,
  updateSetLogV2Action,
  completeSessionV2Action,
  updateExerciseClientNoteAction,
} from "@/actions/session-v2-actions";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import { toLocalCalendarDate } from "@/lib/utils/calendar-date";
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Check, SkipForward, X, PlayCircle, Loader2, Timer, ChevronRight, ChevronLeft, ChevronDown, Trophy, RotateCcw, ClipboardList, Dumbbell, MessageSquarePlus } from "lucide-react";
import { SKIP_REASONS, type SetLogEntry, type SetLogCache } from "./types";
import { instructionsToBullets } from "./format-instructions";
import { isCircuitBlock, prescriptionSummary, segmentLabel } from "./prescription";
import { WorkoutExercisePreview } from "./workout-exercise-preview";
import {
  WORKOUT_STATE,
  WORKOUT_TOUCH,
  WORKOUT_TOUCH_ICON,
  SET_FIELD,
  SET_FIELD_LABEL,
  SET_FIELD_INPUT,
  SET_FIELD_STATIC,
} from "./workout-tokens";
import { cn } from "@/lib/utils";
import { ROLE_CLASSES } from "@/lib/ui/status";
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
type SetLog = { id: string; setIndex: number; actualReps?: number | null; actualWeight?: number | null; actualDuration?: number | null; actualDistance?: number | null; actualRPE?: number | null };
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
type SessionExerciseLog = { id: string; blockExerciseId: string; status: string; clientNote?: string | null; setLogs: SetLog[] };
type BlockExercise = { id: string; exerciseId: string; notes?: string | null; activityType?: string | null; exercise: BaseExercise; sets: BlockExerciseSet[] };
type WorkoutBlock = {
  id: string;
  type: string;
  rounds: number;
  restBetweenRounds?: number | null;
  name?: string | null;
  exercises: BlockExercise[];
};
type WorkoutSessionV2 = {
  id: string; status: string; scheduledDate: Date | string;
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

export function isSessionStartable(status: string): boolean {
  return status === "SCHEDULED" || status === "MISSED";
}

export function isEarlyStart(scheduledDate: Date | string, now: Date = new Date()): boolean {
  return isAfter(toLocalCalendarDate(new Date(scheduledDate)), startOfDay(now));
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

type SetLogState = { actualReps?: number; actualWeight?: number; actualDuration?: number; actualDistance?: number; actualRPE?: number; completed: boolean };

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

  const [sessionActive, setSessionActive] = useState(!isSessionStartable(session.status));
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
  const [instructionsExpanded, setInstructionsExpanded] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  // Skip flow: the timer pauses while the client says why they're skipping.
  const [skipDialogOpen, setSkipDialogOpen] = useState(false);
  const [skipReason, setSkipReason] = useState<string | null>(null);
  const [skipOther, setSkipOther] = useState("");
  const [isSkipping, setIsSkipping] = useState(false);

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
        actualDistance: cacheEntry?.actualDistance ?? existing?.actualDistance ?? targetSet?.targetDistance ?? undefined,
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
          actualDistance: cacheEntry?.actualDistance ?? existing?.actualDistance ?? set.targetDistance ?? undefined,
          actualRPE: cacheEntry?.actualRPE ?? existing?.actualRPE ?? set.targetRPE ?? undefined,
          completed: cacheEntry?.completed ?? (!!existing || completedKeys.has(key)),
        };
      });
    }
    setActiveSetLogs(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  // Instructions and the note box collapse by default per exercise
  useEffect(() => {
    setInstructionsExpanded(false);
    setNotesOpen(false);
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
        actualDistance: logData?.actualDistance,
        actualRPE: logData?.actualRPE,
      });
      setActiveSetLogs((prev) => ({ ...prev, [setIdx]: { ...prev[setIdx], completed: true } }));
      // An exercise only counts as done once every one of its sets is logged —
      // a circuit item is a single round, so logging it finishes the item.
      const allDone =
        isCircuit || blockExercise.sets.every((_, i) => i === setIdx || activeSetLogs[i]?.completed);
      if (allDone) {
        setCompletedKeys((prev) => new Set(prev).add(key));
        onExerciseToggle?.(blockExercise.id, true);
      }
      onSetLogged?.(blockExercise.id, dbSetIndex, {
        actualReps: logData?.actualReps,
        actualWeight: logData?.actualWeight,
        actualDuration: logData?.actualDuration,
        actualDistance: logData?.actualDistance,
        actualRPE: logData?.actualRPE,
        completed: true,
      });

      // Ticking the last set (or a circuit round) finishes the exercise, so move
      // on after a beat that lets the check register — unless the client has
      // already navigated elsewhere in the meantime.
      if (allDone) {
        const loggedIndex = currentIndex;
        setTimeout(() => {
          if (currentIndexRef.current === loggedIndex) advanceToNext();
        }, 600);
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
          actualDistance: activeSetLogs[0]?.actualDistance,
          actualRPE: activeSetLogs[0]?.actualRPE,
          completed: true,
        });
      } else {
        for (let i = 0; i < blockExercise.sets.length; i++) {
          onSetLogged?.(blockExercise.id, i, {
            actualReps: activeSetLogs[i]?.actualReps,
            actualWeight: activeSetLogs[i]?.actualWeight,
            actualDuration: activeSetLogs[i]?.actualDuration,
            actualDistance: activeSetLogs[i]?.actualDistance,
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
    setSkipReason(null);
    setSkipOther("");
    setTimerActive(false);
    setSkipDialogOpen(true);
  };

  const cancelSkip = () => {
    setSkipDialogOpen(false);
    setTimerActive(true);
  };

  // Logged like the checklist's skip: 0 reps with the reason in the set's
  // notes, so the trainer sees "Skipped" and why in either mode.
  const confirmSkip = async () => {
    if (!currentItem || currentItem.kind !== "exercise" || !skipReason) return;
    const { blockExercise, round, isCircuit, key } = currentItem;
    const reason = skipReason === "Other" ? skipOther.trim() || "Other" : skipReason;
    const setIndexes = isCircuit
      ? [round]
      : blockExercise.sets.map((_, i) => i).filter((i) => !activeSetLogs[i]?.completed);
    setIsSkipping(true);
    try {
      for (const i of setIndexes) {
        const result = await updateSetLogV2Action(session.id, blockExercise.id, i, { actualReps: 0, notes: reason });
        if (!result.success) throw new Error(result.error);
        onSetLogged?.(blockExercise.id, i, { actualReps: 0, completed: true });
      }
      setSkippedKeys((prev) => new Set(prev).add(key));
      setSkipDialogOpen(false);
      setTimerActive(true);
      advanceToNext();
    } catch {
      toast.error("Couldn't skip this exercise. Try again.");
    } finally {
      setIsSkipping(false);
    }
  };

  const handleEndSession = async () => {
    setIsLoading(true);
    const result = await completeSessionV2Action(session.id, rpe, notes);
    if (result.success) { toast.success("Workout completed! Great work!"); router.push("/dashboard"); }
    else toast.error(result.error ?? "Failed to complete session");
    setIsLoading(false);
  };

  // ── Pre-start screen ──────────────────────────────────────────────────────
  // The page header already carries the workout name, so this card leads with
  // what the client is about to do rather than repeating the title.
  if (!sessionActive) {
    return (
      <div className="w-full">
        <Card className="gap-0 overflow-hidden py-0">
          <div className="flex flex-col items-center gap-3 px-5 pt-8 pb-6 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <PlayCircle className="size-7" strokeWidth={1.75} aria-hidden />
            </span>
            <div>
              <h2 className="text-title text-foreground">Guided workout</h2>
              <p className="mt-1 text-body text-muted-foreground">
                {session.workout.blocks.reduce((n, b) => n + b.exercises.length, 0)} exercises · Let&apos;s go!
              </p>
            </div>
            {equipment.length > 0 && (
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                <Dumbbell className="size-3.5 text-muted-foreground" aria-hidden />
                {equipment.map((item) => (
                  <Badge key={item} variant="secondary">
                    {item}
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <div className="border-t border-border p-4 sm:p-5">
            <p className="mb-3 text-label text-muted-foreground">Exercises in this workout</p>
            <WorkoutExercisePreview blocks={session.workout.blocks} />
            <Button
              size="lg"
              className="mt-5 h-12 w-full sm:h-10"
              onClick={handleStart}
              disabled={isLoading}
            >
              {isLoading ? <Loader2 className="mr-2 size-5 animate-spin" /> : <PlayCircle className="mr-2 size-5" />}
              Start Session
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // ── Active workout ────────────────────────────────────────────────────────
  const currentDone =
    currentItem?.kind === "exercise" &&
    (completedKeys.has(currentItem.key) ||
      skippedKeys.has(currentItem.key) ||
      (additionalCompleted?.has(currentItem.blockExercise.id) ?? false));
  // Complete stays locked until the client has ticked off every set themselves
  // (a circuit item shows a single round, held at index 0).
  const currentSetCount =
    currentItem?.kind === "exercise" ? (currentItem.isCircuit ? 1 : currentItem.blockExercise.sets.length) : 0;
  const loggedSetCount = Array.from({ length: currentSetCount }, (_, i) => i).filter(
    (i) => activeSetLogs[i]?.completed
  ).length;
  const allSetsLogged = loggedSetCount >= currentSetCount;

  // Exercise actions: Complete is the forward button (Next once done). Phones
  // and tablets get them in a thumb-reach bar above the tab bar; from `lg`
  // they stay pinned in the top bar beside the timer.
  const renderActions = (className?: string) => (
    <div className={cn("flex items-center gap-2", className)}>
      <Button
        variant="outline"
        className={cn(WORKOUT_TOUCH, "gap-1 px-2.5 sm:px-3")}
        disabled={currentIndex === 0}
        onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
        aria-label="Previous exercise"
      >
        <ChevronLeft className="size-4" />
        <span className="hidden sm:inline">Prev</span>
      </Button>
      <span className="min-w-0 flex-1 truncate text-center text-label tabular-nums text-muted-foreground">
        {currentItem?.kind === "rest" ? "Rest" : `${currentIndex + 1} of ${totalItems}`}
      </span>
      {currentItem?.kind === "rest" ? (
        <Button
          className={cn(WORKOUT_TOUCH, "gap-1.5 px-4")}
          onClick={() => { setRestCountdown(null); advanceToNext(); }}
        >
          <SkipForward className="size-4" /> Skip rest
        </Button>
      ) : currentDone ? (
        <Button className={cn(WORKOUT_TOUCH, "gap-1 px-4")} onClick={advanceToNext}>
          {currentIndex === totalItems - 1 ? "Finish" : "Next"} <ChevronRight className="size-4" />
        </Button>
      ) : (
        <>
          <Button
            variant="outline"
            className={cn(WORKOUT_TOUCH, "gap-1.5 px-3")}
            onClick={handleSkip}
            disabled={isLoading}
          >
            <SkipForward className="size-4" /> Skip
          </Button>
          <Button
            className={cn(WORKOUT_TOUCH, "gap-1.5 px-4")}
            onClick={handleCompleteAll}
            disabled={isLoading || !allSetsLogged}
            title={allSetsLogged ? undefined : "Mark every set complete first"}
          >
            {isLoading ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            Complete
            {!allSetsLogged && currentSetCount > 1 && (
              <span className="tabular-nums opacity-80">
                {loggedSetCount}/{currentSetCount}
              </span>
            )}
          </Button>
        </>
      )}
    </div>
  );

  return (
    <div className="flex w-full flex-col gap-3">
      {/* Timer, progress, exits (and from `lg` the exercise actions) — pinned
          so Complete and Skip are always in reach, however long the exercise
          card is. The negative top offset matches <main>'s gutter (p-4 / lg:p-6 / 2xl:p-8)
          so the bar sits flush with the top of the scroll area. */}
      <div className="sticky -top-4 z-20 -mx-4 border-b border-border bg-canvas/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-canvas/80 sm:mx-0 sm:rounded-xl sm:rounded-t-none sm:border sm:bg-surface sm:shadow-xs lg:-top-6 2xl:-top-8">
        <div className="flex items-center gap-3">
          <div className="flex shrink-0 items-center gap-2 text-heading tabular-nums">
            <Timer className="size-4 text-primary" aria-hidden />
            {formatTime(timer)}
          </div>
          <Progress value={progress} className="hidden h-1.5 flex-1 rounded-full sm:block" />
          <span className="ml-auto shrink-0 text-caption tabular-nums sm:ml-0">
            {doneCount}/{totalExerciseItems} done
          </span>
          <div className="flex shrink-0 items-center gap-1">
            {onSwitchMode && (
              <Button
                variant="ghost"
                className={cn(WORKOUT_TOUCH, "gap-1.5 px-2.5 text-muted-foreground hover:text-foreground")}
                onClick={onSwitchMode}
              >
                <ClipboardList className="size-4" />
                <span className="hidden sm:inline">Checklist</span>
              </Button>
            )}
            <Button
              variant="ghost"
              className={cn(WORKOUT_TOUCH, "gap-1.5 px-2.5 text-destructive hover:bg-destructive/10 hover:text-destructive")}
              onClick={() => { toast.info("Session preserved"); router.push("/dashboard"); }}
            >
              <X className="size-4" /> End
            </Button>
          </div>
        </div>
        <Progress value={progress} className="mt-2 h-1.5 rounded-full sm:hidden" />

        {renderActions("mt-3 hidden lg:flex")}
      </div>

      {/* Rest card */}
      {currentItem?.kind === "rest" && (
        <Card className="relative">
          <div className={`absolute inset-x-0 top-0 h-1 ${ROLE_CLASSES.info.dot}`} aria-hidden />
          <CardContent className="space-y-4 py-3 text-center">
            <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-2xl ${ROLE_CLASSES.info.soft}`}>
              <Timer className={`h-8 w-8 ${ROLE_CLASSES.info.text}`} />
            </div>
            <div>
              <p className="text-label text-muted-foreground">
                {currentItem.blockName}
              </p>
              <p className="mt-1 text-title">Rest between rounds</p>
              <p className="mt-1 text-caption">
                After round {currentItem.afterRound + 1} of {currentItem.totalRounds}
              </p>
            </div>
            <div className={`text-5xl font-semibold tabular-nums ${ROLE_CLASSES.info.text}`} aria-live="polite">
              {restCountdown !== null ? formatTime(restCountdown) : formatTime(currentItem.restSeconds)}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Exercise card — media beside the log on wide screens so the whole
          exercise fits on one screen; stacked on phones. */}
      {currentItem?.kind === "exercise" && (() => {
        const { blockExercise, round, totalRounds, isCircuit, blockName, key } = currentItem;
        const isCompleted = completedKeys.has(key) || (additionalCompleted?.has(blockExercise.id) ?? false);
        const isSkipped = skippedKeys.has(key);
        const targetSet = blockExercise.sets[0];
        const activityType = blockExercise.activityType || "STRENGTH";
        const isRunType = activityType !== "STRENGTH";
        // Interval Run is a sequence of distinct segments (warm-up, work,
        // recovery, cool-down) — never a repeating round like a circuit.
        const showAsSegments = activityType === "INTERVAL_RUN";
        const hasVideo = Boolean(blockExercise.exercise.videoUrl || blockExercise.exercise.media.some((m) => m.type.toLowerCase() === "video"));
        const note = clientNotes[blockExercise.id] ?? "";

        return (
          <Card className="gap-0 overflow-hidden py-0">
            <div className={`h-1 w-full ${isCompleted ? WORKOUT_STATE.completed.dot : isSkipped ? "bg-muted" : "bg-primary"}`} />
            <CardContent className="grid gap-4 p-3 sm:p-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-6">
              {/* Header */}
              <div className="flex items-start justify-between gap-2 lg:col-span-2">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{blockName}</Badge>
                    {isCircuit && totalRounds > 1 && (
                      <Badge variant="outline" className={`${ROLE_CLASSES.brand.soft} ${ROLE_CLASSES.brand.text} ${ROLE_CLASSES.brand.border}`}>
                        <RotateCcw className="mr-1 size-3" aria-hidden />
                        Round {round + 1} / {totalRounds}
                      </Badge>
                    )}
                    {isRunType && (
                      <Badge variant="outline" className={`${WORKOUT_STATE.current.soft} ${WORKOUT_STATE.current.text} ${WORKOUT_STATE.current.border}`}>
                        {activityType === "INTERVAL_RUN" ? "Interval Run" : "Run"}
                      </Badge>
                    )}
                  </div>
                  <h3 className="text-title text-foreground">{blockExercise.exercise.name}</h3>
                </div>
                {isCompleted && (
                  <Badge className={`${WORKOUT_STATE.completed.soft} ${WORKOUT_STATE.completed.text} ${WORKOUT_STATE.completed.border} border shrink-0`}>
                    <Check className="mr-1 h-3 w-3" /> Done
                  </Badge>
                )}
                {isSkipped && (
                  <Badge variant="secondary" className="shrink-0">Skipped</Badge>
                )}
              </div>

              {/* Video (preferred) or image */}
              <div className="lg:self-start">
                {hasVideo ? (
                  <div className="mx-auto w-full max-w-xs lg:max-w-none">
                    <ExerciseVideoPlayer
                      videoUrl={blockExercise.exercise.videoUrl ?? undefined}
                      mediaItems={blockExercise.exercise.media.map((m) => ({ id: m.id, url: m.url, mediaType: m.type }))}
                    />
                  </div>
                ) : (
                  <ExerciseImageLightbox
                    src={blockExercise.exercise.imageUrl ?? blockExercise.exercise.media.find((m) => m.type.toLowerCase() === "image")?.url ?? undefined}
                    alt={blockExercise.exercise.name}
                    label={blockExercise.exercise.name.split(" ").slice(0, 2).join(" ")}
                    thumbnailClassName="relative h-36 w-full overflow-hidden rounded-xl lg:h-56"
                  />
                )}
              </div>

              <div className="min-w-0 space-y-4">
              {/* Trainer notes */}
              {blockExercise.notes && (
                <div className="rounded-lg bg-surface-muted px-3 py-2.5">
                  <p className={`text-body ${WORKOUT_STATE.current.text}`}>
                    <span className="font-semibold">Tip:</span>{" "}
                    <span className="italic">{blockExercise.notes}</span>
                  </p>
                </div>
              )}

              {/* Instructions (collapsed by default) */}
              {blockExercise.exercise.instructions && (
                <div className="rounded-lg bg-surface-muted px-4">
                  <button
                    type="button"
                    onClick={() => setInstructionsExpanded((v) => !v)}
                    aria-expanded={instructionsExpanded}
                    className="flex min-h-11 w-full items-center justify-between rounded-sm text-label text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Instructions
                    <ChevronDown className={`size-4 transition-transform motion-reduce:transition-none ${instructionsExpanded ? "rotate-180" : ""}`} aria-hidden />
                  </button>
                  {instructionsExpanded && (
                    <ul className="list-disc space-y-1 pb-3 pl-4 text-body text-muted-foreground">
                      {instructionsToBullets(blockExercise.exercise.instructions).map((line, idx) => (
                        <li key={idx}>{line}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Circuit: single round log entry (never for Interval Run — its segments are ordered, not repeating rounds) */}
              {isCircuit && !showAsSegments && targetSet && (
                <div className="space-y-3">
                  <p className="text-label text-muted-foreground">Log set</p>
                  <div className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${activeSetLogs[0]?.completed ? `${WORKOUT_STATE.completed.border} ${WORKOUT_STATE.completed.soft}` : "border-border bg-surface"}`}>
                    <div className={`flex size-9 shrink-0 items-center justify-center rounded-full text-label tabular-nums ${activeSetLogs[0]?.completed ? `${WORKOUT_STATE.completed.dot} text-white` : "bg-primary/10 text-primary"}`}>
                      {activeSetLogs[0]?.completed ? <Check className="h-4 w-4" /> : round + 1}
                    </div>
                    <div className="min-w-0 flex-1 space-y-2">
                      {isRunType && prescriptionSummary(targetSet) && (
                        <p className="text-caption">{prescriptionSummary(targetSet)}</p>
                      )}
                      <div className="grid grid-cols-[repeat(auto-fit,minmax(3.75rem,1fr))] items-end gap-2 sm:flex sm:flex-wrap">
                        {!isRunType && targetSet.targetReps != null && (
                          <label className={SET_FIELD}>
                            <span className={SET_FIELD_LABEL}>Reps completed</span>
                            <Input type="number" inputMode="numeric" placeholder={targetSet.targetReps.toString()} value={activeSetLogs[0]?.actualReps ?? ""} onChange={(e) => handleSetInputChange(0, "actualReps", e.target.value)} className={cn(SET_FIELD_INPUT, "w-full sm:w-20")} disabled={activeSetLogs[0]?.completed} />
                          </label>
                        )}
                        {!isRunType && targetSet.targetWeight != null && (
                          <label className={SET_FIELD}>
                            <span className={SET_FIELD_LABEL}>Weight</span>
                            <Input type="number" inputMode="decimal" placeholder={targetSet.targetWeight.toString()} value={activeSetLogs[0]?.actualWeight ?? ""} onChange={(e) => handleSetInputChange(0, "actualWeight", e.target.value)} className={cn(SET_FIELD_INPUT, "w-full sm:w-20")} disabled={activeSetLogs[0]?.completed} />
                          </label>
                        )}
                        {isRunType && targetSet.targetDistance != null && (
                          <label className={SET_FIELD}>
                            <span className={SET_FIELD_LABEL}>Distance (mi)</span>
                            <Input type="number" inputMode="decimal" step={0.1} placeholder={targetSet.targetDistance.toString()} value={activeSetLogs[0]?.actualDistance ?? ""} onChange={(e) => handleSetInputChange(0, "actualDistance", e.target.value)} className={cn(SET_FIELD_INPUT, "w-full sm:w-20")} disabled={activeSetLogs[0]?.completed} />
                          </label>
                        )}
                        {targetSet.targetDuration != null && (
                          <label className={SET_FIELD}>
                            <span className={SET_FIELD_LABEL}>{targetSet.targetDurationUnit === "MIN" ? "Min" : "Secs"}</span>
                            <Input type="number" inputMode="numeric" placeholder={targetSet.targetDuration.toString()} value={activeSetLogs[0]?.actualDuration ?? ""} onChange={(e) => handleSetInputChange(0, "actualDuration", e.target.value)} className={cn(SET_FIELD_INPUT, "w-full sm:w-20")} disabled={activeSetLogs[0]?.completed} />
                          </label>
                        )}
                        <label className={SET_FIELD}>
                          <span className={SET_FIELD_LABEL}>RPE</span>
                          <Input type="number" inputMode="numeric" min={0} max={10} placeholder={targetSet.targetRPE?.toString() ?? "—"} value={activeSetLogs[0]?.actualRPE ?? ""} onChange={(e) => handleSetInputChange(0, "actualRPE", e.target.value)} className={cn(SET_FIELD_INPUT, "w-full sm:w-16")} disabled={activeSetLogs[0]?.completed} />
                        </label>
                        {targetSet.restAfter != null && (
                          <div className={SET_FIELD}>
                            <span className={SET_FIELD_LABEL}>Rest</span>
                            <p className={SET_FIELD_STATIC}>{targetSet.restAfter}s</p>
                          </div>
                        )}
                      </div>
                    </div>
                    <Button
                      size="icon"
                      variant="outline"
                      className={`${WORKOUT_TOUCH_ICON} shrink-0 rounded-full border-2 ${activeSetLogs[0]?.completed ? "border-success bg-success text-white hover:bg-success" : "border-muted-foreground/30 bg-transparent"}`}
                      aria-label="Log set"
                      onClick={() => handleLogSet(0)}
                      disabled={activeSetLogs[0]?.completed || loggingSet === 0}
                    >
                      {loggingSet === 0 ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                    </Button>
                  </div>
                </div>
              )}

              {/* Normal: all sets (also used for Interval Run's ordered segments) */}
              {(!isCircuit || showAsSegments) && (
                <div className="space-y-3">
                  <p className="text-label text-muted-foreground">
                    {showAsSegments ? "Segments" : "Sets"}
                  </p>
                  {blockExercise.sets.map((set, i) => {
                    const logData = activeSetLogs[i] || {};
                    const isSetDone = logData.completed;
                    const label = showAsSegments ? segmentLabel(set.setType, set.repeatCount) : null;
                    return (
                      <div key={set.id} className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${isSetDone ? `${WORKOUT_STATE.completed.border} ${WORKOUT_STATE.completed.soft}` : "border-border bg-surface"}`}>
                        <div className={`flex size-9 shrink-0 items-center justify-center rounded-full text-label tabular-nums ${isSetDone ? `${WORKOUT_STATE.completed.dot} text-white` : "bg-primary/10 text-primary"}`}>
                          {isSetDone ? <Check className="h-4 w-4" /> : i + 1}
                        </div>
                        <div className="min-w-0 flex-1 space-y-2">
                          {isRunType && (label || prescriptionSummary(set)) && (
                            <p className="text-caption">
                              {label && <span className="mr-1 font-medium text-foreground">{label}</span>}
                              {prescriptionSummary(set)}
                            </p>
                          )}
                          <div className="grid grid-cols-[repeat(auto-fit,minmax(3.75rem,1fr))] items-end gap-2 sm:flex sm:flex-wrap">
                            {!isRunType && set.targetReps != null && (
                              <label className={SET_FIELD}>
                                <span className={SET_FIELD_LABEL}>Reps completed</span>
                                <Input type="number" inputMode="numeric" placeholder={set.targetReps.toString()} value={logData.actualReps ?? ""} onChange={(e) => handleSetInputChange(i, "actualReps", e.target.value)} className={cn(SET_FIELD_INPUT, "w-full sm:w-20")} disabled={isSetDone} />
                              </label>
                            )}
                            {!isRunType && set.targetWeight != null && (
                              <label className={SET_FIELD}>
                                <span className={SET_FIELD_LABEL}>Weight</span>
                                <Input type="number" inputMode="decimal" placeholder={set.targetWeight.toString()} value={logData.actualWeight ?? ""} onChange={(e) => handleSetInputChange(i, "actualWeight", e.target.value)} className={cn(SET_FIELD_INPUT, "w-full sm:w-20")} disabled={isSetDone} />
                              </label>
                            )}
                            {isRunType && set.targetDistance != null && (
                              <label className={SET_FIELD}>
                                <span className={SET_FIELD_LABEL}>Distance (mi)</span>
                                <Input type="number" inputMode="decimal" step={0.1} placeholder={set.targetDistance.toString()} value={logData.actualDistance ?? ""} onChange={(e) => handleSetInputChange(i, "actualDistance", e.target.value)} className={cn(SET_FIELD_INPUT, "w-full sm:w-20")} disabled={isSetDone} />
                              </label>
                            )}
                            {set.targetDuration != null && (
                              <label className={SET_FIELD}>
                                <span className={SET_FIELD_LABEL}>{set.targetDurationUnit === "MIN" ? "Min" : "Secs"}</span>
                                <Input type="number" inputMode="numeric" placeholder={set.targetDuration.toString()} value={logData.actualDuration ?? ""} onChange={(e) => handleSetInputChange(i, "actualDuration", e.target.value)} className={cn(SET_FIELD_INPUT, "w-full sm:w-20")} disabled={isSetDone} />
                              </label>
                            )}
                            <label className={SET_FIELD}>
                              <span className={SET_FIELD_LABEL}>RPE</span>
                              <Input type="number" inputMode="numeric" min={0} max={10} placeholder={set.targetRPE?.toString() ?? "—"} value={logData.actualRPE ?? ""} onChange={(e) => handleSetInputChange(i, "actualRPE", e.target.value)} className={cn(SET_FIELD_INPUT, "w-full sm:w-16")} disabled={isSetDone} />
                            </label>
                            {set.restAfter != null && (
                              <div className={SET_FIELD}>
                                <span className={SET_FIELD_LABEL}>Rest</span>
                                <p className={SET_FIELD_STATIC}>{set.restAfter}s</p>
                              </div>
                            )}
                          </div>
                        </div>
                        <Button
                          size="icon"
                          variant="outline"
                          className={`${WORKOUT_TOUCH_ICON} shrink-0 rounded-full border-2 ${isSetDone ? "border-success bg-success text-white hover:bg-success" : "border-muted-foreground/30 bg-transparent"}`}
                          aria-label={`Log set ${i + 1}`}
                          onClick={() => handleLogSet(i)}
                          disabled={isSetDone || loggingSet === i}
                        >
                          {loggingSet === i ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Client note — a one-line opener until there's something to show */}
              {notesOpen || note ? (
                <div className={`space-y-1.5 rounded-lg ${ROLE_CLASSES.brand.soft} p-3`}>
                  <Label htmlFor={`client-note-${blockExercise.id}`} className={ROLE_CLASSES.brand.text}>
                    Your notes
                  </Label>
                  <Textarea
                    id={`client-note-${blockExercise.id}`}
                    placeholder="Anything you want your trainer to know about this exercise..."
                    value={note}
                    onChange={(e) => handleClientNoteChange(blockExercise.id, e.target.value)}
                    autoFocus={notesOpen && !note}
                    className={`min-h-16 resize-none bg-surface ${ROLE_CLASSES.brand.border}`}
                  />
                </div>
              ) : (
                <Button
                  variant="ghost"
                  className={cn(WORKOUT_TOUCH, "-ml-2 gap-1.5 px-2 text-muted-foreground hover:text-foreground")}
                  onClick={() => setNotesOpen(true)}
                >
                  <MessageSquarePlus className="size-4" aria-hidden />
                  Add a note for your trainer
                </Button>
              )}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Thumb-reach action bar below `lg`: pinned flush on top of the bottom
          tab bar. The negative offset cancels <main>'s 1rem bottom gutter (its
          padding already reserves the tab bar + safe area). */}
      <div className="sticky -bottom-4 z-20 -mx-4 border-t border-border bg-canvas/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-canvas/80 sm:mx-0 sm:rounded-xl sm:rounded-b-none sm:border sm:bg-surface sm:shadow-xs lg:hidden">
        {renderActions()}
      </div>

      {/* Skip dialog — the timer is paused while it's open */}
      <Dialog open={skipDialogOpen} onOpenChange={(open) => { if (!open && !isSkipping) cancelSkip(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Skip this exercise?</DialogTitle>
            <DialogDescription>Your timer is paused. Tell your trainer why you&apos;re skipping it.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Reason for skipping">
              {SKIP_REASONS.map((reason) => (
                <Button
                  key={reason}
                  type="button"
                  role="radio"
                  aria-checked={skipReason === reason}
                  variant={skipReason === reason ? "default" : "outline"}
                  className={WORKOUT_TOUCH}
                  onClick={() => setSkipReason(reason)}
                >
                  {reason}
                </Button>
              ))}
            </div>
            {skipReason === "Other" && (
              <Input
                aria-label="Other reason"
                placeholder="What's going on?"
                value={skipOther}
                onChange={(e) => setSkipOther(e.target.value)}
                maxLength={200}
                autoFocus
              />
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="h-11" onClick={cancelSkip} disabled={isSkipping}>
              Keep going
            </Button>
            <Button className="h-11 flex-1" onClick={confirmSkip} disabled={!skipReason || isSkipping}>
              {isSkipping ? <Loader2 className="mr-2 size-4 animate-spin" /> : <SkipForward className="mr-2 size-4" />}
              Skip exercise
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* End session dialog */}
      <Dialog open={showEndDialog} onOpenChange={setShowEndDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl ${WORKOUT_STATE.completed.soft} ${WORKOUT_STATE.completed.text}`}>
              <Trophy className="h-8 w-8" />
            </div>
            <DialogTitle className="text-center text-xl">Great work!</DialogTitle>
            <p className="text-center text-sm text-muted-foreground">
              You completed {doneCount} of {totalExerciseItems} exercises in {formatTime(timer)}.
            </p>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div>
              <Label htmlFor="session-rpe" className="font-semibold">
                How hard was this session? <span className="font-normal text-muted-foreground">RPE {rpe}/10</span>
              </Label>
              <div className="mt-3 flex items-center gap-3">
                <span className="text-xs text-muted-foreground">Easy</span>
                <input id="session-rpe" type="range" min={0} max={10} value={rpe} onChange={(e) => setRpe(Number(e.target.value))} className="flex-1 accent-primary" />
                <span className="text-xs text-muted-foreground">Max</span>
              </div>
              <div className="mt-2 flex gap-1">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i < rpe ? "bg-primary" : "bg-muted"}`} />
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="session-notes" className="font-semibold">Session Notes <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Textarea id="session-notes" placeholder="How did it feel? Any pain or discomfort to flag?" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="resize-none" />
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
            <Button variant="outline" className="h-11" onClick={() => { toast.info("Session preserved"); router.push("/dashboard"); }}>
              Skip &amp; Exit
            </Button>
            <Button
              className="h-11 flex-1"
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
