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
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GripVertical, Plus, Trash2, Play, X, ChevronDown, ChevronRight, Sparkles, Loader2, CalendarPlus, Clock, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ExercisePickerDialog } from "./exercise-picker-dialog";
import { SetEditor } from "./set-editor";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { suggestExerciseReplacementsAction } from "@/actions/ai-program-actions";
import {
  exerciseKey,
  resolveOpenKeys,
  isExerciseOpen,
  type BuilderViewMode,
} from "@/lib/utils/builder-view";
import { CollapsedExerciseRow } from "./collapsed-exercise-row";

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

// Base UI's <Select.Value> shows the raw value unless the root gets an items
// map, which is how "CIRCUIT" / "STRENGTH" ended up in the triggers.
const BLOCK_TYPE_ITEMS = {
  NORMAL: "Standard",
  WARMUP: "Warm-up",
  COOLDOWN: "Cool-down",
  SUPERSET: "Superset",
  CIRCUIT: "Circuit",
  AMRAP: "AMRAP",
  EMOM: "EMOM",
};
const ACTIVITY_TYPE_ITEMS = {
  STRENGTH: "Strength / mobility",
  RUN: "Run",
  INTERVAL_RUN: "Interval run",
};

/** Borderless until hovered or focused: names read as headings, not form boxes. */
const INLINE_INPUT =
  "h-8 border-transparent bg-transparent px-2 shadow-none hover:border-input hover:bg-surface focus-visible:bg-surface";

/** Compact number input with a trailing unit ("3 rounds", "45 min"). */
function UnitNumberField({
  label,
  unit,
  value,
  onChange,
  icon,
  min = 0,
  placeholder,
}: {
  label: string;
  unit: string;
  value: number | null;
  onChange: (value: number | null) => void;
  icon?: React.ReactNode;
  min?: number;
  placeholder?: string;
}) {
  return (
    <label className="flex h-8 shrink-0 cursor-text items-center gap-1.5 rounded-md border border-input bg-surface px-2 text-muted-foreground shadow-xs transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 hover:border-border-strong motion-reduce:transition-none">
      {icon}
      <input
        type="number"
        inputMode="numeric"
        min={min}
        value={value ?? ""}
        placeholder={placeholder}
        aria-label={label}
        onChange={(e) => onChange(e.target.value ? parseInt(e.target.value) : null)}
        className="w-7 bg-transparent text-right text-sm text-foreground tabular-nums outline-none placeholder:text-muted-foreground [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <span className="text-caption">{unit}</span>
    </label>
  );
}

/** "⋯" menu for a week/day row; keeps destructive actions out of the header. */
function RowMenu({ label, deleteLabel, onDelete }: { label: string; deleteLabel: string; onDelete: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button type="button" variant="ghost" size="icon-sm" aria-label={label} className="shrink-0 text-muted-foreground" />
        }
      >
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuItem variant="destructive" onClick={onDelete}>
          <Trash2 />
          {deleteLabel}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

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
  const [aiRevisionOpen, setAiRevisionOpen] = useState(false);
  const [aiRevisionInstructions, setAiRevisionInstructions] = useState("");
  const [aiRevisionLoading, setAiRevisionLoading] = useState(false);
  const [viewMode, setViewMode] = useState<BuilderViewMode>("focus");
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<
    | { kind: "week"; weekIndex: number; label: string }
    | { kind: "day"; idx: number; label: string }
    | null
  >(null);
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
    const newIdx = block.exercises.length - 1;
    const key = exerciseKey(workoutIdx, blockIdx, newIdx);
    setOpenKeys((prev) => resolveOpenKeys("focus", prev, key, "select"));
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
        (exs[0] as { _exerciseName?: string })._exerciseName
      );
      const label = exs.length === 1 ? `"${firstName}"` : `${exs.length} exercises`;
      copy({ type: "exercises", data: exs, label });
    }
  }

  async function handleAiRevision() {
    if (selection.level !== "exercises" || selection.workoutIdx === null || selection.blockIdx === null) return;
    const selectedExercises = Array.from(selection.exerciseIdxs).sort((a, b) => a - b).map((index) => {
      const exercise = workouts[selection.workoutIdx!].blocks[selection.blockIdx!].exercises[index];
      const libraryExercise = exerciseLibrary.find((item) => item.id === exercise.exerciseId);
      return { id: exercise.exerciseId, name: libraryExercise?.name ?? "Unknown Exercise" };
    });

    setAiRevisionLoading(true);
    const result = await suggestExerciseReplacementsAction({
      selectedExercises,
      exerciseLibrary: exerciseLibrary.map((exercise) => ({
        id: exercise.id,
        name: exercise.name,
        bodyRegion: exercise.bodyRegion,
      })),
      coachInstructions: aiRevisionInstructions,
    });
    setAiRevisionLoading(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }

    const replacements = new Map(result.data.map((item) => [item.selectedExerciseId, item.replacementExerciseId]));
    const next = [...workouts];
    const block = next[selection.workoutIdx].blocks[selection.blockIdx];
    block.exercises = block.exercises.map((exercise) => {
      const replacementId = replacements.get(exercise.exerciseId);
      return replacementId ? { ...exercise, exerciseId: replacementId } : exercise;
    });
    onChange(next);
    setAiRevisionOpen(false);
    setAiRevisionInstructions("");
    setSelection(DEFAULT_SELECTION);
    toast.success("Exercises revised. Review the changes before saving.");
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

  // Deleting a week or a day that holds exercises asks first; empty ones go
  // straight away (nothing to lose).
  function requestRemoveWeek(weekIndex: number, label: string) {
    const hasExercises = workouts.some(
      (w) => w.weekIndex === weekIndex && w.blocks.some((b) => b.exercises.length > 0)
    );
    if (hasExercises) setPendingDelete({ kind: "week", weekIndex, label });
    else removeWeek(weekIndex);
  }

  function requestRemoveWorkout(idx: number) {
    const w = workouts[idx];
    if (w.blocks.some((b) => b.exercises.length > 0)) {
      setPendingDelete({ kind: "day", idx, label: w.name || "this day" });
    } else {
      removeWorkout(idx);
    }
  }

  const totalDays = workouts.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-heading text-foreground">Workouts</h2>
          <p className="mt-0.5 text-body text-muted-foreground">
            {weekGroups.length > 0
              ? `${weekGroups.length} week${weekGroups.length === 1 ? "" : "s"} · ${totalDays} day${totalDays === 1 ? "" : "s"} · drag blocks and exercises to reorder`
              : "Organize the program into weeks of up to 7 days."}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div
            role="group"
            aria-label="Exercise detail"
            className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5"
          >
            {(["focus", "all"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                aria-pressed={viewMode === mode}
                title={mode === "focus" ? "Open one exercise at a time" : "Show every exercise's sets"}
                className={cn(
                  "h-7 rounded-md px-2.5 text-label transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
                  viewMode === mode
                    ? "bg-surface text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {mode === "focus" ? "Focus" : "Expanded"}
              </button>
            ))}
          </div>
          {weekGroups.length > 0 && (
            <Button type="button" variant="outline" size="sm" onClick={addWeek}>
              <Plus /> Add week
            </Button>
          )}
        </div>
      </div>

      {selection.level === "exercises" && selection.exerciseIdxs.size > 0 && (
        <div className="sticky top-20 z-20 flex items-center justify-between gap-3 rounded-lg border border-info-border bg-info-soft px-4 py-2.5 shadow-sm">
          <p className="text-label text-info-foreground">
            {selection.exerciseIdxs.size} exercise{selection.exerciseIdxs.size === 1 ? "" : "s"} selected
          </p>
          <Button
            type="button"
            size="sm"
            onClick={() => setAiRevisionOpen(true)}
          >
            <Sparkles />
            Revise with AI
          </Button>
        </div>
      )}

      <Dialog open={aiRevisionOpen} onOpenChange={(open) => {
        if (!aiRevisionLoading) setAiRevisionOpen(open);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revise selected exercises</DialogTitle>
            <DialogDescription>
              AI will suggest one replacement for each selected exercise using your exercise library. Your sets, reps, rest, and notes will be kept.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={aiRevisionInstructions}
            onChange={(event) => setAiRevisionInstructions(event.target.value)}
            placeholder="Example: Avoid loaded spinal flexion because this client has low-back pain. Prefer supported core work and low-impact options."
            rows={5}
            autoFocus
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAiRevisionOpen(false)} disabled={aiRevisionLoading}>
              Cancel
            </Button>
            <Button type="button" onClick={handleAiRevision} disabled={aiRevisionLoading || !aiRevisionInstructions.trim()}>
              {aiRevisionLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              {aiRevisionLoading ? "Revising..." : "Suggest replacements"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {weekGroups.length === 0 && (
        <EmptyState
          icon={CalendarPlus}
          title="No weeks yet"
          description="Add your first week, then fill its days with blocks and exercises."
          className="rounded-xl border border-dashed border-border-strong bg-card"
          action={
            <Button type="button" onClick={addWeek}>
              <Plus /> Add week
            </Button>
          }
        />
      )}

      {weekGroups.map(({ weekIndex, dayIdxs }, weekPos) => {
        const isCollapsed = collapsedWeeks.has(weekIndex);
        const weekLabel = `Week ${weekPos + 1}`;
        return (
          <section
            key={weekIndex}
            aria-label={weekLabel}
            className="rounded-xl bg-surface-muted/60 ring-1 ring-border"
          >
            <div className="flex items-center gap-2 py-2 pr-2 pl-3">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 rounded-md py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => toggleWeek(weekIndex)}
                aria-expanded={!isCollapsed}
              >
                <ChevronRight
                  className={cn(
                    "size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none",
                    !isCollapsed && "rotate-90"
                  )}
                />
                <h3 className="text-heading text-foreground">{weekLabel}</h3>
                <span className="text-caption text-muted-foreground tabular-nums">
                  {dayIdxs.length} of {MAX_DAYS_PER_WEEK} days
                </span>
              </button>
              <RowMenu
                label={`${weekLabel} actions`}
                deleteLabel="Delete week"
                onDelete={() => requestRemoveWeek(weekIndex, weekLabel)}
              />
            </div>

            {!isCollapsed && (
              <div className="space-y-3 px-3 pb-3">
                {dayIdxs.map((wi, dayPos) => {
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
            "gap-0 py-0 transition-shadow motion-reduce:transition-none",
            selection.level === "workout" && selection.workoutIdx === wi
              ? "ring-2 ring-ring"
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
          {/* Day header: collapse, inline-editable name, duration, actions. */}
          <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 sm:flex-nowrap">
            <button
              type="button"
              className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => toggleDay(weekIndex, workout.dayIndex)}
              aria-expanded={!isDayCollapsed}
              aria-label={isDayCollapsed ? "Expand day" : "Collapse day"}
            >
              <ChevronRight
                className={cn(
                  "size-4 transition-transform motion-reduce:transition-none",
                  !isDayCollapsed && "rotate-90"
                )}
              />
            </button>
            <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-caption font-medium text-muted-foreground tabular-nums">
              Day {dayPos + 1}
            </span>
            <Input
              value={workout.name}
              onChange={(e) =>
                updateWorkoutField(wi, "name", e.target.value)
              }
              aria-label="Workout name"
              placeholder="Workout name"
              className={cn(INLINE_INPUT, "min-w-0 flex-1 font-semibold md:text-base")}
            />
            {isDayCollapsed && (
              <span className="hidden shrink-0 text-caption text-muted-foreground sm:inline">
                {workout.blocks.length} block{workout.blocks.length === 1 ? "" : "s"} ·{" "}
                {exerciseCount} exercise{exerciseCount === 1 ? "" : "s"}
              </span>
            )}
            <UnitNumberField
              label="Estimated minutes"
              icon={<Clock className="size-3.5" />}
              unit="min"
              value={workout.estimatedMinutes ?? null}
              onChange={(v) => updateWorkoutField(wi, "estimatedMinutes", v)}
              placeholder="—"
            />
            <RowMenu
              label={`${workout.name || "Day"} actions`}
              deleteLabel="Delete day"
              onDelete={() => requestRemoveWorkout(wi)}
            />
          </div>
          {!isDayCollapsed && (
          <div className="space-y-3 border-t border-border p-3">
            {/* Stable ids: dnd-kit's auto ids differ between server and client. */}
            <DndContext
              id={`blocks-${wi}`}
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
                          "rounded-lg border border-border bg-surface-muted/50 transition-shadow motion-reduce:transition-none",
                          selection.level === "block" &&
                          selection.workoutIdx === wi &&
                          selection.blockIdx === bi
                            ? "ring-2 ring-ring"
                            : "",
                          clipboard?.type === "exercises" &&
                          hoveredPasteTarget === `block-${wi}-${bi}`
                            ? "border-dashed border-info-border"
                            : ""
                        )}
                        onMouseEnter={() => {
                          if (clipboard?.type === "exercises") setHoveredPasteTarget(`block-${wi}-${bi}`);
                        }}
                        onMouseLeave={() => setHoveredPasteTarget(null)}
                      >
                        {/* Block header */}
                        <div
                          className="flex flex-wrap items-center gap-2 px-2 py-2"
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
                            aria-label="Drag to reorder block"
                            className="flex size-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                            {...dragHandleProps}
                          >
                            <GripVertical className="size-4" />
                          </button>
                          <Input
                            value={block.name || ""}
                            onChange={(e) =>
                              updateBlockField(wi, bi, "name", e.target.value)
                            }
                            placeholder="Block name"
                            aria-label="Block name"
                            className={cn(INLINE_INPUT, "min-w-[8rem] flex-1 font-medium")}
                          />
                          <Select
                            items={BLOCK_TYPE_ITEMS}
                            value={block.type}
                            onValueChange={(v) =>
                              updateBlockField(wi, bi, "type", v)
                            }
                          >
                            <SelectTrigger size="sm" className="w-32 shrink-0" aria-label="Block type">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(BLOCK_TYPE_ITEMS).map(([value, label]) => (
                                <SelectItem key={value} value={value}>{label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {(block.type === "CIRCUIT" ||
                            block.type === "AMRAP") && (
                            <UnitNumberField
                              label="Rounds"
                              unit={block.rounds === 1 ? "round" : "rounds"}
                              value={block.rounds}
                              min={1}
                              onChange={(v) => updateBlockField(wi, bi, "rounds", v ?? 1)}
                            />
                          )}
                          {block.type === "AMRAP" && (
                            <UnitNumberField
                              label="Time cap in seconds"
                              unit="sec cap"
                              value={block.timeCap ?? null}
                              onChange={(v) => updateBlockField(wi, bi, "timeCap", v)}
                              placeholder="—"
                            />
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => removeBlock(wi, bi)}
                            className="ml-auto text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            aria-label={`Delete block ${block.name || bi + 1}`}
                            title="Delete block"
                          >
                            <Trash2 />
                          </Button>
                        </div>

                        {/* Exercises in this block */}
                        <div className="space-y-1.5 px-2 pb-2">
                        <DndContext
                          id={`exercises-${wi}-${bi}`}
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
                            <div className="space-y-1.5">
                              {block.exercises.map((ex, ei) => (
                                <SortableExercise
                                  key={ei}
                                  id={`ex-${wi}-${bi}-${ex.orderIndex}`}
                                >
                                  {(exDragHandleProps) => {
                                    const key = exerciseKey(wi, bi, ei);
                                    const open = isExerciseOpen(viewMode, openKeys, key);
                                    const lib = exerciseLibrary.find(
                                      (e) => e.id === ex.exerciseId
                                    );
                                    const name = getExerciseName(
                                      ex.exerciseId,
                                      (ex as typeof ex & { _exerciseName?: string })._exerciseName
                                    );
                                    const hasVideo = !!lib?.videoUrl && hasRealVideoUrl(lib.videoUrl);
                                    const isChecked =
                                      selection.level === "exercises" &&
                                      selection.workoutIdx === wi &&
                                      selection.blockIdx === bi &&
                                      selection.exerciseIdxs.has(ei);
                                    return open ? (
                                    <div
                                      className={cn(
                                        "group rounded-md border p-3 shadow-xs",
                                        isChecked ? "border-info-border bg-info-soft" : "border-border bg-surface"
                                      )}
                                    >
                                      <div className="mb-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                                        <input
                                          type="checkbox"
                                          aria-label={`Select ${name}`}
                                          className={cn(
                                            "size-4 shrink-0 cursor-pointer rounded border-border accent-primary transition-opacity",
                                            isChecked ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                                          )}
                                          checked={isChecked}
                                          onChange={(e) => {
                                            e.stopPropagation();
                                            handleExerciseCheck(wi, bi, ei, e.target.checked);
                                          }}
                                          onClick={(e) => e.stopPropagation()}
                                        />
                                        <button
                                          type="button"
                                          aria-label={`Drag to reorder ${name}`}
                                          className="flex size-6 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                                          {...exDragHandleProps}
                                        >
                                          <GripVertical className="size-4" />
                                        </button>
                                        <span className="min-w-[8rem] flex-1 truncate font-medium text-foreground">
                                          {name}
                                        </span>
                                        {/* Wraps under the name on narrow screens. */}
                                        <div className="ml-auto flex shrink-0 items-center gap-1">
                                        {hasVideo && (
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setVideoPreview({
                                                url: lib!.videoUrl!,
                                                provider: lib!.videoProvider,
                                                name: lib!.name,
                                              });
                                            }}
                                            className="inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-caption font-medium text-info-foreground hover:bg-info-soft"
                                          >
                                            <Play className="size-3" />
                                            Video
                                          </button>
                                        )}
                                        <Select
                                          items={ACTIVITY_TYPE_ITEMS}
                                          value={ex.activityType || "STRENGTH"}
                                          onValueChange={(v) =>
                                            updateExerciseField(wi, bi, ei, "activityType", v)
                                          }
                                        >
                                          <SelectTrigger size="sm" className="h-7 w-auto shrink-0 gap-1 text-caption" aria-label="Activity type">
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {Object.entries(ACTIVITY_TYPE_ITEMS).map(([value, label]) => (
                                              <SelectItem key={value} value={value}>{label}</SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                        {viewMode !== "all" && (
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon-xs"
                                            onClick={() =>
                                              setOpenKeys((prev) =>
                                                resolveOpenKeys(viewMode, prev, key, "toggle")
                                              )
                                            }
                                            aria-label={`Collapse ${name}`}
                                            className="text-muted-foreground"
                                          >
                                            <ChevronDown />
                                          </Button>
                                        )}
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon-xs"
                                          onClick={() =>
                                            removeExercise(wi, bi, ei)
                                          }
                                          className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                          aria-label={`Remove ${name}`}
                                          title="Remove exercise"
                                        >
                                          <Trash2 />
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
                                        aria-label={`Instructions for ${name}`}
                                        placeholder="Instructions for the client (e.g. use one hand only, keep back straight)…"
                                        className="mb-3 min-h-9 resize-none bg-surface-muted/40 text-sm"
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
                                    ) : (
                                      <CollapsedExerciseRow
                                        name={name}
                                        sets={ex.sets}
                                        hasVideo={hasVideo}
                                        dragHandleProps={exDragHandleProps}
                                        onSelect={() =>
                                          setOpenKeys((prev) =>
                                            resolveOpenKeys(viewMode, prev, key, "select")
                                          )
                                        }
                                        onToggle={() =>
                                          setOpenKeys((prev) =>
                                            resolveOpenKeys(viewMode, prev, key, "toggle")
                                          )
                                        }
                                      />
                                    );
                                  }}
                                </SortableExercise>
                              ))}
                            </div>
                          </SortableContext>
                        </DndContext>

                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-primary hover:bg-primary/10 hover:text-primary"
                          onClick={() => openExercisePicker(wi, bi)}
                        >
                          <Plus /> Add exercise
                        </Button>
                        </div>
                      </div>
                    )}
                  </SortableBlock>
                ))}
              </SortableContext>
            </DndContext>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => addBlock(wi)}
              className="w-full border border-dashed border-border-strong text-muted-foreground hover:text-foreground"
            >
              <Plus /> Add block
            </Button>
          </div>
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
                  className="w-full border-dashed bg-surface/60 text-muted-foreground hover:text-foreground"
                >
                  <Plus />
                  {dayIdxs.length >= MAX_DAYS_PER_WEEK
                    ? `All ${MAX_DAYS_PER_WEEK} days used`
                    : `Add day to ${weekLabel.toLowerCase()}`}
                </Button>
              </div>
            )}
          </section>
        );
      })}

      {weekGroups.length > 0 && (
        <Button
          type="button"
          variant="outline"
          onClick={addWeek}
          className="h-11 w-full border-dashed border-border-strong text-muted-foreground hover:text-foreground"
        >
          <Plus /> Add week
        </Button>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={pendingDelete?.kind === "week" ? `Delete ${pendingDelete.label}?` : `Delete “${pendingDelete?.label ?? ""}”?`}
        description={
          pendingDelete?.kind === "week"
            ? "Every day, block and exercise in this week will be removed. Nothing is saved until you save the program."
            : "This day's blocks and exercises will be removed. Nothing is saved until you save the program."
        }
        confirmLabel={pendingDelete?.kind === "week" ? "Delete week" : "Delete day"}
        variant="destructive"
        onConfirm={() => {
          if (pendingDelete?.kind === "week") removeWeek(pendingDelete.weekIndex);
          else if (pendingDelete?.kind === "day") removeWorkout(pendingDelete.idx);
          setPendingDelete(null);
        }}
      />

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
