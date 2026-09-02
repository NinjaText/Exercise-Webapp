"use client";

// ProgramBuilder manages the workout -> block -> exercise -> set hierarchy with DnD.
// Receives `workouts` state and `onChange` callback from ProgramEditor.

import { useMemo, useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GripVertical, Plus, Trash2, Play, X, ChevronDown, ChevronRight } from "lucide-react";
import { ExercisePickerDialog } from "./exercise-picker-dialog";
import { SetEditor } from "./set-editor";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { UniversalVideoPlayer } from "@/components/exercises/universal-video-player";
import type {
  WorkoutInput,
  ExerciseSetInput,
  BlockExerciseInput,
} from "@/lib/validators/program";
import { cn } from "@/lib/utils";
import { useClipboard, stripIds } from "@/lib/clipboard-context";
import { useBuilderKeyboard } from "@/hooks/use-builder-keyboard";
import { toast } from "sonner";
import { type ExerciseSourcePreference } from "@/lib/utils/exercise-picker";
import { hasRealVideoUrl } from "@/lib/utils/video";

interface Props {
  workouts: WorkoutInput[];
  onChange: (workouts: WorkoutInput[]) => void;
  exerciseLibrary: {
    id: string;
    name: string;
    bodyRegion: string[];
    difficultyLevel: string | null;
    defaultReps?: number | null;
    musclesTargeted?: string[];
    imageUrl?: string | null;
    equipmentRequired?: string[];
    videoUrl?: string | null;
    videoProvider?: string | null;
  }[];
  organizationOrganizationId?: string;
  exerciseSourcePreference?: ExerciseSourcePreference;
}

interface SelectionState {
  level: "workout" | "block" | "exercises" | null;
  workoutIdx: number | null;
  blockIdx: number | null;
  exerciseIdxs: Set<number>;
}

const DEFAULT_SELECTION: SelectionState = {
  level: null,
  workoutIdx: null,
  blockIdx: null,
  exerciseIdxs: new Set(),
};

// Sortable wrapper for a block — must be a component so useSortable can be called as a hook.
function SortableBlock({
  id,
  children,
}: {
  id: string;
  children: (dragHandleProps: React.HTMLAttributes<HTMLElement>) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <div ref={setNodeRef} style={style}>
      {children({ ...attributes, ...listeners })}
    </div>
  );
}

// Sortable wrapper for an exercise row.
function SortableExercise({
  id,
  children,
}: {
  id: string;
  children: (dragHandleProps: React.HTMLAttributes<HTMLElement>) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <div ref={setNodeRef} style={style}>
      {children({ ...attributes, ...listeners })}
    </div>
  );
}

export function ProgramBuilder({ workouts, onChange, exerciseLibrary, organizationOrganizationId, exerciseSourcePreference }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [videoPreview, setVideoPreview] = useState<{ url: string; provider?: string | null; name: string } | null>(null);
  const [pickerTarget, setPickerTarget] = useState<{
    workoutIdx: number;
    blockIdx: number;
  } | null>(null);

  const [selection, setSelection] = useState<SelectionState>(DEFAULT_SELECTION);
  const [hoveredPasteTarget, setHoveredPasteTarget] = useState<string | null>(null);
  const [collapsedWeeks, setCollapsedWeeks] = useState<Set<number>>(new Set());
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set());
  const { clipboard, copy } = useClipboard();

  function dayKey(weekIndex: number, dayIndex: number) {
    return `${weekIndex}:${dayIndex}`;
  }

  const MAX_DAYS_PER_WEEK = 7;

  // Group workouts by weekIndex (sorted), and within each week by dayIndex.
  // Display numbering ("Week 1", "Day 1") is always derived from sort
  // position, not the raw weekIndex/dayIndex value — so removing a week or
  // day never needs to renumber every other week to stay gap-free.
  const weekGroups = useMemo(() => {
    const byWeek = new Map<number, number[]>();
    workouts.forEach((w, idx) => {
      const arr = byWeek.get(w.weekIndex) ?? [];
      arr.push(idx);
      byWeek.set(w.weekIndex, arr);
    });
    return Array.from(byWeek.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([weekIndex, dayIdxs]) => ({
        weekIndex,
        dayIdxs: dayIdxs.sort(
          (a, b) => workouts[a].dayIndex - workouts[b].dayIndex
        ),
      }));
  }, [workouts]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  // --- Week / day operations ---
  // orderIndex is always derived from (weekIndex, dayIndex) — this mirrors
  // the same formula the server uses (moveWorkoutAction / duplicateWorkoutToDayAction)
  // so ordering stays consistent everywhere.
  function withRecomputedOrder(list: WorkoutInput[]): WorkoutInput[] {
    return list.map((w) => ({
      ...w,
      orderIndex: w.weekIndex * MAX_DAYS_PER_WEEK + w.dayIndex,
    }));
  }

  function toggleWeek(weekIndex: number) {
    setCollapsedWeeks((prev) => {
      const next = new Set(prev);
      if (next.has(weekIndex)) next.delete(weekIndex);
      else next.add(weekIndex);
      return next;
    });
  }

  function toggleDay(weekIndex: number, dayIndex: number) {
    const key = dayKey(weekIndex, dayIndex);
    setCollapsedDays((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function addWeek() {
    const nextWeekIndex =
      weekGroups.length > 0
        ? Math.max(...weekGroups.map((g) => g.weekIndex)) + 1
        : 0;
    const newWorkout: WorkoutInput = {
      name: "Day 1",
      dayIndex: 0,
      weekIndex: nextWeekIndex,
      orderIndex: 0,
      blocks: [
        {
          name: "Warm-up",
          type: "WARMUP",
          orderIndex: 0,
          rounds: 1,
          exercises: [],
        },
      ],
    };
    onChange(withRecomputedOrder([...workouts, newWorkout]));
    // Collapse every existing week/day so the newly added week (and its
    // first day) is the only thing left expanded — avoids endless scrolling.
    setCollapsedWeeks(new Set(weekGroups.map((g) => g.weekIndex)));
    setCollapsedDays(new Set(workouts.map((w) => dayKey(w.weekIndex, w.dayIndex))));
  }

  function addDayToWeek(weekIndex: number) {
    const daysInWeek = workouts.filter((w) => w.weekIndex === weekIndex).length;
    if (daysInWeek >= MAX_DAYS_PER_WEEK) return;
    const newWorkout: WorkoutInput = {
      name: `Day ${daysInWeek + 1}`,
      dayIndex: daysInWeek,
      weekIndex,
      orderIndex: 0,
      blocks: [
        {
          name: "Warm-up",
          type: "WARMUP",
          orderIndex: 0,
          rounds: 1,
          exercises: [],
        },
      ],
    };
    onChange(withRecomputedOrder([...workouts, newWorkout]));
    // Collapse every other week and every existing day so only the week
    // being worked on — and the newly added day within it — stay open.
    setCollapsedWeeks(
      new Set(weekGroups.map((g) => g.weekIndex).filter((wi) => wi !== weekIndex))
    );
    setCollapsedDays(new Set(workouts.map((w) => dayKey(w.weekIndex, w.dayIndex))));
  }

  function removeWeek(weekIndex: number) {
    const next = workouts.filter((w) => w.weekIndex !== weekIndex);
    onChange(withRecomputedOrder(next));
    setSelection(DEFAULT_SELECTION);
    setCollapsedWeeks((prev) => {
      const next = new Set(prev);
      next.delete(weekIndex);
      return next;
    });
    setCollapsedDays((prev) => {
      const next = new Set(prev);
      for (const key of prev) {
        if (key.startsWith(`${weekIndex}:`)) next.delete(key);
      }
      return next;
    });
  }

  function removeWorkout(idx: number) {
    const removedWeek = workouts[idx].weekIndex;
    const filtered = workouts.filter((_, i) => i !== idx);

    // Re-index dayIndex to stay contiguous (0..n-1) within the affected
    // week only — other weeks' days are untouched.
    const sameWeek = filtered
      .map((w, i) => ({ w, i }))
      .filter(({ w }) => w.weekIndex === removedWeek)
      .sort((a, b) => a.w.dayIndex - b.w.dayIndex);
    const dayIndexByArrayPos = new Map<number, number>();
    sameWeek.forEach(({ i }, newDayIndex) => dayIndexByArrayPos.set(i, newDayIndex));

    const next = filtered.map((w, i) =>
      dayIndexByArrayPos.has(i) ? { ...w, dayIndex: dayIndexByArrayPos.get(i)! } : w
    );
    onChange(withRecomputedOrder(next));
    setSelection(DEFAULT_SELECTION);
    // Day indices within the affected week were just renumbered, so any
    // collapsed-state keyed to the old numbering is stale — drop it.
    setCollapsedDays((prev) => {
      const next = new Set(prev);
      for (const key of prev) {
        if (key.startsWith(`${removedWeek}:`)) next.delete(key);
      }
      return next;
    });
  }

  function updateWorkoutField(
    idx: number,
    field: string,
    value: string | number | null
  ) {
    const next = [...workouts];
    next[idx] = { ...next[idx], [field]: value };
    onChange(next);
  }

  // --- Block operations ---
  function addBlock(workoutIdx: number) {
    const next = [...workouts];
    const w = next[workoutIdx];
    w.blocks = [
      ...w.blocks,
      {
        name: "New Block",
        type: "NORMAL",
        orderIndex: w.blocks.length,
        rounds: 1,
        exercises: [],
      },
    ];
    onChange(next);
  }

  function removeBlock(workoutIdx: number, blockIdx: number) {
    const next = [...workouts];
    next[workoutIdx].blocks = next[workoutIdx].blocks
      .filter((_, i) => i !== blockIdx)
      .map((b, i) => ({ ...b, orderIndex: i }));
    onChange(next);
  }

  function updateBlockField(
    workoutIdx: number,
    blockIdx: number,
    field: string,
    value: string | number | null
  ) {
    const next = [...workouts];
    next[workoutIdx].blocks[blockIdx] = {
      ...next[workoutIdx].blocks[blockIdx],
      [field]: value,
    };
    onChange(next);
  }

  // --- Exercise operations ---
  function openExercisePicker(workoutIdx: number, blockIdx: number) {
    setPickerTarget({ workoutIdx, blockIdx });
    setPickerOpen(true);
  }

  function addExerciseToBlock(exercise: Props["exerciseLibrary"][number]) {
    if (!pickerTarget) return;
    const { workoutIdx, blockIdx } = pickerTarget;
    const next = [...workouts];
    const block = next[workoutIdx].blocks[blockIdx];
    block.exercises = [
      ...block.exercises,
      {
        exerciseId: exercise.id,
        orderIndex: block.exercises.length,
        restSeconds: 60,
        notes: null,
        supersetGroup: null,
        activityType: "STRENGTH",
        sets: [
          {
            orderIndex: 0,
            setType: "NORMAL",
            targetReps: exercise.defaultReps || 10,
            targetWeight: null,
            targetDuration: null,
            targetDistance: null,
            targetRPE: null,
            restAfter: null,
          },
        ],
        _exerciseName: exercise.name,
        _exerciseBodyRegion: exercise.bodyRegion,
      } as WorkoutInput["blocks"][number]["exercises"][number] & {
        _exerciseName: string;
        _exerciseBodyRegion: string[];
      },
    ];
    onChange(next);
    setPickerOpen(false);
  }

  function removeExercise(
    workoutIdx: number,
    blockIdx: number,
    exIdx: number
  ) {
    const next = [...workouts];
    next[workoutIdx].blocks[blockIdx].exercises = next[workoutIdx].blocks[
      blockIdx
    ].exercises
      .filter((_, i) => i !== exIdx)
      .map((e, i) => ({ ...e, orderIndex: i }));
    onChange(next);
  }

  function updateExerciseSets(
    workoutIdx: number,
    blockIdx: number,
    exIdx: number,
    sets: ExerciseSetInput[]
  ) {
    const next = [...workouts];
    next[workoutIdx].blocks[blockIdx].exercises[exIdx].sets = sets;
    onChange(next);
  }

  function updateExerciseNotes(
    workoutIdx: number,
    blockIdx: number,
    exIdx: number,
    notes: string
  ) {
    const next = [...workouts];
    next[workoutIdx].blocks[blockIdx].exercises[exIdx] = {
      ...next[workoutIdx].blocks[blockIdx].exercises[exIdx],
      notes: notes || null,
    };
    onChange(next);
  }

  function updateExerciseField(
    workoutIdx: number,
    blockIdx: number,
    exIdx: number,
    field: "activityType",
    value: string | null
  ) {
    const next = [...workouts];
    next[workoutIdx].blocks[blockIdx].exercises[exIdx] = {
      ...next[workoutIdx].blocks[blockIdx].exercises[exIdx],
      [field]: value,
    } as BlockExerciseInput;
    onChange(next);
  }

  function handleExerciseCheck(wi: number, bi: number, ei: number, checked: boolean) {
    setSelection((prev) => {
      const sameBlock =
        prev.level === "exercises" &&
        prev.workoutIdx === wi &&
        prev.blockIdx === bi;
      const newIdxs = sameBlock ? new Set(prev.exerciseIdxs) : new Set<number>();
      if (checked) {
        newIdxs.add(ei);
        return { level: "exercises", workoutIdx: wi, blockIdx: bi, exerciseIdxs: newIdxs };
      }
      newIdxs.delete(ei);
      return newIdxs.size > 0
        ? { level: "exercises", workoutIdx: wi, blockIdx: bi, exerciseIdxs: newIdxs }
        : DEFAULT_SELECTION;
    });
  }

  function handleCopy() {
    const { level, workoutIdx, blockIdx, exerciseIdxs } = selection;
    if (level === "workout" && workoutIdx !== null) {
      const data = stripIds(workouts[workoutIdx]);
      copy({ type: "workout", data, label: `"${workouts[workoutIdx].name}"` });
    } else if (level === "block" && workoutIdx !== null && blockIdx !== null) {
      const block = workouts[workoutIdx].blocks[blockIdx];
      copy({ type: "block", data: stripIds(block), label: `"${block.name || "Block"}"` });
    } else if (
      level === "exercises" &&
      workoutIdx !== null &&
      blockIdx !== null &&
      exerciseIdxs.size > 0
    ) {
      const sorted = Array.from(exerciseIdxs).sort((a, b) => a - b);
      const exs = sorted.map((i) =>
        stripIds(workouts[workoutIdx!].blocks[blockIdx!].exercises[i])
      );
      const firstName = getExerciseName(
        exs[0].exerciseId,
        (exs[0] as any)._exerciseName
      );
      const label = exs.length === 1 ? `"${firstName}"` : `${exs.length} exercises`;
      copy({ type: "exercises", data: exs, label });
    }
  }

  function handlePaste() {
    if (!clipboard) return;

    if (clipboard.type === "workout") {
      const targetWeekIndex =
        selection.workoutIdx !== null
          ? workouts[selection.workoutIdx].weekIndex
          : weekGroups.length > 0
            ? weekGroups[weekGroups.length - 1].weekIndex
            : 0;
      const daysInTargetWeek = workouts.filter(
        (w) => w.weekIndex === targetWeekIndex
      ).length;
      if (daysInTargetWeek >= MAX_DAYS_PER_WEEK) {
        toast.info("That week already has 7 days — select a different week first");
        return;
      }
      const clone = {
        ...clipboard.data,
        dayIndex: daysInTargetWeek,
        weekIndex: targetWeekIndex,
        name: `${clipboard.data.name} (copy)`,
      };
      onChange(withRecomputedOrder([...workouts, clone]));
      toast.success("Workout day pasted");
      return;
    }

    if (clipboard.type === "block") {
      if (selection.workoutIdx === null) {
        toast.info("Click a workout day header first, then paste");
        return;
      }
      const next = [...workouts];
      const target = next[selection.workoutIdx];
      const clone = { ...clipboard.data, orderIndex: target.blocks.length };
      next[selection.workoutIdx] = {
        ...target,
        blocks: [...target.blocks, clone],
      };
      onChange(next);
      toast.success(`Block "${clipboard.data.name || "Block"}" pasted`);
      return;
    }

    if (clipboard.type === "exercises") {
      const { workoutIdx: wi, blockIdx: bi } = selection;
      if (wi === null || bi === null) {
        toast.info("Click a block first, then paste");
        return;
      }
      const next = [...workouts];
      const block = { ...next[wi].blocks[bi] };
      const startOrder = block.exercises.length;
      const clones = clipboard.data.map((ex, i) => ({
        ...ex,
        orderIndex: startOrder + i,
      }));
      block.exercises = [...block.exercises, ...clones];
      next[wi] = {
        ...next[wi],
        blocks: next[wi].blocks.map((b, i) => (i === bi ? block : b)),
      };
      onChange(next);
      const n = clipboard.data.length;
      toast.success(`${n} exercise${n > 1 ? "s" : ""} pasted`);
    }
  }

  useBuilderKeyboard({
    onCopy: handleCopy,
    onPaste: handlePaste,
    onEscape: () => setSelection(DEFAULT_SELECTION),
  });

  // --- DnD for blocks within a workout ---
  function handleBlockDragEnd(workoutIdx: number, event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const next = [...workouts];
    const blocks = next[workoutIdx].blocks;
    const oldIdx = blocks.findIndex(
      (b) => `block-${workoutIdx}-${b.orderIndex}` === active.id
    );
    const newIdx = blocks.findIndex(
      (b) => `block-${workoutIdx}-${b.orderIndex}` === over.id
    );

    if (oldIdx !== -1 && newIdx !== -1) {
      next[workoutIdx].blocks = arrayMove(blocks, oldIdx, newIdx).map(
        (b, i) => ({ ...b, orderIndex: i })
      );
      onChange(next);
    }
  }

  // --- DnD for exercises within a block ---
  function handleExerciseDragEnd(
    workoutIdx: number,
    blockIdx: number,
    event: DragEndEvent
  ) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const next = [...workouts];
    const exercises = next[workoutIdx].blocks[blockIdx].exercises;
    const oldIdx = exercises.findIndex(
      (e) => `ex-${workoutIdx}-${blockIdx}-${e.orderIndex}` === active.id
    );
    const newIdx = exercises.findIndex(
      (e) => `ex-${workoutIdx}-${blockIdx}-${e.orderIndex}` === over.id
    );

    if (oldIdx !== -1 && newIdx !== -1) {
      next[workoutIdx].blocks[blockIdx].exercises = arrayMove(
        exercises,
        oldIdx,
        newIdx
      ).map((e, i) => ({ ...e, orderIndex: i }));
      onChange(next);
    }
  }

  // --- Look up exercise name from library ---
  function getExerciseName(exerciseId: string, fallback?: string): string {
    const ex = exerciseLibrary.find((e) => e.id === exerciseId);
    return ex?.name || fallback || "Unknown Exercise";
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between bg-card p-4 rounded-lg border">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Workouts</h2>
          <p className="text-sm text-muted-foreground">
            Organize your program into weeks, with up to 7 days each. Drag blocks or exercises to reorder.
          </p>
        </div>
      </div>

      {weekGroups.length === 0 && (
        <div className="rounded-lg border-2 border-dashed p-10 text-center text-muted-foreground">
          <p className="mb-3 text-sm">No weeks yet. Start by adding your first week.</p>
          <Button type="button" variant="secondary" onClick={addWeek}>
            <Plus className="mr-2 h-4 w-4" /> Add Week
          </Button>
        </div>
      )}

      {weekGroups.map(({ weekIndex, dayIdxs }, weekPos) => {
        const isCollapsed = collapsedWeeks.has(weekIndex);
        return (
          <div key={weekIndex} className="rounded-xl border-2 bg-muted/10">
            <div className="flex items-center justify-between p-4">
              <button
                type="button"
                className="flex items-center gap-2 text-left"
                onClick={() => toggleWeek(weekIndex)}
              >
                {isCollapsed ? (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
                <h3 className="text-lg font-bold tracking-tight">
                  Week {weekPos + 1}
                </h3>
                <Badge variant="secondary">
                  {dayIdxs.length}/{MAX_DAYS_PER_WEEK} days
                </Badge>
              </button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeWeek(weekIndex)}
                className="text-destructive"
                title="Remove week"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            {!isCollapsed && (
              <div className="space-y-4 px-4 pb-4">
                {dayIdxs.map((wi) => {
                  const workout = workouts[wi];
                  const isDayCollapsed = collapsedDays.has(
                    dayKey(weekIndex, workout.dayIndex)
                  );
                  const exerciseCount = workout.blocks.reduce(
                    (sum, b) => sum + b.exercises.length,
                    0
                  );
                  return (
        <Card
          key={wi}
          className={cn(
            "border-2 transition-shadow",
            selection.level === "workout" && selection.workoutIdx === wi
              ? "ring-2 ring-blue-500"
              : ""
          )}
          onClick={(e) => {
            const target = e.target as HTMLElement;
            if (target.closest("input, button, select, textarea")) return;
            setSelection({
              level: "workout",
              workoutIdx: wi,
              blockIdx: null,
              exerciseIdxs: new Set(),
            });
          }}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <div className="flex items-center gap-3 flex-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => toggleDay(weekIndex, workout.dayIndex)}
                title={isDayCollapsed ? "Expand day" : "Collapse day"}
              >
                {isDayCollapsed ? (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
              <Input
                value={workout.name}
                onChange={(e) =>
                  updateWorkoutField(wi, "name", e.target.value)
                }
                className="text-lg font-bold max-w-xs"
              />
              <Input
                type="number"
                value={workout.estimatedMinutes ?? ""}
                onChange={(e) =>
                  updateWorkoutField(
                    wi,
                    "estimatedMinutes",
                    e.target.value ? parseInt(e.target.value) : null
                  )
                }
                placeholder="Est. min"
                className="w-24"
              />
              {isDayCollapsed && (
                <Badge variant="secondary" className="shrink-0">
                  {workout.blocks.length} block{workout.blocks.length === 1 ? "" : "s"} ·{" "}
                  {exerciseCount} exercise{exerciseCount === 1 ? "" : "s"}
                </Badge>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => removeWorkout(wi)}
              className="text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </CardHeader>
          {!isDayCollapsed && (
          <CardContent className="space-y-4">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(e) => handleBlockDragEnd(wi, e)}
            >
              <SortableContext
                items={workout.blocks.map(
                  (b) => `block-${wi}-${b.orderIndex}`
                )}
                strategy={verticalListSortingStrategy}
              >
                {workout.blocks.map((block, bi) => (
                  <SortableBlock key={bi} id={`block-${wi}-${block.orderIndex}`}>
                    {(dragHandleProps) => (
                      <div
                        className={cn(
                          "border rounded-lg p-4 bg-muted/30 transition-shadow",
                          selection.level === "block" &&
                          selection.workoutIdx === wi &&
                          selection.blockIdx === bi
                            ? "ring-2 ring-blue-400"
                            : "",
                          clipboard?.type === "exercises" &&
                          hoveredPasteTarget === `block-${wi}-${bi}`
                            ? "border-dashed border-blue-400"
                            : ""
                        )}
                        onMouseEnter={() => {
                          if (clipboard?.type === "exercises") setHoveredPasteTarget(`block-${wi}-${bi}`);
                        }}
                        onMouseLeave={() => setHoveredPasteTarget(null)}
                      >
                        {/* Block header */}
                        <div
                          className="flex flex-wrap items-center gap-3 mb-3 cursor-pointer"
                          onClick={(e) => {
                            const target = e.target as HTMLElement;
                            if (target.closest("input, button, select")) return;
                            e.stopPropagation();
                            setSelection({
                              level: "block",
                              workoutIdx: wi,
                              blockIdx: bi,
                              exerciseIdxs: new Set(),
                            });
                          }}
                        >
                          <button
                            type="button"
                            className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
                            {...dragHandleProps}
                          >
                            <GripVertical className="h-4 w-4" />
                          </button>
                          <Input
                            value={block.name || ""}
                            onChange={(e) =>
                              updateBlockField(wi, bi, "name", e.target.value)
                            }
                            placeholder="Block name"
                            className="max-w-[200px] min-w-[120px] flex-1"
                          />
                          <Select
                            value={block.type}
                            onValueChange={(v) =>
                              updateBlockField(wi, bi, "type", v)
                            }
                          >
                            <SelectTrigger className="w-[130px] shrink-0">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="NORMAL">Normal</SelectItem>
                              <SelectItem value="WARMUP">Warmup</SelectItem>
                              <SelectItem value="COOLDOWN">Cooldown</SelectItem>
                              <SelectItem value="SUPERSET">Superset</SelectItem>
                              <SelectItem value="CIRCUIT">Circuit</SelectItem>
                              <SelectItem value="AMRAP">AMRAP</SelectItem>
                              <SelectItem value="EMOM">EMOM</SelectItem>
                            </SelectContent>
                          </Select>
                          {(block.type === "CIRCUIT" ||
                            block.type === "AMRAP") && (
                            <Input
                              type="number"
                              value={block.rounds}
                              onChange={(e) =>
                                updateBlockField(
                                  wi,
                                  bi,
                                  "rounds",
                                  parseInt(e.target.value) || 1
                                )
                              }
                              className="w-20 shrink-0"
                              min={1}
                              placeholder="Rounds"
                            />
                          )}
                          {block.type === "AMRAP" && (
                            <Input
                              type="number"
                              value={block.timeCap ?? ""}
                              onChange={(e) =>
                                updateBlockField(
                                  wi,
                                  bi,
                                  "timeCap",
                                  e.target.value
                                    ? parseInt(e.target.value)
                                    : null
                                )
                              }
                              className="w-24 shrink-0"
                              placeholder="Time cap (s)"
                            />
                          )}
                          <div className="ml-auto flex shrink-0 items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeBlock(wi, bi)}
                              className="text-destructive h-8 w-8"
                              title="Remove block"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>

                        {/* Exercises in this block */}
                        <DndContext
                          sensors={sensors}
                          collisionDetection={closestCenter}
                          onDragEnd={(e) => handleExerciseDragEnd(wi, bi, e)}
                        >
                          <SortableContext
                            items={block.exercises.map(
                              (e) => `ex-${wi}-${bi}-${e.orderIndex}`
                            )}
                            strategy={verticalListSortingStrategy}
                          >
                            <div className="space-y-2">
                              {block.exercises.map((ex, ei) => (
                                <SortableExercise
                                  key={ei}
                                  id={`ex-${wi}-${bi}-${ex.orderIndex}`}
                                >
                                  {(exDragHandleProps) => (
                                    <div
                                      className={cn(
                                        "border rounded-md p-3 group",
                                        selection.level === "exercises" &&
                                        selection.workoutIdx === wi &&
                                        selection.blockIdx === bi &&
                                        selection.exerciseIdxs.has(ei)
                                          ? "bg-blue-50"
                                          : "bg-background"
                                      )}
                                    >
                                      <div className="flex items-center gap-2 mb-2">
                                        <input
                                          type="checkbox"
                                          className={cn(
                                            "h-4 w-4 shrink-0 rounded border-gray-300 cursor-pointer transition-opacity",
                                            selection.level === "exercises" &&
                                            selection.workoutIdx === wi &&
                                            selection.blockIdx === bi &&
                                            selection.exerciseIdxs.has(ei)
                                              ? "opacity-100"
                                              : "opacity-0 group-hover:opacity-100"
                                          )}
                                          checked={
                                            selection.level === "exercises" &&
                                            selection.workoutIdx === wi &&
                                            selection.blockIdx === bi &&
                                            selection.exerciseIdxs.has(ei)
                                          }
                                          onChange={(e) => {
                                            e.stopPropagation();
                                            handleExerciseCheck(wi, bi, ei, e.target.checked);
                                          }}
                                          onClick={(e) => e.stopPropagation()}
                                        />
                                        {/* rest of the existing row content follows unchanged */}
                                        <button
                                          type="button"
                                          className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
                                          {...exDragHandleProps}
                                        >
                                          <GripVertical className="h-4 w-4" />
                                        </button>
                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                          <span className="font-medium truncate">
                                            {getExerciseName(
                                              ex.exerciseId,
                                              (
                                                ex as typeof ex & {
                                                  _exerciseName?: string;
                                                }
                                              )._exerciseName
                                            )}
                                          </span>
                                          <Select
                                            value={ex.activityType || "STRENGTH"}
                                            onValueChange={(v) =>
                                              updateExerciseField(wi, bi, ei, "activityType", v)
                                            }
                                          >
                                            <SelectTrigger className="h-6 text-[10px] w-[118px] shrink-0">
                                              <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="STRENGTH">Strength/Mobility</SelectItem>
                                              <SelectItem value="RUN">Run</SelectItem>
                                              <SelectItem value="INTERVAL_RUN">Interval Run</SelectItem>
                                            </SelectContent>
                                          </Select>
                                          {(() => {
                                            const lib = exerciseLibrary.find(
                                              (e) => e.id === ex.exerciseId
                                            );
                                            return lib?.videoUrl && hasRealVideoUrl(lib.videoUrl) ? (
                                              <button
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setVideoPreview({
                                                    url: lib.videoUrl!,
                                                    provider: lib.videoProvider,
                                                    name: lib.name,
                                                  });
                                                }}
                                                className="inline-flex items-center gap-0.5 text-[10px] bg-blue-50 text-blue-600 border border-blue-200 px-1.5 py-0.5 rounded-sm font-medium shrink-0 hover:bg-blue-100"
                                              >
                                                <Play className="h-2.5 w-2.5" />
                                                Video
                                              </button>
                                            ) : null;
                                          })()}
                                        </div>
                                        <div className="flex items-center gap-0.5">
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() =>
                                              removeExercise(wi, bi, ei)
                                            }
                                            className="text-destructive h-7 w-7"
                                            title="Remove exercise"
                                          >
                                            <Trash2 className="h-3 w-3" />
                                          </Button>
                                        </div>
                                      </div>
                                      {/* Trainer notes for this exercise */}
                                      <Textarea
                                        value={ex.notes ?? ""}
                                        onChange={(e) =>
                                          updateExerciseNotes(
                                            wi,
                                            bi,
                                            ei,
                                            e.target.value
                                          )
                                        }
                                        placeholder="Instructions for client (e.g. use one hand only, keep back straight)…"
                                        className="text-sm mb-2 min-h-[36px] resize-none"
                                        rows={1}
                                      />
                                      <SetEditor
                                        sets={ex.sets}
                                        activityType={ex.activityType || "STRENGTH"}
                                        onChange={(sets) =>
                                          updateExerciseSets(wi, bi, ei, sets)
                                        }
                                      />
                                    </div>
                                  )}
                                </SortableExercise>
                              ))}
                            </div>
                          </SortableContext>
                        </DndContext>

                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-3"
                          onClick={() => openExercisePicker(wi, bi)}
                        >
                          <Plus className="mr-1 h-3.5 w-3.5" /> Add Exercise
                        </Button>
                      </div>
                    )}
                  </SortableBlock>
                ))}
              </SortableContext>
            </DndContext>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => addBlock(wi)}
              className="w-full border-dashed border-2"
            >
              <Plus className="mr-1 h-3.5 w-3.5" /> Add Block
            </Button>
          </CardContent>
          )}
        </Card>
                  );
                })}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={dayIdxs.length >= MAX_DAYS_PER_WEEK}
                  onClick={() => addDayToWeek(weekIndex)}
                  className="w-full border-dashed border-2"
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  {dayIdxs.length >= MAX_DAYS_PER_WEEK
                    ? `${MAX_DAYS_PER_WEEK}/${MAX_DAYS_PER_WEEK} days`
                    : "Add Day"}
                </Button>
              </div>
            )}
          </div>
        );
      })}

      {weekGroups.length > 0 && (
        <Button
          type="button"
          variant="secondary"
          onClick={addWeek}
          className="w-full border-dashed border-2 bg-background hover:bg-muted"
        >
          <Plus className="mr-2 h-4 w-4" /> Add Week
        </Button>
      )}

      <ExercisePickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        exercises={exerciseLibrary}
        onSelect={addExerciseToBlock}
        organizationOrganizationId={organizationOrganizationId}
        exerciseSourcePreference={exerciseSourcePreference}
      />

      {/* Video preview modal */}
      <Dialog open={!!videoPreview} onOpenChange={(o) => { if (!o) setVideoPreview(null); }}>
        <DialogContent className="sm:max-w-2xl gap-0 p-0 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <p className="font-semibold text-sm truncate pr-4">{videoPreview?.name}</p>
            <button
              type="button"
              onClick={() => setVideoPreview(null)}
              className="shrink-0 rounded-md p-1 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="w-full bg-black">
            {videoPreview?.url && (
              <UniversalVideoPlayer
                url={videoPreview.url}
                provider={videoPreview.provider}
                autoPlay
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
