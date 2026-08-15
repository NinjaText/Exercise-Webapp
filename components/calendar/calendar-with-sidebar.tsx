"use client";

import { useState, useCallback } from "react";
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
  endOfWeek,
  getDay,
} from "date-fns";
import { enUS } from "date-fns/locale";
import { toast } from "sonner";
import { rescheduleSessionAction } from "@/actions/session-actions";
import { toLocalCalendarDate, toUtcCalendarDate } from "@/lib/utils/calendar-date";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

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

const DnDCalendar = withDragAndDrop<SessionEvent>(Calendar);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface SessionEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  status: string;
  clientName?: string;
  programName?: string;
  exerciseCount?: number;
  resource: Record<string, unknown>;
}

interface Props {
  sessions: Record<string, unknown>[];
  isTrainer: boolean;
  onSessionClick?: (sessionId: string) => void;
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
// Event pill component
// ---------------------------------------------------------------------------
function EventComponent({ event }: { event: SessionEvent }) {
  const dotColor = (statusConfig[event.status] ?? statusConfig.SCHEDULED).dot;
  return (
    <div className="h-full overflow-hidden rounded-[5px] border border-border/60 bg-card transition-opacity hover:opacity-90">
      <div className="px-2 py-1 flex items-start gap-1.5">
        <span
          className="mt-[3px] shrink-0 h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: dotColor }}
        />
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold leading-tight text-foreground">
            {event.title}
          </p>
          {event.programName && (
            <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
              {event.programName}
            </p>
          )}
        </div>
      </div>
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
}: {
  date: Date;
  view: View;
  onNavigate: (action: "PREV" | "NEXT" | "TODAY") => void;
  onView: (view: View) => void;
}) {
  const title =
    view === Views.WEEK
      ? `${format(startOfWeek(date), "MMM d")} – ${format(endOfWeek(date), "MMM d, yyyy")}`
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
        {([Views.MONTH, Views.WEEK] as View[]).map((v) => (
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
            {v === Views.MONTH ? "Month" : "Week"}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function CalendarWithSidebar({ sessions, isTrainer, onSessionClick }: Props) {
  const [view, setView] = useState<View>(Views.MONTH);
  const [date, setDate] = useState(new Date());

  const events: SessionEvent[] = sessions.map((s) => {
    const workout = s.workout as Record<string, unknown> | undefined;
    const program = workout?.program as Record<string, unknown> | undefined;
    const client = s.client as Record<string, unknown> | undefined;
    const blocks = (workout?.blocks as Record<string, unknown>[] | undefined) ?? [];
    const exerciseCount = blocks.reduce((acc, b) => {
      const exs = b.exercises as unknown[] | undefined;
      return acc + (exs?.length ?? 0);
    }, 0);

    return {
      id: s.id as string,
      title: (workout?.name as string) || (program?.name as string) || "Workout",
      start: toLocalCalendarDate(s.scheduledDate as string),
      end: new Date(toLocalCalendarDate(s.scheduledDate as string).getTime() + 60 * 60 * 1000),
      status: s.status as string,
      clientName: client
        ? `${client.firstName} ${client.lastName}`
        : undefined,
      programName: program?.name as string | undefined,
      exerciseCount,
      resource: s,
    };
  });

  const handleEventDrop = useCallback(
    async ({ event, start }: { event: SessionEvent; start: string | Date }) => {
      if (!isTrainer) {
        toast.error("Only trainers can reschedule sessions");
        return;
      }
      const result = await rescheduleSessionAction(
        event.id,
        toUtcCalendarDate(new Date(start)).toISOString()
      );
      if (result.success) {
        toast.success("Session rescheduled");
      } else {
        toast.error(result.error);
      }
    },
    [isTrainer]
  );

  return (
    <div className="space-y-4">
      {/* Status legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {Object.entries(statusConfig).map(([key, c]) => (
          <div key={key} className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: c.dot }}
            />
            <span className="text-xs text-muted-foreground">{c.label}</span>
          </div>
        ))}
      </div>

      {/* Calendar */}
      <div className="min-h-155">
        <DnDCalendar
          localizer={localizer}
          events={events}
          view={view}
          date={date}
          onView={setView}
          onNavigate={setDate}
          onEventDrop={handleEventDrop as never}
          onSelectEvent={(event: SessionEvent) => onSessionClick?.(event.id)}
          resizable={false}
          draggableAccessor={() => isTrainer}
          popup
          style={{ height: 620 }}
          components={{
            event: EventComponent,
            toolbar: (props) => (
              <CustomToolbar
                date={props.date as Date}
                view={props.view as View}
                onNavigate={props.onNavigate}
                onView={props.onView}
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
          tooltipAccessor={(event: SessionEvent) => {
            let tip = event.title;
            if (event.programName) tip += ` · ${event.programName}`;
            if (event.clientName) tip += ` · ${event.clientName}`;
            return `${tip} · ${statusConfig[event.status]?.label ?? event.status}`;
          }}
        />
      </div>
    </div>
  );
}
