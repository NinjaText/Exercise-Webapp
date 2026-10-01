import {  getClientExerciseHistory } from "@/actions/exercise-history-actions";
import { cn } from "@/lib/utils";
import { hasRealVideoUrl } from "@/lib/utils/video";
import { useClipboard, stripIds } from "@/lib/clipboard-context";
import { useBuilderKeyboard } from "@/hooks/use-builder-keyboard";
import {
  pasteExercisesToBlockAction,
  pasteBlockToWorkoutAction,
} from "@/actions/calendar-workout-actions";
import { History } from "lucide-react";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { GripVertical, Dumbbell, Trash2, Loader2, X, Plus, MoreVertical, Calendar as CalendarIcon, ChevronDown, ChevronRight, Settings, CheckCircle, Info, Sparkles, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";
import { toLocalCalendarDate, toUtcCalendarDate } from "@/lib/utils/calendar-date";
import { UniversalVideoPlayer } from "@/components/exercises/universal-video-player";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ExercisePickerDialog } from "@/components/programs/exercise-picker-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ExerciseSourcePreference } from "@/lib/utils/exercise-picker";
import type { SessionWithFullWorkout } from "@/actions/calendar-workout-actions";
import {
  getSessionWithWorkout,
  updateWorkoutName,
  addBlockToWorkout,
  addExerciseToBlock,
  addSetToExercise,
  updateSet,
  updateBlock,
  deleteSet,
  updateBlockExercise,
  reorderBlockExercises,
  deleteBlockExercise,
  deleteBlock,
  deleteSession,
  duplicateBlockAction,
  duplicateBlockExerciseAction,
  duplicateWorkoutToDateAction,
} from "@/actions/calendar-workout-actions";

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// ---------------------------------------------------------------------------  // Types
// ---------------------------------------------------------------------------  

type ExerciseSummary = {
  id: string;
  name: string;
  bodyRegion: string[];
  difficultyLevel: string | null;
  defaultReps?: number | null;
  targetRPE?: number | null;
  targetPercentage1RM?: number | null;
  tempo?: string | null;
  musclesTargeted?: string[];
  description?: string | null;
  videoUrl?: string | null;
  videoProvider?: string | null;
  exercisePhases?: string[];
  source?: string | null;
  organizationId?: string | null;
  isPublic?: boolean;
};

type PanelState =
  | { mode: "closed" }
  | { mode: "creating"; date: Date }
  | { mode: "editing"; sessionId: string };

interface SelectionState {
  level: "block" | "exercises" | null;
  blockIndex: number | null;
  blockId: string | null;
  exerciseIdxs: Set<number>;
}

const DEFAULT_SELECTION: SelectionState = {
  level: null,
  blockIndex: null,
  blockId: null,
  exerciseIdxs: new Set(),
};

interface WorkoutEditorPanelProps {
  panelState: PanelState;
  onClose: () => void;
  exerciseLibrary: ExerciseSummary[];
  organizationOrganizationId?: string;
  exerciseSourcePreference?: ExerciseSourcePreference;
  clientId: string;
  onWorkoutCreated: () => void;
  onWorkoutDeleted: () => void;
  onWorkoutUpdated: () => void;
  onAiGenerateClick?: (date: Date) => void;
  createAdHocWorkoutAction: (
    clientId: string,
    scheduledDate: string,
    workoutName: string
  ) => Promise<{ success: true; data: { sessionId: string; workoutId: string } }
 | { success: false; error: string }>;                                          
}

// ---------------------------------------------------------------------------  // Block type config
// ---------------------------------------------------------------------------  

const BLOCK_TYPES = [
  { value: 'NORMAL', label: 'Normal', color: 'bg-neutral' },
  { value: 'WARMUP', label: 'Warmup', color: 'bg-success' },
  { value: 'COOLDOWN', label: 'Cooldown', color: 'bg-info' },
  { value: 'CIRCUIT', label: 'Circuit', color: 'bg-brand' },
  { value: 'SUPERSET', label: 'Superset', color: 'bg-warning' },
  { value: 'AMRAP', label: 'AMRAP', color: 'bg-danger' },
  { value: 'EMOM', label: 'EMOM', color: 'bg-info' },
] as const;

function getBlockTypeConfig(type: string) {
  return BLOCK_TYPES.find((bt) => bt.value === type) ?? BLOCK_TYPES[0];
}

// ---------------------------------------------------------------------------  // Debounce hook for inline set editing
// ---------------------------------------------------------------------------  

function useDebouncedCallback<T extends (...args: never[]) => unknown>(
  callback: T,
  delay: number
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  return useCallback(
    (...args: Parameters<T>) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        callbackRef.current(...args);
      }, delay);
    },
    [delay]
  );
}

// ---------------------------------------------------------------------------
// Block Name Input
// ---------------------------------------------------------------------------
function BlockNameInput({ blockId, initialName, onSave, disabled }: {
  blockId: string;
  initialName: string | null;
  onSave: (name: string | null) => void;
  disabled?: boolean;
}) {
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState(initialName ?? "");

  React.useEffect(() => { setValue(initialName ?? ""); }, [initialName]);

  if (disabled) {
    return initialName ? <span className="text-label text-foreground">{initialName}</span> : null;
  }

  if (editing) {
    return (
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => { setEditing(false); onSave(value.trim() || null); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { setEditing(false); onSave(value.trim() || null); }
          if (e.key === "Escape") { setValue(initialName ?? ""); setEditing(false); }
        }}
        autoFocus
        placeholder="Block name..."
        className="h-7 w-40 px-2 py-0 text-body shadow-none"
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      type="button"
      className="rounded-md px-1.5 py-0.5 text-label text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
      title="Click to edit block name"
    >
      {initialName ?? <span className="text-caption italic">Add name...</span>}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Circuit Controls (rounds + rest)
// ---------------------------------------------------------------------------
function CircuitControls({ blockIndex, blockId, rounds, restBetweenRounds, onSave, disabled }: {
  blockIndex: number;
  blockId: string;
  rounds: number;
  restBetweenRounds: number | null;
  onSave: (blockIndex: number, blockId: string, data: { rounds?: number; restBetweenRounds?: number | null }) => void;
  disabled?: boolean;
}) {
  const [localRounds, setLocalRounds] = React.useState(String(rounds));
  const [localRest, setLocalRest] = React.useState(restBetweenRounds != null ? String(restBetweenRounds) : "");

  React.useEffect(() => { setLocalRounds(String(rounds)); }, [rounds]);
  React.useEffect(() => { setLocalRest(restBetweenRounds != null ? String(restBetweenRounds) : ""); }, [restBetweenRounds]);

  return (
    <div className="ml-1 flex items-center gap-3">
      <div className="flex items-center gap-1">
        <span className="text-caption font-medium uppercase tracking-wide">Sets</span>
        <Input
          type="number"
          min={1}
          max={20}
          value={localRounds}
          onChange={(e) => setLocalRounds(e.target.value)}
          onBlur={() => {
            const v = parseInt(localRounds);
            if (!isNaN(v) && v >= 1) onSave(blockIndex, blockId, { rounds: v });
          }}
          disabled={disabled}
          aria-label="Sets"
          className="h-7 w-12 px-1.5 text-center text-caption text-foreground shadow-none"
        />
      </div>
      <div className="flex items-center gap-1">
        <span className="text-caption font-medium uppercase tracking-wide">Rest</span>
        <Input
          type="number"
          min={0}
          value={localRest}
          onChange={(e) => setLocalRest(e.target.value)}
          onBlur={() => {
            const v = localRest === "" ? null : parseInt(localRest);
            onSave(blockIndex, blockId, { restBetweenRounds: isNaN(v as number) ? null : v });
          }}
          disabled={disabled}
          placeholder="—"
          aria-label="Rest between sets (seconds)"
          className="h-7 w-14 px-1.5 text-center text-caption text-foreground shadow-none"
        />
        <span className="text-caption">sec</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------  // Sortable Exercise Item
// ---------------------------------------------------------------------------
function SortableExercise({
  id,
  exercise,
  savingSetIds,
  blockIndex,
  exerciseIndex,
  blockLetter,
  isCircuit,
  onSetChange,
  onSetUnitChange,
  onDeleteSet,
  onDeleteExercise,
  onAddSet,
  onUpdateNotes,
  clientId,
  sessionStatus,
  exerciseLog,
  isSelected,
  onToggleSelect,
}: any) {
  const [expanded, setExpanded] = React.useState(false);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    opacity: isDragging ? 0.8 : 1,
  };


  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyData, setHistoryData] = useState<any>(null);

  async function loadHistory() {
    if (historyOpen) {
      setHistoryOpen(false);
      return;
    }
    setHistoryLoading(true);
    setHistoryOpen(true);
    const res = await getClientExerciseHistory(clientId, exercise.exercise.id);
    if (res.success) {
      setHistoryData(res.data);
    }
    setHistoryLoading(false);
  }


  return (
    <div ref={setNodeRef} style={style} className="group border-b border-border py-3 last:border-0">                                                                   
      {/* Exercise header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3 flex-1">
          <input
            type="checkbox"
            className={cn(
              "h-4 w-4 shrink-0 rounded border-border cursor-pointer transition-opacity mt-1",
              isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            )}
            checked={!!isSelected}
            onChange={(e) => {
              e.stopPropagation();
              onToggleSelect?.(e.target.checked);
            }}
            onClick={(e) => e.stopPropagation()}
            disabled={sessionStatus === "COMPLETED"}
          />
          <div
            {...attributes}
            {...listeners}
            className={`cursor-move p-1 -ml-1 ${sessionStatus === "COMPLETED" ? "opacity-0 cursor-default" : "hover:bg-muted text-muted-foreground/40 rounded opacity-0 group-hover:opacity-100 transition-opacity"}`}
          >
            <GripVertical className="h-4 w-4" />
          </div>
          
          <div className="flex items-center gap-2 flex-1">
            <div className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md bg-surface-muted text-caption font-semibold text-foreground tabular-nums ring-1 ring-border" onClick={() => setExpanded(!expanded)}>
              {blockLetter}{exerciseIndex + 1}
            </div>

            <div className="flex flex-col flex-1 cursor-pointer min-w-0" onClick={() => setExpanded(!expanded)}>
              <div className="flex items-center gap-2">
                <span className="truncate text-label text-foreground">
                  {exercise.exercise.name}
                </span>
                {hasRealVideoUrl(exercise.exercise.videoUrl) && (
                  <span className="shrink-0 rounded-sm bg-surface-muted px-1.5 py-0.5 text-caption font-medium ring-1 ring-border">
                    Video
                  </span>
                )}
              </div>
              {(exercise.notes || isCircuit) && (
                <span className="line-clamp-1 text-caption">
                   {isCircuit ? "Circuit/Superset" : ""} {exercise.notes && isCircuit ? " - " : ""}{exercise.notes}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => setExpanded(!expanded)}
            aria-label={expanded ? "Collapse exercise" : "Expand exercise"}
            aria-expanded={expanded}
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
          
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:text-primary"
          onClick={loadHistory}
          title="View Exercise History"
          aria-label="View exercise history"
        >
          <History className="h-3.5 w-3.5" />
        </Button>
{(!sessionStatus || sessionStatus !== "COMPLETED") && (
  <DropdownMenu>
    <DropdownMenuTrigger
      aria-label="Exercise actions"
      className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100 motion-reduce:transition-none lg:opacity-0"
    >
      <MoreVertical className="h-3.5 w-3.5" />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem
        variant="destructive"
        onClick={() => onDeleteExercise(blockIndex, exerciseIndex)}
      >
        <Trash2 className="h-3.5 w-3.5 mr-1.5" />
        Delete
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
)}
        </div>
      </div>

      {/* Sets & Notes Container — always visible so reps/sets/lbs are editable
          without a further click. The video preview stays behind the expand
          toggle to avoid loading an iframe per exercise on open. */}
      <div className="mt-3 ml-11 border-l-2 border-border pl-3">
          {expanded && hasRealVideoUrl(exercise.exercise.videoUrl) && (
            <div className="mb-3 aspect-video w-full max-w-[280px] overflow-hidden rounded-md bg-surface-muted ring-1 ring-border">
              <UniversalVideoPlayer
                url={exercise.exercise.videoUrl}
                provider={exercise.exercise.videoProvider}
              />
            </div>
          )}
          <div className="mb-3">
            <Input
              placeholder="Add coach notes..."
              aria-label="Coach notes"
              className="h-8 border-dashed bg-transparent px-2 text-caption text-foreground shadow-none hover:border-solid focus:border-solid disabled:cursor-default disabled:border-transparent disabled:opacity-70"                                                                    
              value={exercise.notes || ""}
              onChange={(e) => onUpdateNotes(blockIndex, exerciseIndex, e.target.value)}
              disabled={sessionStatus === "COMPLETED"}
            />
          </div>

          <div className="space-y-1 overflow-x-auto">
            {/* Minimal Set Headers */}
            {exercise.sets.length > 0 && (
              <div className="mb-1 grid min-w-[340px] grid-cols-[1.5rem_minmax(80px,1.5fr)_minmax(80px,1.5fr)_minmax(60px,1fr)_2rem] gap-2 px-1 text-caption font-medium uppercase tracking-wide">
                <span className="text-center">Set</span>
                <span>Reps / Dur</span>
                <span>Load / %</span>
                <span>Tempo/Rest</span>
                <span />
              </div>
            )}
            
            {/* Sets Rows */}
            {exercise.sets.map((set: any, setIndex: number) => {
              const actualLog = exerciseLog?.setLogs?.find((l: any) => l.setIndex === setIndex);
              const isCompleted = sessionStatus === "COMPLETED";

              return (
              <div
                key={set.id}
                className="group/set grid min-w-[340px] grid-cols-[1.5rem_minmax(80px,1.5fr)_minmax(80px,1.5fr)_minmax(60px,1fr)_2rem] items-center gap-2 rounded-md border border-border bg-surface p-1 transition-colors hover:bg-surface-muted motion-reduce:transition-none"
              >
                <div className="relative text-center text-caption font-medium tabular-nums">                                                                               
                  {setIndex + 1}
                  {savingSetIds.has(set.id) && (
                    <Loader2 className="h-2.5 w-2.5 animate-spin absolute -right-1 -top-1 text-primary" />                                                      
                  )}
                </div>
                
                {/* Reps & Duration */}
                <div className="flex flex-col gap-0.5 relative">
                  <Input
                    type="number"
                    value={set.targetReps ?? ""}
                    onChange={(e) => onSetChange(blockIndex, exerciseIndex, setIndex, "targetReps", e.target.value)}                                                  
                    className="h-7 border-transparent px-1.5 text-caption text-foreground shadow-none hover:border-border-strong focus:border-ring focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="Reps"
                    disabled={isCompleted}
                  />
                  <div className="flex gap-1">
                    <Input
                      type="number"
                      value={set.targetDuration ?? ""}
                      onChange={(e) => onSetChange(blockIndex, exerciseIndex, setIndex, "targetDuration", e.target.value)}
                      className="h-7 border-transparent bg-transparent px-1.5 text-caption shadow-none hover:border-border-strong focus:border-ring focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50"
                      placeholder="Duration"
                      disabled={isCompleted}
                    />
                    <Select
                      value={set.targetDurationUnit || "SEC"}
                      onValueChange={(v) => onSetUnitChange(blockIndex, exerciseIndex, setIndex, "targetDurationUnit", v)}
                      disabled={isCompleted}
                    >
                      <SelectTrigger aria-label="Duration unit" className="h-7 w-12 shrink-0 border-transparent px-1.5 text-caption shadow-none hover:border-border-strong focus:border-ring disabled:cursor-not-allowed disabled:opacity-50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="SEC">sec</SelectItem>
                        <SelectItem value="MIN">min</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {isCompleted && actualLog && (actualLog.actualReps != null || actualLog.actualDuration != null) && (
                     <div className="absolute -right-2 -top-2 flex gap-0.5 z-10" title="Actual Performance">
                       <Badge variant="outline" className="flex h-4 items-center gap-0.5 bg-surface px-1 py-0 text-caption shadow-xs">
                         <CheckCircle className="h-2.5 w-2.5" />
                         {actualLog.actualReps != null ? `${actualLog.actualReps}r` : ''}
                         {actualLog.actualReps != null && actualLog.actualDuration != null ? ' | ' : ''}
                         {actualLog.actualDuration != null ? `${actualLog.actualDuration}s` : ''}
                       </Badge>
                     </div>
                  )}
                </div>

                {/* Load & %1RM */}
                <div className="flex flex-col gap-0.5 relative">
                  <Input
                    type="number"
                    value={set.targetWeight ?? ""}
                    onChange={(e) => onSetChange(blockIndex, exerciseIndex, setIndex, "targetWeight", e.target.value)}                                                
                    className="h-7 border-transparent px-1.5 text-caption text-foreground shadow-none hover:border-border-strong focus:border-ring focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="Lbs/Kg"
                    disabled={isCompleted}
                  />
                  <Input
                    type="number"
                    value={set.targetPercentage1RM ?? ""}
                    onChange={(e) => onSetChange(blockIndex, exerciseIndex, setIndex, "targetPercentage1RM", e.target.value)}
                    className="h-7 border-transparent bg-transparent px-1.5 text-caption shadow-none hover:border-border-strong focus:border-ring focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="% 1RM"
                    disabled={isCompleted}
                  />
                  {isCompleted && actualLog && actualLog.actualWeight != null && (
                     <div className="absolute -right-2 -top-2 flex gap-0.5 z-10" title="Actual Weight">
                       <Badge variant="outline" className="flex h-4 items-center gap-0.5 bg-surface px-1 py-0 text-caption shadow-xs">
                         <CheckCircle className="h-2.5 w-2.5" />
                         {actualLog.actualWeight}
                       </Badge>
                     </div>
                  )}
                </div>

                {/* Tempo & Rest */}
                <div className="flex flex-col gap-0.5 relative">
                   <Input
                    type="text"
                    value={set.tempo ?? ""}
                    onChange={(e) => onSetChange(blockIndex, exerciseIndex, setIndex, "tempo", e.target.value)}
                    className="h-7 border-transparent px-1.5 text-caption text-foreground shadow-none hover:border-border-strong focus:border-ring focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="Tempo"
                    disabled={isCompleted}
                  />
                  <Input
                    type="number"
                    value={set.restAfter ?? ""}
                    onChange={(e) => onSetChange(blockIndex, exerciseIndex, setIndex, "restAfter", e.target.value)}                                                   
                    className="h-7 border-transparent bg-transparent px-1.5 text-caption shadow-none hover:border-border-strong focus:border-ring focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="Rest(s)"
                    disabled={isCompleted}
                  />
                </div>

                {/* Delete Set */}
                <div className="flex justify-center">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete set ${setIndex + 1}`}
                    className="size-8 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover/set:opacity-100 disabled:opacity-0 motion-reduce:transition-none"                                                                               
                    onClick={() => onDeleteSet(blockIndex, exerciseIndex, setIndex)}  
                    disabled={isCompleted}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            )})}
          </div>
          
          {!sessionStatus || sessionStatus !== "COMPLETED" ? (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 px-2 text-muted-foreground"
              onClick={() => onAddSet(blockIndex, exerciseIndex)}
            >
              <Plus className="size-3.5" />
              Add Set
            </Button>
          ) : null}
        </div>
    </div>
  );
}
// ---------------------------------------------------------------------------  // Clipboard conversion helpers
// ---------------------------------------------------------------------------

function calendarExToClipboardEx(ex: any) {
  return {
    exerciseId: ex.exercise.id as string,
    orderIndex: ex.orderIndex as number,
    restSeconds: (ex.restSeconds ?? null) as number | null,
    notes: (ex.notes ?? null) as string | null,
    supersetGroup: (ex.supersetGroup ?? null) as string | null,
    _exerciseName: ex.exercise.name as string,
    sets: (ex.sets as any[]).map((s, i) => ({
      orderIndex: i,
      setType: (s.setType ?? "NORMAL") as string,
      targetReps: (s.targetReps ?? null) as number | null,
      targetWeight: (s.targetWeight ?? null) as number | null,
      targetDuration: (s.targetDuration ?? null) as number | null,
      targetRPE: (s.targetRPE ?? null) as number | null,
      restAfter: (s.restAfter ?? null) as number | null,
    })),
  };
}

function calendarBlockToClipboardBlock(block: any) {
  return {
    name: (block.name ?? null) as string | null,
    type: block.type as string,
    orderIndex: block.orderIndex as number,
    rounds: (block.rounds ?? 1) as number,
    restBetweenRounds: (block.restBetweenRounds ?? null) as number | null,
    timeCap: (block.timeCap ?? null) as number | null,
    notes: (block.notes ?? null) as string | null,
    exercises: (block.exercises as any[]).map(calendarExToClipboardEx),
  };
}

// ---------------------------------------------------------------------------  // Main Component
// ---------------------------------------------------------------------------

export function WorkoutEditorPanel({
  panelState,
  onClose,
  exerciseLibrary,
  organizationOrganizationId,
  exerciseSourcePreference,
  clientId,
  onWorkoutCreated,
  onWorkoutDeleted,
  onWorkoutUpdated,
  onAiGenerateClick,
  createAdHocWorkoutAction,
}: WorkoutEditorPanelProps) {
  const [session, setSession] = useState<SessionWithFullWorkout | null>(null);  
  const [loading, setLoading] = useState(false);
  const [workoutName, setWorkoutName] = useState("");
  const [nameChanged, setNameChanged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingSetIds, setSavingSetIds] = useState<Set<string>>(new Set());     
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerBlockId, setPickerBlockId] = useState<string | null>(null);      
  const [addingBlockType, setAddingBlockType] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [duplicateDate, setDuplicateDate] = useState("");
  const [duplicating, setDuplicating] = useState(false);
  const [duplicatePopoverOpen, setDuplicatePopoverOpen] = useState(false);
  const [selection, setSelection] = useState<SelectionState>(DEFAULT_SELECTION);
  const [hoveredPasteTarget, setHoveredPasteTarget] = useState<string | null>(null);
  const { clipboard, copy } = useClipboard();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),        
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const isOpen = panelState.mode !== "closed";

  // Load session data when opening in edit mode
  useEffect(() => {
    if (panelState.mode === "editing") {
      loadSession(panelState.sessionId);
    } else if (panelState.mode === "creating") {
      setSession(null);
      setWorkoutName("New Workout");
      setNameChanged(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelState.mode, panelState.mode === "editing" ? panelState.sessionId : null]);
  async function loadSession(sessionId: string) {
    setLoading(true);
    try {
      const result = await getSessionWithWorkout(sessionId);
      if (result.success) {
        setSession(result.data);
        setWorkoutName(result.data.workout.name);
        setNameChanged(false);
      } else {
        toast.error(result.error);
        onClose();
      }
    } finally {
      setLoading(false);
    }
  }

  // Create a new ad-hoc workout when in creating mode
  async function handleCreateWorkout() {
    if (panelState.mode !== "creating") return;
    setSaving(true);
    try {
      const result = await createAdHocWorkoutAction(
        clientId,
        toUtcCalendarDate(panelState.date).toISOString(),
        workoutName
      );
      if (result.success) {
        toast.success("Workout created");
        onWorkoutCreated();
        // Load the newly created session to switch to edit mode
        await loadSession(result.data.sessionId);
      } else {
        toast.error(result.error);
      }
    } finally {
      setSaving(false);
    }
  }

  // Save workout name
  async function handleSaveName() {
    if (!session || !nameChanged) return;
    setSaving(true);
    try {
      const result = await updateWorkoutName(session.workout.id, workoutName);  
      if (result.success) {
        setNameChanged(false);
        onWorkoutUpdated();
        toast.success("Workout name updated");
      } else {
        toast.error(result.error);
      }
    } finally {
      setSaving(false);
    }
  }

  const debouncedUpdateNotes = useDebouncedCallback(
    async (blockExerciseId: string, notes: string) => {
      const result = await updateBlockExercise(blockExerciseId, { notes });     
      if (!result.success) {
        toast.error(result.error);
      }
    },
    800
  );

  function handleUpdateExerciseNotes(
    blockIndex: number,
    exerciseIndex: number,
    notes: string
  ) {
    if (!session) return;
    const updatedSession = { ...session };
    const blocks = [...updatedSession.workout.blocks];
    const block = { ...blocks[blockIndex] };
    const exercises = [...block.exercises];
    const exercise = { ...exercises[exerciseIndex], notes };
    exercises[exerciseIndex] = exercise;
    block.exercises = exercises;
    blocks[blockIndex] = block;
    updatedSession.workout = { ...updatedSession.workout, blocks };
    setSession(updatedSession);

    debouncedUpdateNotes(exercise.id, notes);
  }

  // Debounced set update
  const debouncedUpdateSet = useDebouncedCallback(
    async (
      setId: string,
      data: { targetReps?: number | null; targetWeight?: number | null; targetPercentage1RM?: number | null; targetDuration?: number | null; targetDurationUnit?: string | null; targetRPE?: number | null; tempo?: string | null; restAfter?: number | null; }
    ) => {
      setSavingSetIds((prev) => new Set(prev).add(setId));
      try {
        const result = await updateSet(setId, data);
        if (!result.success) {
          toast.error(result.error);
        }
      } finally {
        setSavingSetIds((prev) => {
          const next = new Set(prev);
          next.delete(setId);
          return next;
        });
      }
    },
    800
  );

  // Update local set data and trigger debounced save
  function handleSetChange(
    blockIndex: number,
    exerciseIndex: number,
    setIndex: number,
    field: string,
    value: string
  ) {
    if (!session) return;
    const numValue = value === "" ? null : Number(value);
    const updatedSession = { ...session };
    const blocks = [...updatedSession.workout.blocks];
    const block = { ...blocks[blockIndex] };
    const exercises = [...block.exercises];
    const exercise = { ...exercises[exerciseIndex] };
    const sets = [...exercise.sets];
    const targetSet = { ...sets[setIndex], [field]: numValue };
    sets[setIndex] = targetSet;
    exercise.sets = sets;
    exercises[exerciseIndex] = exercise;
    block.exercises = exercises;
    blocks[blockIndex] = block;
    updatedSession.workout = { ...updatedSession.workout, blocks };
    setSession(updatedSession);

    debouncedUpdateSet(targetSet.id, { [field]: numValue } as never);
  }

  // Update local set data (string-valued fields, e.g. Select controls) and trigger debounced save.
  // Mirrors handleSetChange's local-state-update + debouncedUpdateSet mechanism, but the incoming
  // value is already the raw string (from onValueChange), so no Number() coercion is applied.
  function handleSetUnitChange(
    blockIndex: number,
    exerciseIndex: number,
    setIndex: number,
    field: string,
    value: string
  ) {
    if (!session) return;
    const updatedSession = { ...session };
    const blocks = [...updatedSession.workout.blocks];
    const block = { ...blocks[blockIndex] };
    const exercises = [...block.exercises];
    const exercise = { ...exercises[exerciseIndex] };
    const sets = [...exercise.sets];
    const targetSet = { ...sets[setIndex], [field]: value };
    sets[setIndex] = targetSet;
    exercise.sets = sets;
    exercises[exerciseIndex] = exercise;
    block.exercises = exercises;
    blocks[blockIndex] = block;
    updatedSession.workout = { ...updatedSession.workout, blocks };
    setSession(updatedSession);

    debouncedUpdateSet(targetSet.id, { [field]: value } as never);
  }

  // Add block
  async function handleAddBlock(type: string) {
    if (!session) return;
    setAddingBlockType(false);
    const orderIndex = session.workout.blocks.length;
    const result = await addBlockToWorkout(session.workout.id, {
      type,
      orderIndex,
    });
    if (result.success) {
      setSession((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          workout: {
            ...prev.workout,
            blocks: [
              ...prev.workout.blocks,
              { ...result.data, exercises: [] },
            ],
          },
        };
      });
      onWorkoutUpdated();
    } else {
      toast.error(result.error);
    }
  }

  // Add exercise to block
  function handleOpenPicker(blockId: string) {
    setPickerBlockId(blockId);
    setPickerOpen(true);
  }

  async function handleExerciseSelected(
    ex: ExerciseSummary
  ) {
    if (!pickerBlockId || !session) return;
    setPickerOpen(false);
    const result = await addExerciseToBlock(
      pickerBlockId,
      ex.id,
      undefined,
      ex.defaultReps ?? undefined
    );
    if (result.success) {
      setSession((prev) => {
        if (!prev) return prev;
        const blocks = prev.workout.blocks.map((b) => {
          if (b.id === pickerBlockId) {
            return { ...b, exercises: [...b.exercises, result.data] };
          }
          return b;
        });
        return { ...prev, workout: { ...prev.workout, blocks } };
      });
      onWorkoutUpdated();
    } else {
      toast.error(result.error);
    }
    setPickerBlockId(null);
  }

  // Add set
  async function handleAddSet(blockIndex: number, exerciseIndex: number) {      
    if (!session) return;
    const exercise = session.workout.blocks[blockIndex].exercises[exerciseIndex];                                                                               
    const orderIndex = exercise.sets.length;
    const result = await addSetToExercise(exercise.id, orderIndex);
    if (result.success) {
      setSession((prev) => {
        if (!prev) return prev;
        const blocks = [...prev.workout.blocks];
        const block = { ...blocks[blockIndex] };
        const exercises = [...block.exercises];
        const ex = { ...exercises[exerciseIndex] };
        ex.sets = [...ex.sets, result.data];
        exercises[exerciseIndex] = ex;
        block.exercises = exercises;
        blocks[blockIndex] = block;
        return { ...prev, workout: { ...prev.workout, blocks } };
      });
    } else {
      toast.error(result.error);
    }
  }

  // Delete set
  async function handleDeleteSet(
    blockIndex: number,
    exerciseIndex: number,
    setIndex: number
  ) {
    if (!session) return;
    const setId = session.workout.blocks[blockIndex].exercises[exerciseIndex].sets[setIndex].id;                                                                
    const result = await deleteSet(setId);
    if (result.success) {
      setSession((prev) => {
        if (!prev) return prev;
        const blocks = [...prev.workout.blocks];
        const block = { ...blocks[blockIndex] };
        const exercises = [...block.exercises];
        const ex = { ...exercises[exerciseIndex] };
        ex.sets = ex.sets.filter((_, i) => i !== setIndex);
        exercises[exerciseIndex] = ex;
        block.exercises = exercises;
        blocks[blockIndex] = block;
        return { ...prev, workout: { ...prev.workout, blocks } };
      });
    } else {
      toast.error(result.error);
    }
  }

  // Delete exercise from block
  async function handleDeleteExercise(blockIndex: number, exerciseIndex: number)
 {                                                                              
    if (!session) return;
    const beId = session.workout.blocks[blockIndex].exercises[exerciseIndex].id;
    const result = await deleteBlockExercise(beId);
    if (result.success) {
      setSession((prev) => {
        if (!prev) return prev;
        const blocks = [...prev.workout.blocks];
        const block = { ...blocks[blockIndex] };
        block.exercises = block.exercises.filter((_, i) => i !== exerciseIndex);
        blocks[blockIndex] = block;
        return { ...prev, workout: { ...prev.workout, blocks } };
      });
      onWorkoutUpdated();
    } else {
      toast.error(result.error);
    }
  }

  // Duplicate exercise
  async function handleDuplicateExercise(blockIndex: number, exerciseIndex: number) {
    if (!session) return;
    const beId = session.workout.blocks[blockIndex].exercises[exerciseIndex].id;
    const result = await duplicateBlockExerciseAction(beId);
    if (result.success) {
      setSession((prev) => {
        if (!prev) return prev;
        const blocks = [...prev.workout.blocks];
        const block = { ...blocks[blockIndex] };
        const exercises = [...block.exercises];
        exercises.splice(exerciseIndex + 1, 0, result.data);
        block.exercises = exercises;
        blocks[blockIndex] = block;
        return { ...prev, workout: { ...prev.workout, blocks } };
      });
      onWorkoutUpdated();
    } else {
      toast.error(result.error);
    }
  }

  // Delete block
  async function handleDeleteBlock(blockIndex: number) {
    if (!session) return;
    const blockId = session.workout.blocks[blockIndex].id;
    const result = await deleteBlock(blockId);
    if (result.success) {
      setSession((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          workout: {
            ...prev.workout,
            blocks: prev.workout.blocks.filter((_, i) => i !== blockIndex),     
          },
        };
      });
      onWorkoutUpdated();
    } else {
      toast.error(result.error);
    }
  }

  // Duplicate block
  async function handleDuplicateBlock(blockIndex: number) {
    if (!session) return;
    const blockId = session.workout.blocks[blockIndex].id;
    const result = await duplicateBlockAction(blockId);
    if (result.success) {
      setSession((prev) => {
        if (!prev) return prev;
        const blocks = [...prev.workout.blocks];
        blocks.splice(blockIndex + 1, 0, result.data);
        return { ...prev, workout: { ...prev.workout, blocks } };
      });
      onWorkoutUpdated();
    } else {
      toast.error(result.error);
    }
  }

  function handleExerciseCheck(
    blockIndex: number,
    blockId: string,
    exerciseIndex: number,
    checked: boolean
  ) {
    setSelection((prev) => {
      const sameBlock =
        prev.level === "exercises" &&
        prev.blockIndex === blockIndex;
      const newIdxs = sameBlock ? new Set(prev.exerciseIdxs) : new Set<number>();
      if (checked) {
        newIdxs.add(exerciseIndex);
        return { level: "exercises", blockIndex, blockId, exerciseIdxs: newIdxs };
      }
      newIdxs.delete(exerciseIndex);
      return newIdxs.size > 0
        ? { level: "exercises", blockIndex, blockId, exerciseIdxs: newIdxs }
        : DEFAULT_SELECTION;
    });
  }

  function handleCopy() {
    if (!session) return;
    const { level, blockIndex, exerciseIdxs } = selection;

    if (level === "block" && blockIndex !== null) {
      const block = session.workout.blocks[blockIndex];
      const data = calendarBlockToClipboardBlock(block);
      copy({ type: "block", data: data as any, label: `"${block.name || "Block"}"` });
    } else if (level === "exercises" && blockIndex !== null && exerciseIdxs.size > 0) {
      const block = session.workout.blocks[blockIndex];
      const sorted = Array.from(exerciseIdxs).sort((a, b) => a - b);
      const exs = sorted.map((i) => calendarExToClipboardEx(block.exercises[i]));
      const firstName = block.exercises[sorted[0]]?.exercise?.name ?? "Exercise";
      const label = exs.length === 1 ? `"${firstName}"` : `${exs.length} exercises`;
      copy({ type: "exercises", data: exs as any, label });
    }
  }

  async function handlePaste() {
    if (!clipboard || !session) return;

    if (clipboard.type === "block") {
      const result = await pasteBlockToWorkoutAction(
        session.workout.id,
        clipboard.data as any
      );
      if (result.success) {
        toast.success(`Block "${clipboard.data.name || "Block"}" pasted`);
        const refreshed = await getSessionWithWorkout(session.id);
        if (refreshed.success) setSession(refreshed.data);
        onWorkoutUpdated();
      } else {
        toast.error(result.error);
      }
      return;
    }

    if (clipboard.type === "exercises") {
      const { blockIndex, blockId } = selection;
      if (blockIndex === null || blockId === null) {
        toast.info("Click a block first, then paste");
        return;
      }
      const result = await pasteExercisesToBlockAction(
        blockId,
        clipboard.data as any
      );
      if (result.success) {
        const n = clipboard.data.length;
        toast.success(`${n} exercise${n > 1 ? "s" : ""} pasted`);
        const refreshed = await getSessionWithWorkout(session.id);
        if (refreshed.success) setSession(refreshed.data);
        onWorkoutUpdated();
      } else {
        toast.error(result.error);
      }
      return;
    }

    if (clipboard.type === "workout") {
      toast.info("To paste a full workout day into the calendar, use the program builder");
    }
  }

  useBuilderKeyboard({
    onCopy: handleCopy,
    onPaste: handlePaste,
    onEscape: () => setSelection(DEFAULT_SELECTION),
  });

  // Reorder exercises
  async function handleDragEnd(event: DragEndEvent, blockIndex: number) {       
    if (!session) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const block = session.workout.blocks[blockIndex];
    const oldIndex = block.exercises.findIndex((ex) => ex.id === active.id);    
    const newIndex = block.exercises.findIndex((ex) => ex.id === over.id);      

    if (oldIndex !== -1 && newIndex !== -1) {
      const newExercises = arrayMove(block.exercises, oldIndex, newIndex);      

      // Update local state
      const updatedSession = { ...session };
      const blocks = [...updatedSession.workout.blocks];
      blocks[blockIndex] = { ...block, exercises: newExercises };
      updatedSession.workout = { ...updatedSession.workout, blocks };
      setSession(updatedSession);

      // Map to update objects
      const updates = newExercises.map((ex, index) => ({
        id: ex.id,
        orderIndex: index,
      }));

      // Await server update
      const result = await reorderBlockExercises(block.id, updates);
      if (!result.success) {
        toast.error(result.error);
        // Should revert state ideally, but a refresh could be forced if we wanted                                                                              
      } else {
        onWorkoutUpdated();
      }
    }
  }

  // Update a block field (name, rounds, restBetweenRounds)
  async function handleUpdateBlockField(
    blockIndex: number,
    blockId: string,
    data: { name?: string | null; rounds?: number; restBetweenRounds?: number | null }
  ) {
    const result = await updateBlock(blockId, data);
    if (result.success) {
      setSession((prev) => {
        if (!prev) return prev;
        const blocks = [...prev.workout.blocks];
        blocks[blockIndex] = {
          ...blocks[blockIndex],
          name: result.data.name,
          rounds: result.data.rounds,
          timeCap: result.data.timeCap,
          restBetweenRounds: result.data.restBetweenRounds,
        };
        return { ...prev, workout: { ...prev.workout, blocks } };
      });
    } else {
      toast.error(result.error);
    }
  }

  // Change block type
  async function handleChangeBlockType(blockIndex: number, newType: string) {
    if (!session) return;
    const blockId = session.workout.blocks[blockIndex].id;
    const result = await updateBlock(blockId, { type: newType });
    if (result.success) {
      setSession((prev) => {
        if (!prev) return prev;
        const blocks = [...prev.workout.blocks];
        blocks[blockIndex] = {
          ...blocks[blockIndex],
          type: result.data.type,
          rounds: result.data.rounds,
          timeCap: result.data.timeCap,
          restBetweenRounds: result.data.restBetweenRounds,
        };
        return { ...prev, workout: { ...prev.workout, blocks } };
      });
    } else {
      toast.error(result.error);
    }
  }

  // Delete session
  async function handleDeleteSession() {
    if (!session) return;
    setDeleting(true);
    try {
      const result = await deleteSession(session.id);
      if (result.success) {
        toast.success("Workout deleted");
        onWorkoutDeleted();
        onClose();
      } else {
        toast.error(result.error);
      }
    } finally {
      setDeleting(false);
    }
  }

  async function handleDuplicateWorkout() {
    if (!session || !duplicateDate) return;
    setDuplicating(true);
    try {
      const result = await duplicateWorkoutToDateAction(session.id, duplicateDate);
      if (result.success) {
        toast.success("Workout duplicated");
        setDuplicatePopoverOpen(false);
        setDuplicateDate("");
        onWorkoutUpdated();
      } else {
        toast.error(result.error);
      }
    } finally {
      setDuplicating(false);
    }
  }

  function handleOpenChange(open: boolean) {
    if (!open) onClose();
  }

  // ---------- Render ----------

  const dateLabel =
    panelState.mode === "creating"
      ? format(panelState.date, "EEEE, MMM d, yyyy")
      : session
        ? format(toLocalCalendarDate(session.scheduledDate), "EEEE, MMM d, yyyy")
        : "";

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogContent
          className="flex max-h-[92dvh] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl lg:max-w-5xl"
          showCloseButton={false}
        >
          {/* Header */}
          <DialogHeader className="shrink-0 border-b border-border px-4 py-4 sm:px-6">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <DialogTitle className="sr-only">
                  {panelState.mode === "creating" ? "Create Workout" : "Edit Workout"}
                </DialogTitle>
                {panelState.mode === "creating" && !session ? (
                  <Input
                    value={workoutName}
                    onChange={(e) => setWorkoutName(e.target.value)}
                    placeholder="Workout name..."
                    className="h-auto border-none px-0 text-heading shadow-none focus-visible:ring-0"                                                              
                  />
                ) : session ? (
                  <Input
                    value={workoutName}
                    onChange={(e) => {
                      setWorkoutName(e.target.value);
                      setNameChanged(true);
                    }}
                    onBlur={handleSaveName}
                    placeholder="Workout name..."
                    className="h-auto border-none px-0 text-heading shadow-none focus-visible:ring-0"                                                              
                  />
                ) : null}
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-body text-muted-foreground">                                                                  
                  <CalendarIcon className="size-3.5" aria-hidden />
                  <span>{dateLabel}</span>
                  {session && (
                    <StatusBadge status={session.status} size="sm" className="ml-2" />
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {session && (
                  <Popover open={duplicatePopoverOpen} onOpenChange={setDuplicatePopoverOpen}>
                    <PopoverTrigger
                      title="Duplicate workout to another date"
                      aria-label="Duplicate workout to another date"
                      className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                    >
                      <Copy className="h-4 w-4" />
                    </PopoverTrigger>
                    <PopoverContent align="end" className="flex w-72 flex-col gap-3 p-4">
                      <label htmlFor="duplicate-workout-date" className="text-label text-foreground">Duplicate workout to</label>
                      <Input
                        id="duplicate-workout-date"
                        type="date"
                        value={duplicateDate}
                        onChange={(e) => setDuplicateDate(e.target.value)}
                      />
                      <Button
                        size="sm"
                        className="w-full"
                        disabled={!duplicateDate || duplicating}
                        onClick={handleDuplicateWorkout}
                      >
                        {duplicating ? <Loader2 className="size-4 animate-spin" /> : null}
                        {duplicating ? "Duplicating..." : "Duplicate"}
                      </Button>
                    </PopoverContent>
                  </Popover>
                )}
                {session && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={handleDeleteSession}
                    disabled={deleting}
                    aria-label="Delete workout"
                    className="text-destructive hover:text-destructive"
                  >
                    {deleting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                )}
                <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
                  <X className="size-4" />
                </Button>
              </div>
            </div>
          </DialogHeader>

          {/* Body */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="flex flex-col gap-4 px-4 py-5 sm:px-6">
              {loading ? (
                <div className="flex items-center justify-center py-20">        
                  <Loader2 className="size-6 animate-spin text-muted-foreground" />                                                                            
                </div>
              ) : panelState.mode === "creating" && !session ? (
                /* Creating mode — choose manual or AI */
                <div className="flex flex-col gap-6 py-10">
                  <p className="text-center text-body text-muted-foreground">
                    How would you like to create a workout for {dateLabel}?
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    {/* Manual */}
                    <button
                      onClick={handleCreateWorkout}
                      disabled={saving || !workoutName.trim()}
                      className="group flex flex-col items-center gap-3 rounded-xl bg-surface p-4 text-left shadow-xs ring-1 ring-border outline-none transition-colors hover:bg-info-soft hover:ring-info-border focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none sm:p-6"
                    >
                      <div className="flex size-12 items-center justify-center rounded-full bg-info-soft text-info-foreground transition-colors group-hover:bg-info-border motion-reduce:transition-none">
                        {saving ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <Plus className="h-5 w-5" />
                        )}
                      </div>
                      <div className="text-center">
                        <p className="text-label text-foreground">Build manually</p>
                        <p className="mt-1 text-caption">
                          Pick exercises and build the session yourself
                        </p>
                      </div>
                    </button>

                    {/* AI Generate */}
                    <button
                      onClick={() => {
                        onClose();
                        onAiGenerateClick?.(
                          panelState.mode === "creating" ? panelState.date : new Date()
                        );
                      }}
                      className="group flex flex-col items-center gap-3 rounded-xl bg-surface p-4 text-left shadow-xs ring-1 ring-border outline-none transition-colors hover:bg-brand-soft hover:ring-brand-border focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none sm:p-6"
                    >
                      <div className="flex size-12 items-center justify-center rounded-full bg-brand-soft text-brand-foreground transition-colors group-hover:bg-brand-border motion-reduce:transition-none">
                        <Sparkles className="h-5 w-5" />
                      </div>
                      <div className="text-center">
                        <p className="text-label text-foreground">Generate with AI</p>
                        <p className="mt-1 text-caption">
                          Let AI build a full program for this client
                        </p>
                      </div>
                    </button>
                  </div>
                </div>
              ) : session ? (
                /* Edit mode - show blocks & exercises */
                <>
                  {session.status === "COMPLETED" && (session.overallRPE !== null || session.overallNotes) && (
                    <div className="rounded-lg border border-success-border bg-success-soft p-4 text-body text-success-foreground">
                      <div className="mb-1 flex items-center gap-2 text-label">
                        <CheckCircle className="size-4" aria-hidden />
                        Client Feedback
                      </div>
                      <div className="grid gap-1">
                        {session.overallRPE !== null && (
                          <div>
                            <span className="font-medium text-success-foreground">Overall RPE:</span> {session.overallRPE}/10
                          </div>
                        )}
                        {session.overallNotes && (
                          <div>
                            <span className="font-medium text-success-foreground">Notes:</span> {session.overallNotes}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {session.workout.blocks.map((block, blockIndex) => {
                    const typeConfig = getBlockTypeConfig(block.type);
                    const blockLetter = String.fromCharCode(65 + blockIndex); // A, B, C...
                    const isCircuit = block.type === "CIRCUIT" || block.type === "SUPERSET";
                    return (
                      <div
                        key={block.id}
                        className={cn(
                          "relative mb-2 rounded-lg transition-shadow motion-reduce:transition-none",
                          selection.level === "block" && selection.blockIndex === blockIndex
                            ? "ring-2 ring-info/40"
                            : "",
                          clipboard?.type === "exercises" &&
                          hoveredPasteTarget === `block-${blockIndex}`
                            ? "outline outline-2 outline-dashed outline-info"
                            : ""
                        )}
                        onMouseEnter={() => {
                          if (clipboard?.type === "exercises") setHoveredPasteTarget(`block-${blockIndex}`);
                        }}
                        onMouseLeave={() => setHoveredPasteTarget(null)}
                      >
                        {/* Block header */}
                        <div
                          className="mb-1 flex cursor-pointer items-center justify-between gap-2 border-b border-border pb-2"
                          onClick={(e) => {
                            const target = e.target as HTMLElement;
                            if (target.closest("input, button, [role='combobox']")) return;
                            setSelection({
                              level: "block",
                              blockIndex,
                              blockId: block.id,
                              exerciseIdxs: new Set(),
                            });
                          }}
                        >
                          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                            <Badge
                              variant="secondary"
                              className="rounded-sm px-1.5 py-0 text-caption font-semibold uppercase tracking-wide text-foreground"
                            >
                              {typeConfig.label}
                            </Badge>
                            <BlockNameInput
                              blockId={block.id}
                              initialName={block.name}
                              disabled={session.status === "COMPLETED"}
                              onSave={(name) => handleUpdateBlockField(blockIndex, block.id, { name })}
                            />
                            {isCircuit && (
                              <CircuitControls
                                blockIndex={blockIndex}
                                blockId={block.id}
                                rounds={block.rounds}
                                restBetweenRounds={block.restBetweenRounds}
                                disabled={session.status === "COMPLETED"}
                                onSave={handleUpdateBlockField}
                              />
                            )}
                          </div>
                          
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="px-2 text-muted-foreground hover:text-primary"
                              onClick={() => handleOpenPicker(block.id)}
                              aria-label="Add exercise"
                            >
                              <Plus className="size-3.5" />
                              <span className="hidden sm:inline">Add Exercise</span>
                            </Button>

                            <DropdownMenu>
                              <DropdownMenuTrigger aria-label="Block settings" className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"><Settings className="size-4" /></DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {BLOCK_TYPES.filter(
                                  (bt) => bt.value !== block.type
                                ).map((bt) => (
                                  <DropdownMenuItem
                                    key={bt.value}
                                    onClick={() =>
                                      handleChangeBlockType(blockIndex, bt.value) 
                                    }
                                  >
                                    Change to {bt.label}
                                  </DropdownMenuItem>
                                ))}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  variant="destructive"
                                  onClick={() => handleDeleteBlock(blockIndex)}
                                >
                                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                                  Delete Block
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>

                        {/* Exercises in block */}
                        <div className="mb-2 flex-1">
                          <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={(event) => handleDragEnd(event, blockIndex)}                                                                             
                          >
                            <SortableContext
                              items={block.exercises.map((ex) => ex.id)}        
                              strategy={verticalListSortingStrategy}
                            >
                              {block.exercises.map((exercise, exerciseIndex) => (                                                                               
                                <SortableExercise
                                  key={exercise.id}
                                  id={exercise.id}
                                  exercise={exercise}
                                  blockIndex={blockIndex}
                                  exerciseIndex={exerciseIndex}
                                  blockLetter={blockLetter}
                                  isCircuit={isCircuit}
                                  savingSetIds={savingSetIds}
                                  clientId={clientId}
                                  sessionStatus={session.status}
                                  exerciseLog={session.exerciseLogs?.find((l: any) => l.blockExerciseId === exercise.id)}
                                  onSetChange={handleSetChange}
                                  onSetUnitChange={handleSetUnitChange}
                                  onDeleteSet={handleDeleteSet}
                                  onDeleteExercise={handleDeleteExercise}
                                  onAddSet={handleAddSet}
                                  onUpdateNotes={handleUpdateExerciseNotes}
                                  isSelected={
                                    selection.level === "exercises" &&
                                    selection.blockIndex === blockIndex &&
                                    selection.exerciseIdxs.has(exerciseIndex)
                                  }
                                  onToggleSelect={(checked: boolean) =>
                                    handleExerciseCheck(blockIndex, block.id, exerciseIndex, checked)
                                  }
                                />
                              ))}
                            </SortableContext>
                          </DndContext>
                        </div>
                      </div>
                    );
                  })}

                  {/* Add block */}
                  {addingBlockType ? (
                      <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border-strong bg-surface-muted p-4">
                        <p className="text-label text-muted-foreground">Select block type</p>                                                                             
                        <div className="flex flex-wrap gap-2">
                          {BLOCK_TYPES.map((bt) => (
                            <Button
                              key={bt.value}
                              variant="outline"
                              size="sm"
                              onClick={() => handleAddBlock(bt.value)}
                            >
                              <span className={`size-2 rounded-full ${bt.color.split(' ')[0]}`} aria-hidden />
                              {bt.label}
                            </Button>
                          ))}
                          <div className="flex-1" />
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground hover:text-foreground"
                            onClick={() => setAddingBlockType(false)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        className="h-12 w-full border border-dashed border-border-strong text-muted-foreground hover:bg-surface-muted hover:text-primary"
                        onClick={() => setAddingBlockType(true)}
                      >
                        <Plus className="size-4" />
                        Add new block
                      </Button>
                    )}
                </>
              ) : null}
            </div>
          </div>

          {/* Footer */}
          {session && nameChanged && (
            <DialogFooter className="m-0 shrink-0 rounded-none border-t border-border bg-surface-muted px-4 py-3 sm:justify-end sm:px-6">
              <Button
                onClick={handleSaveName}
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : null}
                Save Name
              </Button>
            </DialogFooter>
          )}
          <DialogDescription className="sr-only">
            Workout editor for creating and editing workout sessions
          </DialogDescription>
        </DialogContent>
      </Dialog>

      {/* Exercise picker dialog */}
      <ExercisePickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        exercises={exerciseLibrary}
        organizationOrganizationId={organizationOrganizationId}
        exerciseSourcePreference={exerciseSourcePreference}
        onSelect={handleExerciseSelected}
      />
    </>
  );
}



