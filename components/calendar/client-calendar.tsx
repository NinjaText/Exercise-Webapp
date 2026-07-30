"use client";

import { useState, useEffect, useCallback, useMemo, createContext, useContext } from "react";
import {
  Calendar,
  dateFnsLocalizer,
  Views,
  type View,
} from "react-big-calendar";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";
import {
  format,
  parse,
  startOfWeek,
  endOfWeek,
  getDay,
} from "date-fns";
import { enUS } from "date-fns/locale";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Dumbbell, ChevronLeft, ChevronRight, Sparkles, MoreHorizontal, Copy } from "lucide-react";
import { rescheduleSessionAction } from "@/actions/session-actions";
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
  createAdHocWorkout,
  deleteSession,
  duplicateWorkoutToDateAction,
} from "@/actions/calendar-workout-actions";
import { WorkoutEditorPanel } from "@/components/calendar/workout-editor-panel";
import { AssignProgramDialog } from "@/components/calendar/assign-program-dialog";
import { AiGenerateProgramDialog } from "@/components/calendar/ai-generate-program-dialog";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useClipboard } from "@/lib/clipboard-context";

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------
const CalendarPillCtx = createContext<{ onRefresh: () => void }>({
  onRefresh: () => {},
});

// ---------------------------------------------------------------------------
// Localizer
// ---------------------------------------------------------------------------
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales: { "en-US": enUS },
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type ExerciseSummary = {
  id: string;
  name: string;
  bodyRegion: string;
  difficultyLevel: string;
  defaultReps?: number | null;
  musclesTargeted?: string[];
  imageUrl?: string | null;
  source?: string | null;
  organizationId?: string | null;
  isPublic?: boolean;
};

type SessionSummary = {
  id: string;
  scheduledDate: Date | string;
  status: string;
  workout: {
    id: string;
    name: string;
    blocks: { exercises: { id: string }[] }[];
  };
};

interface SessionEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  status: string;
  exerciseCount: number;
  workoutName: string;
  resource: SessionSummary;
  allDay?: boolean;
}

type PanelState =
  | { mode: "closed" }
  | { mode: "creating"; date: Date }
  | { mode: "editing"; sessionId: string };

interface ClientCalendarProps {
  clientId: string;
  trainerId: string;
  initialSessions: SessionSummary[];
  exerciseLibrary: ExerciseSummary[];
  organizationOrganizationId?: string;
}

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------
const statusConfig: Record<string, { dot: string; label: string }> = {
  SCHEDULED:   { dot: "#3b82f6", label: "Scheduled"   },
  IN_PROGRESS: { dot: "#f59e0b", label: "In Progress" },
  COMPLETED:   { dot: "#22c55e", label: "Completed"   },
  MISSED:      { dot: "#ef4444", label: "Missed"      },
  SKIPPED:     { dot: "#94a3b8", label: "Skipped"     },
};

// ---------------------------------------------------------------------------
// DnD Calendar instance
// ---------------------------------------------------------------------------
const DnDCalendar = withDragAndDrop<SessionEvent>(Calendar);

// ---------------------------------------------------------------------------
// Event pill component
// ---------------------------------------------------------------------------
function EventComponent({ event }: { event: SessionEvent }) {
  const { onRefresh } = useContext(CalendarPillCtx);
  const dotColor = (statusConfig[event.status] ?? statusConfig.SCHEDULED).dot;
  const [dupeOpen, setDupeOpen] = useState(false);
  const [dupeDate, setDupeDate] = useState("");
  const [dupeLoading, setDupeLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (deleting) return;
    setDeleting(true);
    try {
      const result = await deleteSession(event.id);
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
    if (!dupeDate || dupeLoading) return;
    setDupeLoading(true);
    try {
      const result = await duplicateWorkoutToDateAction(event.id, dupeDate);
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

  return (
    <>
      <div className="h-full overflow-hidden rounded-[5px] border border-border/60 bg-card transition-opacity hover:opacity-90">
        <div className="px-2 py-1 flex items-start justify-between gap-1">
          <div className="flex items-start gap-1.5 flex-1 min-w-0">
            <span
              className="mt-[3px] shrink-0 h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: dotColor }}
            />
            <div className="min-w-0">
              <p className="truncate text-[11px] font-semibold leading-tight text-foreground">
                {event.workoutName}
              </p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {event.exerciseCount} ex
              </p>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger
              className="shrink-0 flex h-5 w-5 items-center justify-center rounded opacity-60 hover:opacity-100 hover:bg-muted transition-opacity"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="h-3 w-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-44"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <DropdownMenuItem onClick={() => setDupeOpen(true)}>
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
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Dialog
        open={dupeOpen}
        onOpenChange={(open) => { setDupeOpen(open); if (!open) setDupeDate(""); }}
      >
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
              Choose a date to copy <strong>{event.workoutName}</strong> to.
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
    </>
  );
}

// ---------------------------------------------------------------------------
// Custom toolbar
// ---------------------------------------------------------------------------
function CustomToolbar({
  date,
  view,
  onNavigate,
  onView,
  onCreateClick,
  onAiGenerateClick,
}: {
  date: Date;
  view: View;
  onNavigate: (action: "PREV" | "NEXT" | "TODAY") => void;
  onView: (view: View) => void;
  onCreateClick: () => void;
  onAiGenerateClick: () => void;
}) {
  const title =
    view === Views.WEEK
      ? `${format(startOfWeek(date), "MMM d")} – ${format(endOfWeek(date), "MMM d, yyyy")}`
      : view === Views.DAY
      ? format(date, "EEEE, MMM d, yyyy")
      : format(date, "MMMM yyyy");

  return (
    <div className="mb-5 flex flex-wrap items-center gap-3">
      {/* Navigation */}
      <div className="flex items-center overflow-hidden rounded-lg border border-border bg-muted/40">
        <button
          onClick={() => onNavigate("PREV")}
          className="flex h-8 w-8 items-center justify-center border-r border-border text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
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
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Title */}
      <h2 className="flex-1 text-base font-bold tracking-tight sm:text-lg">
        {title}
      </h2>

      {/* View toggle */}
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

      {/* Generate with AI */}
      <Button
        size="sm"
        className="h-8 gap-1.5"
        onClick={onAiGenerateClick}
      >
        <Sparkles className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Generate with AI</span>
        <span className="sm:hidden">AI</span>
      </Button>

      {/* Create workout manually */}
      <Button
        size="sm"
        className="h-8 gap-1.5"
        onClick={onCreateClick}
      >
        <Plus className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Create Workout</span>
        <span className="sm:hidden">Create</span>
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function ClientCalendar({
  clientId,
  trainerId,
  initialSessions,
  exerciseLibrary,
  organizationOrganizationId,
}: ClientCalendarProps) {
  const router = useRouter();
  const { clipboard } = useClipboard();
  const [view, setView] = useState<View>(Views.MONTH);
  const [date, setDate] = useState(new Date());
  const [panelState, setPanelState] = useState<PanelState>({ mode: "closed" });
  const [aiDialogDate, setAiDialogDate] = useState<Date | null>(null);

  // Month/Week grids are unreadable at phone widths — default to Day view there.
  // Runs once on mount so it doesn't fight a view the user picks afterward.
  useEffect(() => {
    if (window.matchMedia("(max-width: 640px)").matches) {
      setView(Views.DAY);
    }
  }, []);

  // Build calendar events
  const events: SessionEvent[] = useMemo(
    () =>
      initialSessions.map((s) => {
        const exerciseCount = s.workout.blocks.reduce(
          (acc, b) => acc + b.exercises.length,
          0
        );
        const start = new Date(s.scheduledDate);
        return {
          id: s.id,
          title: s.workout.name,
          start,
          end: new Date(start.getTime() + 60 * 60 * 1000),
          status: s.status,
          exerciseCount,
          workoutName: s.workout.name,
          resource: s,
          allDay: true,
        };
      }),
    [initialSessions]
  );

  const handleSelectSlot = useCallback(
    ({ start }: { start: Date }) => {
      // When clipboard has block/exercise content, ignore empty-slot clicks so
      // an accidental miss on a workout chip doesn't open the create dialog.
      if (clipboard?.type === "block" || clipboard?.type === "exercises") return;
      setPanelState({ mode: "creating", date: start });
    },
    [clipboard]
  );

  const handleSelectEvent = useCallback(
    (event: SessionEvent) => setPanelState({ mode: "editing", sessionId: event.id }),
    []
  );

  const handleEventDrop = useCallback(
    async ({ event, start }: { event: SessionEvent; start: string | Date }) => {
      const result = await rescheduleSessionAction(
        event.id,
        new Date(start).toISOString()
      );
      if (result.success) {
        toast.success("Session rescheduled");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    },
    [router]
  );

  const handlePanelClose = useCallback(() => setPanelState({ mode: "closed" }), []);
  const handleRefresh = useCallback(() => router.refresh(), [router]);
  const handleCreateClick = useCallback(
    () => setPanelState({ mode: "creating", date: new Date() }),
    []
  );
  const handleAiGenerateClick = useCallback(
    () => setAiDialogDate(new Date()),
    []
  );
  const handleAiGenerateFromDate = useCallback((date: Date) => {
    setPanelState({ mode: "closed" });
    setAiDialogDate(date);
  }, []);

  return (
    <CalendarPillCtx.Provider value={{ onRefresh: handleRefresh }}>
    <div className="space-y-4">
      {/* Top bar: legend + assign program */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Status legend */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {Object.entries(statusConfig).map(([key, c]) => (
            <div key={key} className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: c.dot }}
              />
              <span className="text-xs text-muted-foreground">{c.label}</span>
            </div>
          ))}
        </div>

        <AssignProgramDialog clientId={clientId} onSuccess={handleRefresh}>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 font-medium">
            <Dumbbell className="h-3.5 w-3.5" />
            Assign Program
          </Button>
        </AssignProgramDialog>
      </div>

      {/* Calendar */}
      <div className="min-h-160 overflow-x-auto">
        <div className={cn(view === Views.DAY ? "min-w-full" : "min-w-[640px]")}>
        <DnDCalendar
          localizer={localizer}
          events={events}
          view={view}
          date={date}
          onView={setView}
          onNavigate={setDate}
          onSelectSlot={handleSelectSlot}
          onSelectEvent={handleSelectEvent}
          onEventDrop={handleEventDrop as never}
          selectable
          resizable={false}
          draggableAccessor={() => true}
          popup
          style={{ height: 640 }}
          components={{
            event: EventComponent,
            toolbar: (props) => (
              <CustomToolbar
                date={props.date as Date}
                view={props.view as View}
                onNavigate={props.onNavigate}
                onView={props.onView}
                onCreateClick={handleCreateClick}
                onAiGenerateClick={handleAiGenerateClick}
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
        />
        </div>
      </div>

      {/* Workout editor side panel */}
      <WorkoutEditorPanel
        panelState={panelState}
        onClose={handlePanelClose}
        exerciseLibrary={exerciseLibrary}
        organizationOrganizationId={organizationOrganizationId}
        clientId={clientId}
        onWorkoutCreated={handleRefresh}
        onWorkoutDeleted={handleRefresh}
        onWorkoutUpdated={handleRefresh}
        createAdHocWorkoutAction={createAdHocWorkout}
        onAiGenerateClick={handleAiGenerateFromDate}
      />

      {/* AI generate program dialog */}
      {aiDialogDate && (
        <AiGenerateProgramDialog
          open={aiDialogDate !== null}
          onOpenChange={(open) => { if (!open) setAiDialogDate(null); }}
          clientId={clientId}
          initialDate={aiDialogDate}
          onSuccess={handleRefresh}
        />
      )}
    </div>
    </CalendarPillCtx.Provider>
  );
}
