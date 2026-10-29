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
  addMonths,
  subMonths,
  isSameDay,
  isToday,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isBefore,
  isSameMonth,
  startOfDay,
} from "date-fns";
import { enUS } from "date-fns/locale";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, ChevronLeft, ChevronRight, MoreHorizontal, Copy, Play } from "lucide-react";
import { rescheduleSessionAction } from "@/actions/session-actions";
import { toLocalCalendarDate, toUtcCalendarDate } from "@/lib/utils/calendar-date";
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
import type { ExerciseSourcePreference } from "@/lib/utils/exercise-picker";
import { isVideoWorkout, formatDuration } from "@/lib/utils/follow-along";
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
  bodyRegion: string[];
  difficultyLevel: string | null;
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
    /** Follow-along video day (zero blocks) — the card shows the video length instead of "0 ex". */
    videoUrl?: string | null;
    videoDurationSec?: number | null;
    program: { trainerId: string | null };
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
  exerciseSourcePreference?: ExerciseSourcePreference;
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
// Event actions — the ⋯ menu (duplicate / delete) shared by the grid pill and
// the phone agenda row
// ---------------------------------------------------------------------------
function EventActions({
  event,
  triggerClassName,
  iconClassName,
}: {
  event: SessionEvent;
  triggerClassName: string;
  iconClassName: string;
}) {
  const { onRefresh } = useContext(CalendarPillCtx);
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
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Actions for ${event.workoutName}`}
          className={triggerClassName}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className={iconClassName} />
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

/** Workout length line: video duration for follow-along days, else "N ex". */
function EventMeta({ event, iconClassName }: { event: SessionEvent; iconClassName: string }) {
  return isVideoWorkout(event.resource.workout) ? (
    <>
      <Play className={cn("shrink-0 fill-current", iconClassName)} aria-hidden />
      {formatDuration(event.resource.workout.videoDurationSec) ?? "Video"}
    </>
  ) : (
    <>{event.exerciseCount} ex</>
  );
}

// ---------------------------------------------------------------------------
// Event pill component (Month / Week / Day grid)
// ---------------------------------------------------------------------------
function EventComponent({ event }: { event: SessionEvent }) {
  const dotColor = (statusConfig[event.status] ?? statusConfig.SCHEDULED).dot;

  return (
    <div className="h-full overflow-hidden rounded-md border border-border bg-card shadow-xs transition-colors hover:border-border-strong motion-reduce:transition-none">
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
            <p className="mt-0.5 flex items-center gap-0.5 text-[10px] text-muted-foreground">
              <EventMeta event={event} iconClassName="h-2.5 w-2.5" />
            </p>
          </div>
        </div>
        <EventActions
          event={event}
          triggerClassName="shrink-0 flex h-5 w-5 items-center justify-center rounded opacity-60 hover:opacity-100 hover:bg-muted transition-opacity"
          iconClassName="h-3 w-3"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phone agenda — a Month/Week grid is unusable at phone width, so phones get
// the month as a day list instead: every day keeps a + to schedule on it
// (what tapping an empty grid cell does), workouts open the editor on tap and
// ⋯ for duplicate / delete. Drag-to-reschedule stays a tablet/desktop
// affordance; "Duplicate to date" covers moving a workout here.
// ---------------------------------------------------------------------------
function PhoneAgenda({
  events,
  date,
  onNavigate,
  onCreateClick,
  onCreateOnDay,
  onSelectEvent,
}: {
  events: SessionEvent[];
  date: Date;
  onNavigate: (date: Date) => void;
  onCreateClick: () => void;
  onCreateOnDay: (day: Date) => void;
  onSelectEvent: (event: SessionEvent) => void;
}) {
  const days = useMemo(
    () =>
      eachDayOfInterval({ start: startOfMonth(date), end: endOfMonth(date) }).map((day) => ({
        day,
        events: events.filter((e) => isSameDay(e.start, day)),
      })),
    [events, date]
  );

  // In the current month the list opens at today: earlier days fold behind a
  // toggle so the trainer isn't scrolling past weeks of history first.
  const [showEarlier, setShowEarlier] = useState(false);
  const [lastMonth, setLastMonth] = useState(date.getMonth());
  if (lastMonth !== date.getMonth()) {
    setLastMonth(date.getMonth());
    setShowEarlier(false);
  }
  const today = startOfDay(new Date());
  const earlierCount = isSameMonth(date, today) ? days.filter(({ day }) => isBefore(day, today)).length : 0;
  const visibleDays = showEarlier || earlierCount === 0 ? days : days.filter(({ day }) => !isBefore(day, today));

  const navButton =
    "flex size-10 items-center justify-center text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="w-full text-heading text-foreground">{format(date, "MMMM yyyy")}</h2>
        <div className="flex items-center overflow-hidden rounded-md border border-input bg-surface shadow-xs">
          <button
            type="button"
            onClick={() => onNavigate(subMonths(date, 1))}
            aria-label="Previous month"
            className={cn(navButton, "border-r border-border")}
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => onNavigate(new Date())}
            className="h-10 px-3 text-label text-foreground transition-colors hover:bg-surface-muted outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => onNavigate(addMonths(date, 1))}
            aria-label="Next month"
            className={cn(navButton, "border-l border-border")}
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
        <Button variant="outline" className="ml-auto h-10" onClick={onCreateClick}>
          <Plus />
          Create
        </Button>
      </div>

      {earlierCount > 0 && (
        <Button variant="ghost" className="h-10 w-full text-muted-foreground" onClick={() => setShowEarlier((v) => !v)}>
          {showEarlier ? "Hide earlier days" : `Show ${earlierCount} earlier ${earlierCount === 1 ? "day" : "days"}`}
        </Button>
      )}

      <ol className="space-y-1">
        {visibleDays.map(({ day, events: dayEvents }) => (
          <li key={day.toISOString()} className={cn(dayEvents.length > 0 && "pb-2")}>
            <div className="flex items-center gap-2">
              <p
                className={cn(
                  "min-w-0 flex-1 truncate text-label",
                  isToday(day) ? "text-primary" : dayEvents.length > 0 ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {format(day, "EEE, MMM d")}
                {isToday(day) && " · Today"}
              </p>
              <button
                type="button"
                onClick={() => onCreateOnDay(day)}
                aria-label={`Create workout on ${format(day, "EEEE, MMMM d")}`}
                className="flex size-10 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
              >
                <Plus className="size-4" />
              </button>
            </div>
            {dayEvents.length > 0 && (
              <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
                {dayEvents.map((event) => {
                  const status = statusConfig[event.status] ?? statusConfig.SCHEDULED;
                  return (
                    <li key={event.id} className="flex items-center">
                      <button
                        type="button"
                        onClick={() => onSelectEvent(event)}
                        className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-4 py-2.5 text-left outline-none transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none"
                      >
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{ backgroundColor: status.dot }}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-body font-medium text-foreground">
                            {event.workoutName}
                          </span>
                          <span className="flex items-center gap-1 text-caption">
                            {status.label} ·
                            <EventMeta event={event} iconClassName="size-3" />
                          </span>
                        </span>
                      </button>
                      <EventActions
                        event={event}
                        triggerClassName="mr-1 flex size-10 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-surface-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                        iconClassName="size-4"
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </div>
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
}: {
  date: Date;
  view: View;
  onNavigate: (action: "PREV" | "NEXT" | "TODAY") => void;
  onView: (view: View) => void;
  onCreateClick: () => void;
}) {
  const title =
    view === Views.WEEK
      ? `${format(startOfWeek(date), "MMM d")} – ${format(endOfWeek(date), "MMM d, yyyy")}`
      : view === Views.DAY
      ? format(date, "EEEE, MMM d, yyyy")
      : format(date, "MMMM yyyy");

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      {/* Navigation */}
      <div className="flex items-center overflow-hidden rounded-md border border-input bg-surface shadow-xs">
        <button
          type="button"
          onClick={() => onNavigate("PREV")}
          aria-label="Previous"
          className="flex size-8 items-center justify-center border-r border-border text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onNavigate("TODAY")}
          className="h-8 px-3 text-label text-foreground transition-colors hover:bg-surface-muted outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none"
        >
          Today
        </button>
        <button
          type="button"
          onClick={() => onNavigate("NEXT")}
          aria-label="Next"
          className="flex size-8 items-center justify-center border-l border-border text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Title */}
      <h2 className="order-first w-full basis-full text-heading text-foreground sm:order-none sm:w-auto sm:flex-1 sm:basis-auto">
        {title}
      </h2>

      {/* View toggle — Month/Week grids need real width to be usable, so they're
          desktop/tablet-only. Phones normally get the agenda list instead of
          this toolbar; Day is the fallback if the grid ever renders narrow. */}
      <div role="group" aria-label="Calendar view" className="flex items-center overflow-hidden rounded-md bg-surface-muted p-0.5 ring-1 ring-border">
        {([Views.MONTH, Views.WEEK, Views.DAY] as View[]).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onView(v)}
            aria-pressed={view === v}
            className={cn(
              "h-7 items-center rounded-[calc(var(--radius-md)-2px)] px-3 text-label outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
              v !== Views.DAY ? "hidden sm:inline-flex" : "inline-flex",
              view === v
                ? "bg-surface text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {v === Views.MONTH ? "Month" : v === Views.WEEK ? "Week" : "Day"}
          </button>
        ))}
      </div>

      {/* Create workout manually */}
      <Button
        variant="outline"
        size="sm"
        onClick={onCreateClick}
      >
        <Plus />
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
  exerciseSourcePreference,
}: ClientCalendarProps) {
  const router = useRouter();
  const { clipboard } = useClipboard();
  const [view, setView] = useState<View>(Views.MONTH);
  const [date, setDate] = useState(new Date());
  const [panelState, setPanelState] = useState<PanelState>({ mode: "closed" });
  const [aiDialogDate, setAiDialogDate] = useState<Date | null>(null);

  // Month/Week grids are unreadable at phone widths — phones get the agenda
  // list instead (tracked live so rotating a tablet swaps cleanly).
  const [isPhone, setIsPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    // Reading the viewport is only possible after mount (SSR has no window).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsPhone(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsPhone(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Build calendar events
  const events: SessionEvent[] = useMemo(
    () =>
      initialSessions.map((s) => {
        const exerciseCount = s.workout.blocks.reduce(
          (acc, b) => acc + b.exercises.length,
          0
        );
        const start = toLocalCalendarDate(s.scheduledDate);
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
      if (event.resource.workout.program.trainerId !== trainerId) {
        toast.error("You can only reschedule sessions in your own programs.");
        return;
      }
      const result = await rescheduleSessionAction(
        event.id,
        toUtcCalendarDate(new Date(start)).toISOString()
      );
      if (result.success) {
        toast.success("Session rescheduled");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    },
    [router, trainerId]
  );

  const handlePanelClose = useCallback(() => setPanelState({ mode: "closed" }), []);
  const handleRefresh = useCallback(() => router.refresh(), [router]);
  const handleCreateClick = useCallback(
    () => setPanelState({ mode: "creating", date: new Date() }),
    []
  );
  const handleAiGenerateFromDate = useCallback((date: Date) => {
    setPanelState({ mode: "closed" });
    setAiDialogDate(date);
  }, []);

  return (
    <CalendarPillCtx.Provider value={{ onRefresh: handleRefresh }}>
    <div className="space-y-4">
      {/* Top bar: status legend */}
      <div role="group" className="flex flex-wrap items-center gap-x-4 gap-y-1.5" aria-label="Legend">
        {Object.entries(statusConfig).map(([key, c]) => (
          <div key={key} className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: c.dot }}
            />
            <span className="text-caption">{c.label}</span>
          </div>
        ))}
      </div>

      {/* Calendar — agenda list on phones, the drag-and-drop grid from `sm` */}
      {isPhone ? (
        <PhoneAgenda
          events={events}
          date={date}
          onNavigate={setDate}
          onCreateClick={handleCreateClick}
          onCreateOnDay={(day) => setPanelState({ mode: "creating", date: day })}
          onSelectEvent={handleSelectEvent}
        />
      ) : (
      <div className="min-h-160 overflow-x-auto">
        <div className={cn(view === Views.DAY ? "min-w-full" : "min-w-[640px]", "rbc-no-time-grid")}>
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
          draggableAccessor={(event: SessionEvent) => event.resource.workout.program.trainerId === trainerId}
          popup
          style={{ height: view === Views.MONTH ? 640 : "auto" }}
          components={{
            event: EventComponent,
            toolbar: (props) => (
              <CustomToolbar
                date={props.date as Date}
                view={props.view as View}
                onNavigate={props.onNavigate}
                onView={props.onView}
                onCreateClick={handleCreateClick}
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
      )}
      <style jsx global>{`
        /* Sessions are always all-day (day-granularity scheduling, no time-of-day) —
           hide the empty scrollable hour grid in Week/Day view and keep just the
           day headers + all-day event row. */
        .rbc-no-time-grid .rbc-time-content,
        .rbc-no-time-grid .rbc-time-header-gutter {
          display: none;
        }
        .rbc-no-time-grid .rbc-time-header.rbc-overflowing {
          border-right: none;
        }
        .rbc-no-time-grid .rbc-allday-cell {
          height: auto;
        }
      `}</style>

      {/* Workout editor side panel */}
      <WorkoutEditorPanel
        panelState={panelState}
        onClose={handlePanelClose}
        exerciseLibrary={exerciseLibrary}
        organizationOrganizationId={organizationOrganizationId}
        exerciseSourcePreference={exerciseSourcePreference}
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
