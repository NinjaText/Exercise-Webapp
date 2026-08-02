import {  getClientExerciseHistory } from "@/actions/exercise-history-actions";
import { cn } from "@/lib/utils";
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
  bodyRegion: string;
  difficultyLevel: string;
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
  { value: 'NORMAL', label: 'Normal', color: 'bg-gray-100 text-gray-700' },
  { value: 'WARMUP', label: 'Warmup', color: 'bg-green-100 text-green-700' },
  { value: 'COOLDOWN', label: 'Cooldown', color: 'bg-teal-100 text-teal-700' },
  { value: 'CIRCUIT', label: 'Circuit', color: 'bg-purple-100 text-purple-700' },
  { value: 'SUPERSET', label: 'Superset', color: 'bg-orange-100 text-orange-700' },
  { value: 'AMRAP', label: 'AMRAP', color: 'bg-red-100 text-red-700' },
  { value: 'EMOM', label: 'EMOM', color: 'bg-blue-100 text-blue-700' },
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
    return initialName ? <span className="text-sm font-medium">{initialName}</span> : null;
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
        className="h-6 text-sm px-2 py-0 w-36 shadow-none"
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="text-sm text-muted-foreground hover:text-foreground px-1 py-0.5 rounded hover:bg-muted transition-colors"
      title="Click to edit block name"
    >
      {initialName ?? <span className="italic text-muted-foreground/40 text-xs">Add name...</span>}
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
    <div className="flex items-center gap-3 ml-1">
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Sets</span>
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
          className="h-6 w-12 text-xs px-1.5 text-center shadow-none"
        />
      </div>
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Rest</span>
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
          className="h-6 w-14 text-xs px-1.5 text-center shadow-none"
        />
        <span className="text-[10px] text-muted-foreground">sec</span>
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
    <div ref={setNodeRef} style={style} className="py-2 border-b last:border-0 border-border group">                                                                   
      {/* Exercise header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3 flex-1">
          <input
            type="checkbox"
            className={cn(
              "h-4 w-4 shrink-0 rounded border-gray-300 cursor-pointer transition-opacity mt-1",
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
            <div className="flex items-center justify-center w-7 h-7 rounded-md bg-secondary text-secondary-foreground font-bold text-xs shrink-0 cursor-pointer" onClick={() => setExpanded(!expanded)}>
              {blockLetter}{exerciseIndex + 1}
            </div>

            <div className="flex flex-col flex-1 cursor-pointer min-w-0" onClick={() => setExpanded(!expanded)}>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm truncate">
                  {exercise.exercise.name}
                </span>
                {exercise.exercise.videoUrl && (
                  <span className="text-[10px] bg-secondary px-1.5 py-0.5 rounded-sm font-medium shrink-0">
                    Video
                  </span>
                )}
              </div>
              {(exercise.notes || isCircuit) && (
                <span className="text-xs text-muted-foreground line-clamp-1">
                   {isCircuit ? "Circuit/Superset" : ""} {exercise.notes && isCircuit ? " - " : ""}{exercise.notes}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground hover:text-foreground h-6 w-6"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
          
        <Button
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground hover:text-primary mr-1"
          onClick={loadHistory}
          title="View Exercise History"
        >
          <History className="h-3.5 w-3.5" />
        </Button>
{(!sessionStatus || sessionStatus !== "COMPLETED") && (
  <DropdownMenu>
    <DropdownMenuTrigger className="text-muted-foreground hover:text-foreground h-6 w-6 lg:opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center justify-center rounded-md hover:bg-muted">
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
      <div className="ml-[2.75rem] mt-3 pl-2 border-l-2 border-muted/50">
          {expanded && exercise.exercise.videoUrl && (
            <div className="mb-3 w-full max-w-[280px] aspect-video rounded-md overflow-hidden bg-black/10">
              <UniversalVideoPlayer
                url={exercise.exercise.videoUrl}
                provider={exercise.exercise.videoProvider}
              />
            </div>
          )}
          <div className="mb-3">
            <Input
              placeholder="Add coach notes..."
              className="text-xs h-7 bg-transparent border-dashed border-muted focus:border-solid hover:border-solid shadow-none px-2 disabled:opacity-70 disabled:cursor-default disabled:border-transparent"                                                                    
              value={exercise.notes || ""}
              onChange={(e) => onUpdateNotes(blockIndex, exerciseIndex, e.target.value)}
              disabled={sessionStatus === "COMPLETED"}
            />
          </div>

          <div className="space-y-1">
            {/* Minimal Set Headers */}
            {exercise.sets.length > 0 && (
              <div className="grid grid-cols-[1.5rem_1.5fr_1.5fr_1fr_1.5rem] gap-2 text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-1 mb-1">                                        
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
                className="grid grid-cols-[1.5rem_1.5fr_1.5fr_1fr_1.5rem] gap-2 items-center group/set border rounded-sm p-1 bg-background/50 hover:bg-accent/20 transition-colors"                                                                
              >
                <div className="text-xs font-medium text-muted-foreground text-center relative">                                                                               
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
                    className="h-6 text-xs px-1.5 shadow-none border-transparent hover:border-border focus:border-ring focus-visible:ring-1 disabled:opacity-50 disabled:cursor-not-allowed"
                    placeholder="Reps"
                    disabled={isCompleted}
                  />
                  <Input
                    type="number"
                    value={set.targetDuration ?? ""}
                    onChange={(e) => onSetChange(blockIndex, exerciseIndex, setIndex, "targetDuration", e.target.value)}                                              
                    className="h-6 text-[10px] px-1.5 text-muted-foreground bg-transparent shadow-none border-transparent hover:border-border focus:border-ring focus-visible:ring-1 disabled:opacity-50 disabled:cursor-not-allowed"
                    placeholder="Secs"
                    disabled={isCompleted}
                  />
                  {isCompleted && actualLog && (actualLog.actualReps != null || actualLog.actualDuration != null) && (
                     <div className="absolute -right-2 -top-2 flex gap-0.5 z-10" title="Actual Performance">
                       <Badge variant="outline" className="px-1 py-0 h-4 text-[9px] shadow-sm flex items-center gap-0.5">
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
                    className="h-6 text-xs px-1.5 shadow-none border-transparent hover:border-border focus:border-ring focus-visible:ring-1 disabled:opacity-50 disabled:cursor-not-allowed"
                    placeholder="Lbs/Kg"
                    disabled={isCompleted}
                  />
                  <Input
                    type="number"
                    value={set.targetPercentage1RM ?? ""}
                    onChange={(e) => onSetChange(blockIndex, exerciseIndex, setIndex, "targetPercentage1RM", e.target.value)}
                    className="h-6 text-[10px] px-1.5 text-muted-foreground bg-transparent shadow-none border-transparent hover:border-border focus:border-ring focus-visible:ring-1 disabled:opacity-50 disabled:cursor-not-allowed"
                    placeholder="% 1RM"
                    disabled={isCompleted}
                  />
                  {isCompleted && actualLog && actualLog.actualWeight != null && (
                     <div className="absolute -right-2 -top-2 flex gap-0.5 z-10" title="Actual Weight">
                       <Badge variant="outline" className="px-1 py-0 h-4 text-[9px] shadow-sm flex items-center gap-0.5">
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
                    className="h-6 text-xs px-1.5 shadow-none border-transparent hover:border-border focus:border-ring focus-visible:ring-1 disabled:opacity-50 disabled:cursor-not-allowed"
                    placeholder="Tempo"
                    disabled={isCompleted}
                  />
                  <Input
                    type="number"
                    value={set.restAfter ?? ""}
                    onChange={(e) => onSetChange(blockIndex, exerciseIndex, setIndex, "restAfter", e.target.value)}                                                   
                    className="h-6 text-[10px] px-1.5 text-muted-foreground bg-transparent shadow-none border-transparent hover:border-border focus:border-ring focus-visible:ring-1 disabled:opacity-50 disabled:cursor-not-allowed"
                    placeholder="Rest(s)"
                    disabled={isCompleted}
                  />
                </div>

                {/* Delete Set */}
                <div className="flex justify-center">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive h-6 w-6 opacity-0 group-hover/set:opacity-100 transition-opacity disabled:opacity-0"                                                                               
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
              className="text-muted-foreground mt-2 text-xs h-7 px-2 hover:bg-secondary"
              onClick={() => onAddSet(blockIndex, exerciseIndex)}
            >
              <Plus className="h-3 w-3 mr-1" />
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
        panelState.date.toISOString(),
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
      data: { targetReps?: number | null; targetWeight?: number | null; targetPercentage1RM?: number | null; targetDuration?: number | null; targetRPE?: number | null; tempo?: string | null; restAfter?: number | null; }
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
        ? format(new Date(session.scheduledDate), "EEEE, MMM d, yyyy")
        : "";

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogContent
          className="w-full sm:max-w-3xl lg:max-w-5xl max-h-[92vh] overflow-hidden flex flex-col p-0 gap-0"
          showCloseButton={false}
        >
          {/* Header */}
          <DialogHeader className="border-b px-6 py-4 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <DialogTitle className="sr-only">
                  {panelState.mode === "creating" ? "Create Workout" : "Edit Workout"}
                </DialogTitle>
                {panelState.mode === "creating" && !session ? (
                  <Input
                    value={workoutName}
                    onChange={(e) => setWorkoutName(e.target.value)}
                    placeholder="Workout name..."
                    className="text-lg font-semibold border-none px-0 focus-visible:ring-0 h-auto"                                                              
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
                    className="text-lg font-semibold border-none px-0 focus-visible:ring-0 h-auto"                                                              
                  />
                ) : null}
                <div className="flex items-center gap-1.5 mt-1 text-sm text-muted-foreground">                                                                  
                  <CalendarIcon className="h-3.5 w-3.5" />
                  <span>{dateLabel}</span>
                  {session && (
                    <Badge
                      variant="secondary"
                      className={`ml-2 text-xs ${
                        session.status === "COMPLETED"
                          ? "bg-green-100 text-green-700"
                          : session.status === "IN_PROGRESS"
                            ? "bg-amber-100 text-amber-700"
                            : session.status === "MISSED"
                              ? "bg-red-100 text-red-700"
                              : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {session.status}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 ml-2">
                {session && (
                  <Popover open={duplicatePopoverOpen} onOpenChange={setDuplicatePopoverOpen}>
                    <PopoverTrigger
                      title="Duplicate workout to another date"
                      className="inline-flex items-center justify-center rounded-md h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                    >
                      <Copy className="h-4 w-4" />
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-72 p-4 space-y-3">
                      <p className="text-sm font-medium">Duplicate workout to</p>
                      <input
                        type="date"
                        value={duplicateDate}
                        onChange={(e) => setDuplicateDate(e.target.value)}
                        className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                      <Button
                        size="sm"
                        className="w-full"
                        disabled={!duplicateDate || duplicating}
                        onClick={handleDuplicateWorkout}
                      >
                        {duplicating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
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
                    className="text-destructive hover:text-destructive"
                  >
                    {deleting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                )}
                <Button variant="ghost" size="icon-sm" onClick={onClose}>       
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </DialogHeader>

          {/* Body */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="px-6 py-5 space-y-4">
              {loading ? (
                <div className="flex items-center justify-center py-20">        
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />                                                                            
                </div>
              ) : panelState.mode === "creating" && !session ? (
                /* Creating mode — choose manual or AI */
                <div className="py-10 space-y-6">
                  <p className="text-center text-sm text-muted-foreground">
                    How would you like to create a workout for {dateLabel}?
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    {/* Manual */}
                    <button
                      onClick={handleCreateWorkout}
                      disabled={saving || !workoutName.trim()}
                      className="group flex flex-col items-center gap-3 rounded-xl border-2 border-border bg-background p-6 text-left transition-all hover:border-blue-400 hover:bg-blue-50/50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-blue-600 group-hover:bg-blue-200 transition-colors">
                        {saving ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <Plus className="h-5 w-5" />
                        )}
                      </div>
                      <div className="text-center">
                        <p className="font-semibold text-sm">Build Manually</p>
                        <p className="text-xs text-muted-foreground mt-1">
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
                      className="group flex flex-col items-center gap-3 rounded-xl border-2 border-border bg-background p-6 text-left transition-all hover:border-violet-400 hover:bg-violet-50/50"
                    >
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-100 text-violet-600 group-hover:bg-violet-200 transition-colors">
                        <Sparkles className="h-5 w-5" />
                      </div>
                      <div className="text-center">
                        <p className="font-semibold text-sm">Generate with AI</p>
                        <p className="text-xs text-muted-foreground mt-1">
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
                    <div className="bg-green-50 border border-green-200 rounded-md p-4 text-sm text-green-800 mb-6">
                      <div className="flex items-center gap-2 font-semibold mb-1">
                        <CheckCircle className="h-4 w-4" />
                        Client Feedback
                      </div>
                      <div className="grid gap-1">
                        {session.overallRPE !== null && (
                          <div>
                            <span className="font-medium text-green-900">Overall RPE:</span> {session.overallRPE}/10
                          </div>
                        )}
                        {session.overallNotes && (
                          <div>
                            <span className="font-medium text-green-900">Notes:</span> {session.overallNotes}
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
                          "mb-6 relative rounded-lg transition-shadow",
                          selection.level === "block" && selection.blockIndex === blockIndex
                            ? "ring-2 ring-blue-400"
                            : "",
                          clipboard?.type === "exercises" &&
                          hoveredPasteTarget === `block-${blockIndex}`
                            ? "outline outline-2 outline-dashed outline-blue-400"
                            : ""
                        )}
                        onMouseEnter={() => {
                          if (clipboard?.type === "exercises") setHoveredPasteTarget(`block-${blockIndex}`);
                        }}
                        onMouseLeave={() => setHoveredPasteTarget(null)}
                      >
                        {/* Block header */}
                        <div
                          className="flex items-center justify-between mb-2 pb-1 border-b border-muted cursor-pointer"
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
                          <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                            <Badge
                              variant="secondary"
                              className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0 rounded-sm"
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
                              className="h-7 text-xs text-muted-foreground hover:text-primary px-2"
                              onClick={() => handleOpenPicker(block.id)}
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              <span className="hidden sm:inline">Add Exercise</span>
                            </Button>

                            <DropdownMenu>
                              <DropdownMenuTrigger className="h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground"><Settings className="h-4 w-4" /></DropdownMenuTrigger>
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
                        <div className="divide-y border border-transparent flex-1 mb-2">
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
                      <div className="bg-muted/30 rounded-lg border border-dashed p-4 flex flex-col gap-3">       
                        <p className="text-sm font-medium text-muted-foreground">Select Block Type:</p>                                                                             
                        <div className="flex flex-wrap gap-2">
                          {BLOCK_TYPES.map((bt) => (
                            <Button
                              key={bt.value}
                              variant="outline"
                              size="sm"
                              className="h-8"
                              onClick={() => handleAddBlock(bt.value)}
                            >
                              <div className={`w-2 h-2 rounded-full mr-2 ${bt.color.split(' ')[0]}`} />
                              {bt.label}
                            </Button>
                          ))}
                          <div className="flex-1" />
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-muted-foreground hover:text-foreground"
                            onClick={() => setAddingBlockType(false)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        className="w-full border-dashed border-2 text-muted-foreground hover:text-primary hover:bg-primary/5 h-12"
                        onClick={() => setAddingBlockType(true)}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add New Block
                      </Button>
                    )}
                </>
              ) : null}
            </div>
          </div>

          {/* Footer */}
          {session && nameChanged && (
            <DialogFooter className="border-t px-6 py-3 m-0 bg-transparent rounded-none shrink-0 sm:justify-end">
              <Button
                onClick={handleSaveName}
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
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



