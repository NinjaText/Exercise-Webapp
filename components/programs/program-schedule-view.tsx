"use client";

import { useState, useEffect, useCallback, useMemo, useTransition, createContext, useContext } from "react";
import {
  Calendar,
  dateFnsLocalizer,
  Views,
  type View,
} from "react-big-calendar";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";
import {
  format,
  parse,
  startOfWeek,
  getDay,
  addDays,
} from "date-fns";
import { enUS } from "date-fns/locale";
import { toLocalCalendarDate, toUtcCalendarDate } from "@/lib/utils/calendar-date";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Info,
  Play,
  RotateCcw,
  Plus,
  Trash2,
  Loader2,
  Timer,
  Repeat,
  MoreHorizontal,
  Copy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { hasRealVideoUrl } from "@/lib/utils/video";
import { rescheduleSessionAction } from "@/actions/session-actions";
import {
  updateExercisePrescriptionAction,
  removeBlockExerciseAction,
  addExerciseToBlockAction,
  getExercisesForPickerAction,
  moveWorkoutAction,
} from "@/actions/workout-editor-actions";
import { ExercisePickerDialog } from "@/components/programs/exercise-picker-dialog";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  deleteSession,
  duplicateWorkoutToDateAction,
} from "@/actions/calendar-workout-actions";
import {
  deleteWorkoutFromProgramAction,
  duplicateWorkoutToDayAction,
} from "@/actions/program-workout-actions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VoiceMemoRecorder } from "@/components/voice-memo/VoiceMemoRecorder";
import { VoiceMemoPlayer } from "@/components/voice-memo/VoiceMemoPlayer";
import { getWorkoutVoiceMemos } from "@/actions/voice-memo-actions";
import type { VoiceMemoData } from "@/actions/voice-memo-actions";
import { Mic } from "lucide-react";

const SchedulePillCtx = createContext<{
  isTrainer: boolean;
  onRefresh: () => void;
  totalProgramWeeks: number;
}>({
  isTrainer: false,
  onRefresh: () => {},
  totalProgramWeeks: 1,
});

// ─── Localizer (Monday first) ─────────────────────────────────────────────────
const monLocale = {
  ...enUS,
  options: { ...enUS.options, weekStartsOn: 1 as const },
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (date: Date) => startOfWeek(date, { weekStartsOn: 1 }),
  getDay,
  locales: { "en-US": monLocale },
});

// ─── Internal types ────────────────────────────────────────────────────────────
interface ExerciseSet {
  id: string;
  orderIndex: number;
  setType: string;
  targetReps: number | null;
  targetDuration: number | null;
  targetDurationUnit: string | null;
  targetWeight: number | null;
}

interface ExerciseInfo {
  id: string;
  name: string;
  videoUrl?: string | null;
  videoProvider?: string | null;
  description?: string | null;
  musclesTargeted?: string[];
}

interface BlockExercise {
  id: string;
  orderIndex: number;
  notes?: string | null;
  restSeconds?: number | null;
  exercise: ExerciseInfo;
  sets: ExerciseSet[];
}

interface WorkoutBlock {
  id: string;
  name?: string | null;
  type: string;
  orderIndex: number;
  rounds: number;
  exercises: BlockExercise[];
}

interface WorkoutData {
  id: string;
  name: string;
  dayIndex: number;
  weekIndex: number;
  estimatedMinutes?: number | null;
  blocks: WorkoutBlock[];
}

interface SessionData {
  id: string;
  scheduledDate: string | Date;
  status: string;
  workout: WorkoutData;
}

interface ScheduleEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  isSession: boolean;
  status: string;
  workout: WorkoutData;
  sessionId?: string;
}

// Library exercise (matches `getExercisesForPickerAction` return shape)
interface LibraryExercise {
  id: string;
  name: string;
  bodyRegion: string[];
  difficultyLevel: string;
  exercisePhases: string[];
  defaultReps: number | null;
  defaultSets: number | null;
  defaultHoldSeconds: number | null;
  musclesTargeted: string[];
  description: string | null;
  videoUrl: string | null;
  videoProvider: string | null;
}

// Editable representation of a BlockExercise (panel-local working copy)
interface EditableExercise {
  id: string;           // BlockExerciseV2.id
  blockId: string;
  exercise: ExerciseInfo;
  setCount: number;
  isDuration: boolean;
  targetReps: number;
  targetDuration: number;
  targetWeight: number;
  notes: string;
  restSeconds: number;
  dirty: boolean;
}

interface EditableBlock {
  id: string;
  name: string | null;
  type: string;
  rounds: number;
  exercises: EditableExercise[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { dot: string; label: string }> = {
  SCHEDULED:   { dot: "#3b82f6", label: "Scheduled"   },
  IN_PROGRESS: { dot: "#f59e0b", label: "In Progress" },
  COMPLETED:   { dot: "#22c55e", label: "Completed"   },
  MISSED:      { dot: "#ef4444", label: "Missed"      },
  SKIPPED:     { dot: "#94a3b8", label: "Skipped"     },
  TEMPLATE:    { dot: "#94a3b8", label: "Planned"     },
};

const BLOCK_BADGE: Record<string, string> = {
  WARMUP:   "bg-muted text-muted-foreground border-border",
  COOLDOWN: "bg-muted text-muted-foreground border-border",
  CIRCUIT:  "bg-muted text-muted-foreground border-border",
  SUPERSET: "bg-muted text-muted-foreground border-border",
  AMRAP:    "bg-muted text-muted-foreground border-border",
  EMOM:     "bg-muted text-muted-foreground border-border",
  NORMAL:   "bg-muted text-muted-foreground border-border",
};

function castWorkout(raw: Record<string, unknown>): WorkoutData {
  const blocks = ((raw.blocks as Record<string, unknown>[]) || []).map((b) => ({
    id: b.id as string,
    name: b.name as string | null,
    type: (b.type as string) || "NORMAL",
    orderIndex: (b.orderIndex as number) || 0,
    rounds: (b.rounds as number) || 1,
    exercises: ((b.exercises as Record<string, unknown>[]) || []).map((be) => {
      const ex = (be.exercise as Record<string, unknown>) || {};
      return {
        id: be.id as string,
        orderIndex: (be.orderIndex as number) || 0,
        notes: be.notes as string | null,
        restSeconds: be.restSeconds as number | null,
        exercise: {
          id: ex.id as string,
          name: (ex.name as string) || "Exercise",
          videoUrl: ex.videoUrl as string | null,
          videoProvider: ex.videoProvider as string | null,
          description: ex.description as string | null,
          musclesTargeted: (ex.musclesTargeted as string[]) || [],
        },
        sets: ((be.sets as Record<string, unknown>[]) || []).map((s) => ({
          id: s.id as string,
          orderIndex: (s.orderIndex as number) || 0,
          setType: (s.setType as string) || "NORMAL",
          targetReps: s.targetReps as number | null,
          targetDuration: s.targetDuration as number | null,
          targetDurationUnit: (s.targetDurationUnit as string | null) ?? null,
          targetWeight: s.targetWeight as number | null,
        })),
      };
    }),
  }));
  return {
    id: raw.id as string,
    name: (raw.name as string) || "Workout",
    dayIndex: (raw.dayIndex as number) || 0,
    weekIndex: (raw.weekIndex as number) || 0,
    estimatedMinutes: raw.estimatedMinutes as number | null,
    blocks,
  };
}

function castSession(raw: Record<string, unknown>): SessionData {
  const workoutRaw = (raw.workout as Record<string, unknown>) || {};
  return {
    id: raw.id as string,
    scheduledDate: raw.scheduledDate as string | Date,
    status: (raw.status as string) || "SCHEDULED",
    workout: castWorkout(workoutRaw),
  };
}

function formatPrescription(sets: ExerciseSet[]): string {
  if (!sets.length) return "";
  const n = sets.length;
  const s = sets[0];
  if (s.targetDuration) {
    const weight = s.targetWeight ? ` @ ${s.targetWeight}lb` : "";
    return `${n} × ${s.targetDuration}${s.targetDurationUnit === "MIN" ? "min" : "s"}${weight}`;
  }
  if (s.targetReps) {
    const weight = s.targetWeight ? ` @ ${s.targetWeight}lb` : "";
    return `${n} × ${s.targetReps} reps${weight}`;
  }
  return `${n} set${n !== 1 ? "s" : ""}`;
}

function WorkoutVoiceMemoSection({
  workoutId,
  trainerName,
}: {
  workoutId: string
  trainerName: string
}) {
  const [trainerMemo, setTrainerMemo] = useState<VoiceMemoData | null | undefined>(undefined)
  const [open, setOpen] = useState(false)

  async function openAndLoad() {
    setOpen(true)
    if (trainerMemo === undefined) {
      const result = await getWorkoutVoiceMemos(workoutId)
      setTrainerMemo(result.data?.trainer ?? null)
    }
  }

  return (
    <div className="border-t border-border/40 px-3 py-2.5">
      {!open ? (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          onClick={openAndLoad}
        >
          <Mic className="h-3 w-3" />
          {trainerMemo ? "View voice note" : "Add voice note"}
        </Button>
      ) : (
        <div className="space-y-2">
          {trainerMemo && (
            <VoiceMemoPlayer memo={trainerMemo} authorName={trainerName} />
          )}
          <VoiceMemoRecorder
            workoutId={workoutId}
            role="TRAINER"
            onSuccess={(memo) => setTrainerMemo(memo)}
            existingMemo={trainerMemo ?? undefined}
          />
        </div>
      )}
    </div>
  )
}

/**
 * Convert a WorkoutData (server shape) into a panel-local EditableBlock[]
 * working copy. Each set list is collapsed to a single prescription summary
 * because the inline editor treats sets uniformly (advanced per-set editing
 * is handled in the dedicated set editor route).
 */
function initEditBlocks(workout: WorkoutData): EditableBlock[] {
  return workout.blocks.map((block) => ({
    id: block.id,
    name: block.name ?? null,
    type: block.type,
    rounds: block.rounds,
    exercises: block.exercises.map((be) => ({
      id: be.id,
      blockId: block.id,
      exercise: be.exercise,
      setCount: Math.max(1, be.sets.length || 1),
      isDuration: be.sets.some(
        (s) => s.targetDuration != null && s.targetDuration > 0
      ),
      targetReps: be.sets[0]?.targetReps ?? 10,
      targetDuration: be.sets[0]?.targetDuration ?? 30,
      targetWeight: be.sets[0]?.targetWeight ?? 0,
      notes: be.notes ?? "",
      restSeconds: be.restSeconds ?? 0,
      dirty: false,
    })),
  }));
}

// ─── Sub-components ────────────────────────────────────────────────────────────

const DnDCalendar = withDragAndDrop<ScheduleEvent>(Calendar);

function EventPill({ event }: { event: ScheduleEvent }) {
  const { isTrainer, onRefresh, totalProgramWeeks } = useContext(SchedulePillCtx);
  const cfg = STATUS_CONFIG[event.status] ?? STATUS_CONFIG.SCHEDULED;
  const exerciseCount = event.workout.blocks.reduce(
    (sum, b) => sum + b.exercises.length,
    0
  );
  const [dupeOpen, setDupeOpen] = useState(false);
  const [dupeDate, setDupeDate] = useState("");
  const [dupeLoading, setDupeLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [templateDupeOpen, setTemplateDupeOpen] = useState(false);
  const [templateWeek, setTemplateWeek] = useState(0);
  const [templateDay, setTemplateDay] = useState(0);
  const [templateDupeLoading, setTemplateDupeLoading] = useState(false);

  const showMenu = isTrainer && (event.isSession ? !!event.sessionId : true);

  async function handleDelete() {
    if (!event.sessionId || deleting) return;
    setDeleting(true);
    try {
      const result = await deleteSession(event.sessionId);
      if (result.success) {
        toast.success("Workout deleted");
        onRefresh();
      } else {
        toast.error(result.error ?? "Failed to delete");
      }
    } catch {
      toast.error("Failed to delete");
    } finally {
      setDeleting(false);
    }
  }

  async function handleDuplicate() {
    if (!event.sessionId || !dupeDate || dupeLoading) return;
    setDupeLoading(true);
    try {
      const result = await duplicateWorkoutToDateAction(event.sessionId, dupeDate);
      if (result.success) {
        toast.success("Workout duplicated");
        setDupeOpen(false);
        onRefresh();
      } else {
        toast.error(result.error ?? "Failed to duplicate");
      }
    } catch {
      toast.error("Failed to duplicate");
    } finally {
      setDupeLoading(false);
    }
  }

  async function handleTemplateDelete() {
    if (event.isSession || deleting) return;
    setDeleting(true);
    try {
      const result = await deleteWorkoutFromProgramAction(event.id);
      if (result.success) {
        toast.success("Workout deleted");
        onRefresh();
      } else {
        toast.error(result.error ?? "Failed to delete");
      }
    } catch {
      toast.error("Failed to delete");
    } finally {
      setDeleting(false);
    }
  }

  async function handleTemplateDuplicate() {
    if (event.isSession || templateDupeLoading) return;
    setTemplateDupeLoading(true);
    try {
      const result = await duplicateWorkoutToDayAction(event.id, templateWeek, templateDay);
      if (result.success) {
        toast.success("Workout duplicated");
        setTemplateDupeOpen(false);
        onRefresh();
      } else {
        toast.error(result.error ?? "Failed to duplicate");
      }
    } catch {
      toast.error("Failed to duplicate");
    } finally {
      setTemplateDupeLoading(false);
    }
  }

  return (
    <>
      <div className="h-full overflow-hidden rounded-[5px] border border-border/60 bg-card transition-opacity hover:opacity-90 cursor-pointer">
        <div className="px-2 py-1 flex items-start justify-between gap-1">
          <div className="flex items-start gap-1.5 flex-1 min-w-0">
            {cfg && (
              <span
                className="mt-[3px] shrink-0 h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: cfg.dot }}
              />
            )}
            <div className="min-w-0">
              <p className="truncate text-[11px] font-semibold leading-tight text-foreground">
                {event.title}
              </p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {exerciseCount} exercise{exerciseCount !== 1 ? "s" : ""}
                {event.isSession && ` · ${cfg?.label}`}
              </p>
            </div>
          </div>
          {showMenu && (
            <DropdownMenu>
              <DropdownMenuTrigger
                className="shrink-0 flex h-5 w-5 items-center justify-center rounded opacity-60 hover:opacity-100 hover:bg-black/10 transition-opacity"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-3 w-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-48"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                {event.isSession ? (
                  <>
                    <DropdownMenuItem onClick={() => setTimeout(() => setDupeOpen(true), 0)}>
                      <Copy className="mr-2 h-4 w-4" />
                      Duplicate to date
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      disabled={deleting}
                      onClick={handleDelete}
                    >
                      Delete
                    </DropdownMenuItem>
                  </>
                ) : (
                  <>
                    <DropdownMenuItem onClick={() => setTimeout(() => setTemplateDupeOpen(true), 0)}>
                      <Copy className="mr-2 h-4 w-4" />
                      Duplicate to week/day
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      disabled={deleting}
                      onClick={handleTemplateDelete}
                    >
                      Delete
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <Dialog open={dupeOpen} onOpenChange={(open) => { setDupeOpen(open); if (!open) setDupeDate(""); }}>
        <DialogContent
          className="sm:max-w-sm"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle>Duplicate Workout</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <p className="text-sm text-muted-foreground">
              Choose a date to copy <strong>{event.title}</strong> to.
            </p>
            <Input
              type="date"
              value={dupeDate}
              onChange={(e) => setDupeDate(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDupeOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleDuplicate}
              disabled={!dupeDate || dupeLoading}
            >
              {dupeLoading ? "Duplicating…" : "Duplicate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={templateDupeOpen}
        onOpenChange={(open) => {
          setTemplateDupeOpen(open);
          if (!open) { setTemplateWeek(0); setTemplateDay(0); }
        }}
      >
        <DialogContent
          className="sm:max-w-sm"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle>Duplicate Workout</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Choose a week and day to copy <strong>{event.title}</strong> to.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Week</p>
                <Select
                  value={String(templateWeek)}
                  onValueChange={(v) => setTemplateWeek(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue>Week {templateWeek + 1}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: Math.max(1, totalProgramWeeks) }, (_, i) => (
                      <SelectItem key={i} value={String(i)}>
                        Week {i + 1}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Day</p>
                <Select
                  value={String(templateDay)}
                  onValueChange={(v) => setTemplateDay(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue>
                      {["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"][templateDay]}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"].map(
                      (label, idx) => (
                        <SelectItem key={idx} value={String(idx)}>
                          {label}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateDupeOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleTemplateDuplicate} disabled={templateDupeLoading}>
              {templateDupeLoading ? "Duplicating…" : "Duplicate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Calendar toolbar. In structural mode it shows the program-week indicator
 * and pill buttons for quick week jumping. In session mode it shows the
 * date range, like a standard calendar.
 */
function CalToolbar({
  date,
  view,
  onNavigate,
  onView,
  isStructural,
  currentProgramWeek,
  totalProgramWeeks,
  onJumpToWeek,
}: {
  date: Date;
  view: View;
  onNavigate: (action: "PREV" | "NEXT" | "TODAY") => void;
  onView: (view: View) => void;
  isStructural: boolean;
  currentProgramWeek: number;
  totalProgramWeeks: number;
  onJumpToWeek: (weekIndex: number) => void;
}) {
  const weekStart = startOfWeek(date, { weekStartsOn: 1 });
  const weekEnd = addDays(weekStart, 6);
  const sessionTitle =
    view === Views.WEEK
      ? `${format(weekStart, "MMM d")} – ${format(weekEnd, "MMM d, yyyy")}`
      : view === Views.DAY
      ? format(date, "EEEE, MMM d, yyyy")
      : format(date, "MMMM yyyy");

  // Cap pill count to keep toolbar usable; longer programs scroll horizontally
  const weekPills = Array.from({ length: totalProgramWeeks });

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <div className="flex items-center overflow-hidden rounded-lg border border-border bg-muted/40">
        <button
          onClick={() => onNavigate("PREV")}
          className="flex h-8 w-8 items-center justify-center border-r border-border text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
          aria-label="Previous"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => onNavigate("TODAY")}
          className="h-8 px-3 text-xs font-medium text-foreground transition-colors hover:bg-background"
        >
          Today
        </button>
        <button
          onClick={() => onNavigate("NEXT")}
          className="flex h-8 w-8 items-center justify-center border-l border-border text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
          aria-label="Next"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {isStructural ? (
        <div className="flex flex-1 min-w-0 flex-wrap items-center gap-3">
          <h2 className="text-sm font-bold tracking-tight sm:text-base whitespace-nowrap">
            Program Week {currentProgramWeek + 1} of {totalProgramWeeks}
          </h2>
          <div className="flex items-center gap-1 overflow-x-auto max-w-full">
            {weekPills.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onJumpToWeek(i)}
                className={cn(
                  "h-7 min-w-9 rounded-md border px-2 text-[11px] font-medium transition-colors",
                  i === currentProgramWeek
                    ? "bg-foreground text-background border-foreground"
                    : "bg-background text-muted-foreground border-border hover:border-foreground/40 hover:text-foreground"
                )}
              >
                W{i + 1}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <h2 className="flex-1 text-base font-bold tracking-tight sm:text-lg">
          {sessionTitle}
        </h2>
      )}

      <div className="flex items-center overflow-hidden rounded-lg border border-border bg-muted/40 p-0.5">
        {([Views.MONTH, Views.WEEK, Views.DAY] as View[]).map((v) => (
          <button
            key={v}
            onClick={() => onView(v)}
            className={cn(
              "h-7 rounded-md px-3 text-xs font-medium transition-all",
              view === v
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {v === Views.MONTH ? "Month" : v === Views.WEEK ? "Week" : "Day"}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Read-only side panel shown to clients / non-trainers. Mirrors the
 * legacy detail view layout from the previous version of this file.
 */
function ReadOnlyPanel({
  event,
  onClose,
}: {
  event: ScheduleEvent;
  onClose: () => void;
}) {
  const { workout, isSession, status } = event;
  const totalExercises = workout.blocks.reduce(
    (s, b) => s + b.exercises.length,
    0
  );
  const statusCfg = isSession
    ? (STATUS_CONFIG[status] ?? STATUS_CONFIG.SCHEDULED)
    : null;

  return (
    <>
      <div className="border-b px-4 py-3">
        <p className="font-semibold text-sm leading-snug">{workout.name}</p>
        <div className="flex flex-wrap items-center gap-2 mt-1">
          {workout.estimatedMinutes && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              ~{workout.estimatedMinutes} min
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            {totalExercises} exercise{totalExercises !== 1 ? "s" : ""}
          </span>
          {statusCfg && (
            <span className="inline-flex items-center gap-1 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: statusCfg.dot }} />
              {statusCfg.label}
            </span>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1 max-h-[60vh]">
        <div className="p-3 space-y-4">
          {workout.blocks.map((block) => (
            <div key={block.id}>
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {block.name || block.type}
                </span>
                {block.type !== "NORMAL" && (
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[9px] px-1 py-0 h-4",
                      BLOCK_BADGE[block.type] ?? BLOCK_BADGE.NORMAL
                    )}
                  >
                    {block.type}
                  </Badge>
                )}
                {block.rounds > 1 && (
                  <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                    <RotateCcw className="h-2.5 w-2.5" />
                    {block.rounds}×
                  </span>
                )}
              </div>

              <div className="space-y-1.5">
                {block.exercises.map((be, idx) => (
                  <div
                    key={be.id}
                    className="rounded-lg border bg-muted/30 p-2.5"
                  >
                    <div className="flex items-start gap-1.5">
                      <span className="mt-0.5 text-[10px] text-muted-foreground w-4 shrink-0 text-right">
                        {idx + 1}.
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className="text-xs font-medium leading-snug">
                            {be.exercise.name}
                          </span>
                          {hasRealVideoUrl(be.exercise.videoUrl) && (
                            <span className="inline-flex items-center gap-0.5 text-[9px] bg-blue-50 text-blue-600 border border-blue-200 px-1 py-0 rounded-sm font-medium">
                              <Play className="h-2 w-2" />
                              Video
                            </span>
                          )}
                        </div>
                        {be.sets.length > 0 && (
                          <p className="text-[11px] font-medium text-foreground/80 mt-0.5">
                            {formatPrescription(be.sets)}
                          </p>
                        )}
                        {be.notes && (
                          <p className="mt-0.5 text-[10px] text-muted-foreground italic leading-snug">
                            {be.notes}
                          </p>
                        )}
                        {be.exercise.musclesTargeted?.length ? (
                          <p className="mt-0.5 text-[10px] text-muted-foreground leading-tight">
                            {be.exercise.musclesTargeted.slice(0, 3).join(", ")}
                            {be.exercise.musclesTargeted.length > 3 ? "…" : ""}
                          </p>
                        ) : null}
                        {be.restSeconds ? (
                          <p className="mt-0.5 text-[10px] text-muted-foreground">
                            Rest {be.restSeconds}s
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </>
  );
}

// ─── Edit panel (trainer inline edit)────────────────────────────────────────

interface EditPanelProps {
  event: ScheduleEvent;
  editBlocks: EditableBlock[];
  isDirty: boolean;
  saving: boolean;
  pickerLoadingBlockId: string | null;
  removingId: string | null;
  trainerName: string;
  onClose: () => void;
  onUpdateField: (
    blockId: string,
    exId: string,
    field: keyof EditableExercise,
    value: unknown
  ) => void;
  onRemoveExercise: (blockExerciseId: string) => Promise<void>;
  onOpenPicker: (blockId: string) => Promise<void>;
  onSave: () => Promise<void>;
  onCancel: () => void;
}

function EditPanel({
  event,
  editBlocks,
  isDirty,
  saving,
  pickerLoadingBlockId,
  removingId,
  trainerName,
  onClose,
  onUpdateField,
  onRemoveExercise,
  onOpenPicker,
  onSave,
  onCancel,
}: EditPanelProps) {
  const { workout, isSession, status } = event;
  const totalExercises = editBlocks.reduce(
    (s, b) => s + b.exercises.length,
    0
  );
  const statusCfg = isSession
    ? (STATUS_CONFIG[status] ?? STATUS_CONFIG.SCHEDULED)
    : null;

  return (
    <>
      {/* Header */}
      <div className="border-b px-4 py-3 shrink-0">
        <p className="font-semibold text-sm leading-snug truncate">
          {workout.name}
        </p>
        <div className="flex flex-wrap items-center gap-2 mt-1">
          {workout.estimatedMinutes && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              ~{workout.estimatedMinutes} min
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            {totalExercises} exercise{totalExercises !== 1 ? "s" : ""}
          </span>
          {statusCfg && (
            <span className="inline-flex items-center gap-1 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: statusCfg.dot }} />
              {statusCfg.label}
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-5">
        {editBlocks.map((block) => (
          <div key={block.id}>
            {/* Block header */}
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {block.name || block.type}
              </span>
              {block.type !== "NORMAL" && (
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[9px] px-1 py-0 h-4",
                    BLOCK_BADGE[block.type] ?? BLOCK_BADGE.NORMAL
                  )}
                >
                  {block.type}
                </Badge>
              )}
              {block.rounds > 1 && (
                <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                  <RotateCcw className="h-2.5 w-2.5" />
                  {block.rounds}×
                </span>
              )}
            </div>

            {/* Exercise rows */}
            <div className="space-y-2">
              {block.exercises.map((ex, idx) => (
                <ExerciseEditRow
                  key={ex.id}
                  index={idx + 1}
                  blockId={block.id}
                  exercise={ex}
                  removing={removingId === ex.id}
                  onUpdateField={onUpdateField}
                  onRemove={onRemoveExercise}
                />
              ))}
            </div>

            {/* Add exercise CTA */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2 w-full h-8 text-xs"
              onClick={() => onOpenPicker(block.id)}
              disabled={pickerLoadingBlockId === block.id}
            >
              {pickerLoadingBlockId === block.id ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
              ) : (
                <Plus className="h-3 w-3 mr-1.5" />
              )}
              Add Exercise to {block.name || block.type}
            </Button>
          </div>
        ))}

        {editBlocks.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6">
            This workout has no blocks.
          </p>
        )}

        <WorkoutVoiceMemoSection
          workoutId={event.workout.id}
          trainerName={trainerName}
        />
      </div>

      {/* Sticky footer */}
      <div className="border-t px-4 py-3 flex justify-between gap-2 shrink-0">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={saving || !isDirty}
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={onSave}
          disabled={saving || !isDirty}
          className={cn(isDirty && "ring-2 ring-primary/30")}
        >
          {saving && <Loader2 className="h-3 w-3 animate-spin mr-1.5" />}
          Save Changes{isDirty ? " ●" : ""}
        </Button>
      </div>
    </>
  );
}

/**
 * Single editable exercise row inside the EditPanel. Pure presentational —
 * all state lives in the parent so the panel can do one batched save.
 */
function ExerciseEditRow({
  index,
  blockId,
  exercise,
  removing,
  onUpdateField,
  onRemove,
}: {
  index: number;
  blockId: string;
  exercise: EditableExercise;
  removing: boolean;
  onUpdateField: (
    blockId: string,
    exId: string,
    field: keyof EditableExercise,
    value: unknown
  ) => void;
  onRemove: (blockExerciseId: string) => Promise<void>;
}) {
  const numberFieldClass = "h-7 w-14 text-sm text-center px-1";

  return (
    <div
      className={cn(
        "rounded-lg border bg-muted/30 p-2.5 transition-colors",
        exercise.dirty && "border-primary/40 bg-primary/5"
      )}
    >
      {/* Title row */}
      <div className="flex items-start gap-1.5">
        <span className="mt-0.5 text-[10px] text-muted-foreground w-4 shrink-0 text-right">
          {index}.
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-xs font-medium leading-snug">
              {exercise.exercise.name}
            </span>
            {hasRealVideoUrl(exercise.exercise.videoUrl) && (
              <span className="inline-flex items-center gap-0.5 text-[9px] bg-blue-50 text-blue-600 border border-blue-200 px-1 py-0 rounded-sm font-medium">
                <Play className="h-2 w-2" />
                Video
              </span>
            )}
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
          onClick={() => onRemove(exercise.id)}
          disabled={removing}
          aria-label="Remove exercise"
        >
          {removing ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Trash2 className="h-3 w-3" />
          )}
        </Button>
      </div>

      {/* Sets × Reps/Duration */}
      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
        <label className="text-[10px] font-medium text-muted-foreground">
          Sets
        </label>
        <Input
          type="number"
          min={1}
          max={20}
          value={exercise.setCount}
          onChange={(e) =>
            onUpdateField(
              blockId,
              exercise.id,
              "setCount",
              Math.max(1, Math.min(20, parseInt(e.target.value || "1", 10)))
            )
          }
          className={numberFieldClass}
        />
        <span className="text-[10px] text-muted-foreground">×</span>
        {exercise.isDuration ? (
          <>
            <Input
              type="number"
              min={1}
              value={exercise.targetDuration}
              onChange={(e) =>
                onUpdateField(
                  blockId,
                  exercise.id,
                  "targetDuration",
                  Math.max(1, parseInt(e.target.value || "1", 10))
                )
              }
              className={numberFieldClass}
            />
            <span className="text-[10px] text-muted-foreground">sec</span>
          </>
        ) : (
          <>
            <Input
              type="number"
              min={1}
              value={exercise.targetReps}
              onChange={(e) =>
                onUpdateField(
                  blockId,
                  exercise.id,
                  "targetReps",
                  Math.max(1, parseInt(e.target.value || "1", 10))
                )
              }
              className={numberFieldClass}
            />
            <span className="text-[10px] text-muted-foreground">reps</span>
          </>
        )}
        <button
          type="button"
          onClick={() =>
            onUpdateField(
              blockId,
              exercise.id,
              "isDuration",
              !exercise.isDuration
            )
          }
          className="ml-auto inline-flex items-center gap-1 rounded-md border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
          aria-label="Toggle reps / seconds"
        >
          {exercise.isDuration ? (
            <>
              <Timer className="h-2.5 w-2.5" /> sec
            </>
          ) : (
            <>
              <Repeat className="h-2.5 w-2.5" /> reps
            </>
          )}
        </button>
      </div>

      {/* Weight (optional) */}
      <div className="mt-1.5 flex items-center gap-1.5">
        <label className="text-[10px] font-medium text-muted-foreground w-10">
          Weight
        </label>
        <Input
          type="number"
          min={0}
          value={exercise.targetWeight || ""}
          placeholder="—"
          onChange={(e) =>
            onUpdateField(
              blockId,
              exercise.id,
              "targetWeight",
              parseFloat(e.target.value || "0") || 0
            )
          }
          className={numberFieldClass}
        />
        <span className="text-[10px] text-muted-foreground">lbs</span>
        <label className="text-[10px] font-medium text-muted-foreground ml-2">
          Rest
        </label>
        <Input
          type="number"
          min={0}
          value={exercise.restSeconds || ""}
          placeholder="—"
          onChange={(e) =>
            onUpdateField(
              blockId,
              exercise.id,
              "restSeconds",
              parseInt(e.target.value || "0", 10) || 0
            )
          }
          className={numberFieldClass}
        />
        <span className="text-[10px] text-muted-foreground">s</span>
      </div>

      {/* Notes */}
      <Textarea
        value={exercise.notes}
        onChange={(e) =>
          onUpdateField(blockId, exercise.id, "notes", e.target.value)
        }
        placeholder="Notes (optional)"
        className="mt-1.5 min-h-7 text-xs resize-none"
        rows={1}
      />
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

interface Props {
  rawWorkouts: Record<string, unknown>[];
  rawSessions: Record<string, unknown>[];
  isTrainer: boolean;
  trainerName: string;
}

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function ProgramScheduleView({
  rawWorkouts,
  rawSessions,
  isTrainer,
  trainerName,
}: Props) {
  const router = useRouter();

  // Memoize derived workout/session arrays so dependent useMemos stay stable
  const workouts = useMemo(
    () => rawWorkouts.map(castWorkout),
    [rawWorkouts]
  );
  const sessions = useMemo(
    () => rawSessions.map(castSession),
    [rawSessions]
  );
  const hasSessions = sessions.length > 0;

  // Anchor: always this week's Monday. Structural events are placed at
  // refMonday + weekIndex*7 + dayIndex, which keeps Week 1 of the program
  // visually "this week" no matter when the user opens the program.
  // Computed once per mount so the anchor stays stable across re-renders.
  const refMonday = useMemo(() => startOfWeek(new Date(), { weekStartsOn: 1 }), []);

  const totalProgramWeeks = useMemo(
    () => Math.max(...workouts.map((w) => w.weekIndex), 0) + 1,
    [workouts]
  );

  // ── Calendar state ───────────────────────────────────────────────────────
  const [view, setView] = useState<View>(Views.WEEK);
  const [calDate, setCalDate] = useState<Date>(() =>
    hasSessions && sessions.length > 0
      ? toLocalCalendarDate(sessions[0].scheduledDate)
      : refMonday
  );

  // Week/Month grids are unreadable at phone widths — default to Day view there.
  // Runs once on mount so it doesn't fight a view the user picks afterward.
  useEffect(() => {
    if (window.matchMedia("(max-width: 640px)").matches) {
      setView(Views.DAY);
    }
  }, []);

  // Optimistic overrides for drag-and-drop — applied instantly, reverted on error
  const [workoutPositionOverrides, setWorkoutPositionOverrides] = useState<
    Map<string, { dayIndex: number; weekIndex: number }>
  >(new Map());
  const [sessionDateOverrides, setSessionDateOverrides] = useState<
    Map<string, Date>
  >(new Map());

  // ── Selection / edit-panel state ─────────────────────────────────────────
  const [selectedEvent, setSelectedEvent] = useState<ScheduleEvent | null>(
    null
  );
  const [editBlocks, setEditBlocks] = useState<EditableBlock[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // ── Picker state ─────────────────────────────────────────────────────────
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerBlockId, setPickerBlockId] = useState<string | null>(null);
  const [pickerLoadingBlockId, setPickerLoadingBlockId] = useState<
    string | null
  >(null);
  const [exerciseLibrary, setExerciseLibrary] = useState<LibraryExercise[]>([]);

  // Currently-viewed program week index (0-based), clamped to program length.
  const currentProgramWeek = useMemo(() => {
    const viewedMonday = startOfWeek(calDate, { weekStartsOn: 1 });
    const diff = Math.round(
      (viewedMonday.getTime() - refMonday.getTime()) / ONE_WEEK_MS
    );
    return Math.max(0, Math.min(diff, totalProgramWeeks - 1));
  }, [calDate, refMonday, totalProgramWeeks]);

  // ── Build events (with optimistic overrides applied) ─────────────────────
  const events = useMemo<ScheduleEvent[]>(() => {
    if (hasSessions) {
      return sessions.map((s) => {
        const overrideDate = sessionDateOverrides.get(s.id);
        const rawStart = overrideDate ?? toLocalCalendarDate(s.scheduledDate);
        // If the session has no meaningful time (midnight), show at 9 AM
        const start = new Date(rawStart);
        if (start.getHours() === 0 && start.getMinutes() === 0) {
          start.setHours(9, 0, 0, 0);
        }
        return {
          id: s.id,
          title: s.workout.name,
          start,
          end: new Date(start.getTime() + 60 * 60 * 1000),
          isSession: true,
          status: s.status,
          workout: s.workout,
          sessionId: s.id,
        };
      });
    }
    // Structural mode: allDay events — shown in the day-header strip, not buried at midnight
    return workouts.map((w) => {
      const override = workoutPositionOverrides.get(w.id);
      const dayIdx = override ? override.dayIndex : w.dayIndex;
      const weekIdx = override ? override.weekIndex : w.weekIndex;
      const date = addDays(refMonday, weekIdx * 7 + dayIdx);
      return {
        id: w.id,
        title: w.name,
        start: date,
        end: date,
        allDay: true,
        isSession: false,
        status: "TEMPLATE",
        workout: w,
      };
    });
  }, [hasSessions, sessions, workouts, refMonday, workoutPositionOverrides, sessionDateOverrides]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleEventDrop = useCallback(
    async ({
      event,
      start,
    }: {
      event: ScheduleEvent;
      start: string | Date;
    }) => {
      if (!isTrainer) return;

      const droppedDate = new Date(start);

      if (hasSessions && event.sessionId) {
        const sessionId = event.sessionId;
        const foundDate = sessions.find((s) => s.id === sessionId)?.scheduledDate;
        const prevDate = foundDate ? toLocalCalendarDate(foundDate) : droppedDate;

        // Optimistic: show new date immediately
        setSessionDateOverrides((prev) =>
          new Map(prev).set(sessionId, droppedDate)
        );

        const result = await rescheduleSessionAction(
          sessionId,
          toUtcCalendarDate(droppedDate).toISOString()
        );
        if (result.success) {
          toast.success("Session rescheduled");
          startTransition(() => router.refresh());
        } else {
          // Revert on failure
          setSessionDateOverrides((prev) =>
            new Map(prev).set(sessionId, prevDate)
          );
          toast.error(result.error ?? "Failed to reschedule");
        }
      } else {
        // Structural mode: 0=Sun..6=Sat → convert to 0=Mon..6=Sun
        const jsDay = getDay(droppedDate);
        const newDayIndex = jsDay === 0 ? 6 : jsDay - 1;
        const droppedMonday = startOfWeek(droppedDate, { weekStartsOn: 1 });
        const newWeekIndex = Math.max(
          0,
          Math.round(
            (droppedMonday.getTime() - refMonday.getTime()) / ONE_WEEK_MS
          )
        );
        const workoutId = event.workout.id;
        const prevPos = workoutPositionOverrides.get(workoutId) ?? {
          dayIndex: event.workout.dayIndex,
          weekIndex: event.workout.weekIndex,
        };

        // Optimistic: move event on screen immediately
        setWorkoutPositionOverrides((prev) =>
          new Map(prev).set(workoutId, { dayIndex: newDayIndex, weekIndex: newWeekIndex })
        );

        const result = await moveWorkoutAction(workoutId, newDayIndex, newWeekIndex);
        if (result.success) {
          toast.success("Workout moved");
          startTransition(() => router.refresh());
        } else {
          // Revert on failure
          setWorkoutPositionOverrides((prev) =>
            new Map(prev).set(workoutId, prevPos)
          );
          toast.error(result.error ?? "Failed to move workout");
        }
      }
    },
    [hasSessions, isTrainer, refMonday, sessions, workoutPositionOverrides, router]
  );

  const handleSelectEvent = useCallback((event: ScheduleEvent) => {
    setSelectedEvent(event);
    setEditBlocks(initEditBlocks(event.workout));
    setIsDirty(false);
  }, []);

  const handleClose = useCallback(() => {
    if (isDirty) {
      const ok = window.confirm("Discard unsaved changes?");
      if (!ok) return;
    }
    setSelectedEvent(null);
    setEditBlocks([]);
    setIsDirty(false);
  }, [isDirty]);

  const handleCancel = useCallback(() => {
    if (!selectedEvent) return;
    setEditBlocks(initEditBlocks(selectedEvent.workout));
    setIsDirty(false);
  }, [selectedEvent]);

  const handleUpdateField = useCallback(
    (
      blockId: string,
      exerciseId: string,
      field: keyof EditableExercise,
      value: unknown
    ) => {
      setEditBlocks((prev) =>
        prev.map((b) =>
          b.id !== blockId
            ? b
            : {
                ...b,
                exercises: b.exercises.map((e) =>
                  e.id !== exerciseId
                    ? e
                    : { ...e, [field]: value, dirty: true }
                ),
              }
        )
      );
      setIsDirty(true);
    },
    []
  );

  const handleSave = useCallback(async () => {
    if (!isDirty || saving) return;
    setSaving(true);

    // Collect every dirty row across all blocks
    const dirtyRows: { block: EditableBlock; ex: EditableExercise }[] = [];
    for (const b of editBlocks) {
      for (const e of b.exercises) {
        if (e.dirty) dirtyRows.push({ block: b, ex: e });
      }
    }

    try {
      const results = await Promise.all(
        dirtyRows.map(({ ex }) =>
          updateExercisePrescriptionAction(ex.id, {
            setCount: ex.setCount,
            targetReps: ex.isDuration ? null : ex.targetReps,
            targetDuration: ex.isDuration ? ex.targetDuration : null,
            targetWeight: ex.targetWeight > 0 ? ex.targetWeight : null,
            notes: ex.notes.trim() ? ex.notes.trim() : null,
            restSeconds: ex.restSeconds > 0 ? ex.restSeconds : null,
          })
        )
      );

      const failed = results.filter((r) => !r.success);
      if (failed.length) {
        toast.error(
          `Saved ${results.length - failed.length}/${results.length} changes — ${failed.length} failed`
        );
      } else {
        toast.success(
          `Saved ${results.length} change${results.length !== 1 ? "s" : ""}`
        );
      }

      // Clear dirty flags locally; server is the new source of truth after refresh
      setEditBlocks((prev) =>
        prev.map((b) => ({
          ...b,
          exercises: b.exercises.map((e) => ({ ...e, dirty: false })),
        }))
      );
      setIsDirty(false);
      startTransition(() => router.refresh());
    } catch (err) {
      console.error("[program-schedule-view] save failed", err);
      toast.error("Failed to save changes");
    } finally {
      setSaving(false);
    }
  }, [editBlocks, isDirty, saving, router]);

  const handleRemoveExercise = useCallback(
    async (blockExerciseId: string) => {
      if (removingId) return;
      setRemovingId(blockExerciseId);
      try {
        const res = await removeBlockExerciseAction(blockExerciseId);
        if (!res.success) {
          toast.error(res.error ?? "Failed to remove exercise");
          return;
        }
        setEditBlocks((prev) =>
          prev.map((b) => ({
            ...b,
            exercises: b.exercises.filter((e) => e.id !== blockExerciseId),
          }))
        );
        toast.success("Exercise removed");
        startTransition(() => router.refresh());
      } catch (err) {
        console.error("[program-schedule-view] remove failed", err);
        toast.error("Failed to remove exercise");
      } finally {
        setRemovingId(null);
      }
    },
    [removingId, router]
  );

  const ensureLibraryLoaded = useCallback(async () => {
    if (exerciseLibrary.length > 0) return true;
    const res = await getExercisesForPickerAction();
    if (!res.success) {
      toast.error(res.error ?? "Failed to load exercises");
      return false;
    }
    setExerciseLibrary(res.data as LibraryExercise[]);
    return true;
  }, [exerciseLibrary.length]);

  const handleOpenPicker = useCallback(
    async (blockId: string) => {
      setPickerLoadingBlockId(blockId);
      try {
        const ok = await ensureLibraryLoaded();
        if (!ok) return;
        setPickerBlockId(blockId);
        setPickerOpen(true);
      } finally {
        setPickerLoadingBlockId(null);
      }
    },
    [ensureLibraryLoaded]
  );

  const handleAddExercise = useCallback(
    async (picked: { id: string }) => {
      if (!pickerBlockId) return;
      // The dialog's internal Exercise type is narrower than LibraryExercise,
      // so re-resolve the full record from our cached library by id to access
      // defaults like defaultSets / defaultHoldSeconds.
      const exercise = exerciseLibrary.find((e) => e.id === picked.id);
      if (!exercise) {
        toast.error("Exercise not found in library");
        return;
      }
      setPickerOpen(false);

      // Choose initial prescription based on the exercise's defaults so the
      // newly-added row already has reasonable values the trainer can tune.
      const isDuration =
        (exercise.defaultHoldSeconds ?? 0) > 0 &&
        (exercise.defaultReps ?? 0) === 0;
      const setCount = exercise.defaultSets ?? 3;
      const targetReps = isDuration ? null : (exercise.defaultReps ?? 10);
      const targetDuration = isDuration
        ? (exercise.defaultHoldSeconds ?? 30)
        : null;

      const res = await addExerciseToBlockAction(pickerBlockId, exercise.id, {
        setCount,
        targetReps,
        targetDuration,
      });

      if (!res.success) {
        toast.error(res.error ?? "Failed to add exercise");
        return;
      }

      // Optimistically append to local edit state so the user sees the new row
      // immediately without waiting for the server round-trip.
      setEditBlocks((prev) =>
        prev.map((b) =>
          b.id !== pickerBlockId
            ? b
            : {
                ...b,
                exercises: [
                  ...b.exercises,
                  {
                    id: res.blockExerciseId!,
                    blockId: pickerBlockId,
                    exercise: {
                      id: exercise.id,
                      name: exercise.name,
                      videoUrl: exercise.videoUrl,
                      videoProvider: exercise.videoProvider,
                      description: exercise.description,
                      musclesTargeted: exercise.musclesTargeted,
                    },
                    setCount,
                    isDuration,
                    targetReps: targetReps ?? 10,
                    targetDuration: targetDuration ?? 30,
                    targetWeight: 0,
                    notes: "",
                    restSeconds: 0,
                    dirty: false,
                  },
                ],
              }
        )
      );
      toast.success(`Added ${exercise.name}`);
      startTransition(() => router.refresh());
    },
    [pickerBlockId, exerciseLibrary, router]
  );

  const handleJumpToWeek = useCallback(
    (weekIndex: number) => {
      setCalDate(addDays(refMonday, weekIndex * 7));
    },
    [refMonday]
  );

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <SchedulePillCtx.Provider
      value={{ isTrainer, onRefresh: () => startTransition(() => router.refresh()), totalProgramWeeks }}
    >
    <div className="space-y-4">
      {/* Template mode banner */}
      {!hasSessions && (
        <div className="flex items-start gap-2 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-800">
          <Info className="h-4 w-4 mt-0.5 shrink-0 text-violet-500" />
          <span>
            <strong>Program structure view</strong> — workouts are shown at
            their scheduled day positions starting this week.{" "}
            {isTrainer
              ? "Drag workouts to move them to a different day or week. Assign this program to a client to place sessions on real calendar dates."
              : "Assign this program to a client to place sessions on real calendar dates."}
          </span>
        </div>
      )}

      {/* Status legend (session mode) */}
      {hasSessions && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {Object.entries(STATUS_CONFIG)
            .filter(([k]) => k !== "TEMPLATE")
            .map(([key, c]) => (
              <div key={key} className="flex items-center gap-1.5">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: c.dot }}
                />
                <span className="text-xs text-muted-foreground">{c.label}</span>
              </div>
            ))}
          {isTrainer && (
            <span className="text-xs text-muted-foreground ml-auto">
              Drag sessions to reschedule
            </span>
          )}
        </div>
      )}

      {/* Calendar */}
      <div className="overflow-x-auto">
        <div className={cn(view === Views.DAY ? "min-w-full" : "min-w-[640px]")}>
        <DnDCalendar
          localizer={localizer}
          events={events}
          view={view}
          date={calDate}
          onView={setView}
          onNavigate={setCalDate}
          onSelectEvent={(event: ScheduleEvent) => handleSelectEvent(event)}
          onEventDrop={isTrainer ? (handleEventDrop as never) : undefined}
          draggableAccessor={() => isTrainer}
          resizable={false}
          popup
          style={{ height: 580 }}
          components={{
            event: EventPill,
            toolbar: (props) => (
              <CalToolbar
                date={props.date as Date}
                view={props.view as View}
                onNavigate={props.onNavigate}
                onView={props.onView}
                isStructural={!hasSessions}
                currentProgramWeek={currentProgramWeek}
                totalProgramWeeks={totalProgramWeeks}
                onJumpToWeek={handleJumpToWeek}
              />
            ),
          }}
          eventPropGetter={() => ({
            style: {
              padding: 0,
              backgroundColor: "transparent",
              border: "none",
              borderRadius: "5px",
            },
          })}
          tooltipAccessor={(event: ScheduleEvent) => {
            const count = event.workout.blocks.reduce(
              (s, b) => s + b.exercises.length,
              0
            );
            return `${event.title} · ${count} exercises`;
          }}
        />
        </div>
      </div>

      {/* Workout detail modal */}
      <Dialog
        open={selectedEvent !== null}
        onOpenChange={(open) => { if (!open) handleClose(); }}
      >
        <DialogContent className="sm:max-w-lg max-h-[85dvh] p-0 flex flex-col overflow-hidden gap-0">
          {selectedEvent && isTrainer && (
            <EditPanel
              event={selectedEvent}
              editBlocks={editBlocks}
              isDirty={isDirty}
              saving={saving}
              pickerLoadingBlockId={pickerLoadingBlockId}
              removingId={removingId}
              trainerName={trainerName}
              onClose={handleClose}
              onUpdateField={handleUpdateField}
              onRemoveExercise={handleRemoveExercise}
              onOpenPicker={handleOpenPicker}
              onSave={handleSave}
              onCancel={handleCancel}
            />
          )}
          {selectedEvent && !isTrainer && (
            <ReadOnlyPanel event={selectedEvent} onClose={handleClose} />
          )}
        </DialogContent>
      </Dialog>

      <ExercisePickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        exercises={exerciseLibrary}
        onSelect={handleAddExercise}
      />
    </div>
    </SchedulePillCtx.Provider>
  );
}
