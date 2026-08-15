"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import { Calendar, dateFnsLocalizer, Event as CalendarEvent, Views, View } from "react-big-calendar";
import withDragAndDrop, { withDragAndDropProps } from "react-big-calendar/lib/addons/dragAndDrop";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { enUS } from "date-fns/locale";
import { toast } from "sonner";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";

// CSS Overrides to match our theme could be placed in a corresponding CSS file or globals.css
// But we'll rely on basic functionality first.

import { getClientWorkoutSessions, updateSessionDate } from "@/actions/calendar-actions";
import { toLocalCalendarDate, toUtcCalendarDate } from "@/lib/utils/calendar-date";
import { Loader2 } from "lucide-react";

interface WorkoutSessionEvent extends CalendarEvent {
  id: string;
  clientId: string;
  sourceResource?: any;
}

const locales = {
  "en-US": enUS,
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

const DnDCalendar = withDragAndDrop<WorkoutSessionEvent>(Calendar);

export default function WorkoutCalendar({ 
  clientId, 
  isTrainer = false,
  initialSessions
}: { 
  clientId: string, 
  isTrainer?: boolean,
  initialSessions?: any[]
}) {
  const [events, setEvents] = useState<WorkoutSessionEvent[]>([]);
  const [loading, setLoading] = useState(!initialSessions);
  const [view, setView] = useState<View>(Views.MONTH);
  const [date, setDate] = useState<Date>(new Date());

  const mapSessionsToEvents = (sessions: any[]) => {
    return sessions
      .filter((session: any) => session.scheduledDate)
      .map((session: any) => ({
        id: session.id,
        clientId: session.clientId,
        title: session.plan?.title || "Workout Session",
        start: toLocalCalendarDate(session.scheduledDate as Date),
        end: new Date(toLocalCalendarDate(session.scheduledDate as Date).getTime() + 60 * 60 * 1000), // Append hour
        allDay: false,
        sourceResource: session,
      }));
  };

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const response = await getClientWorkoutSessions(clientId);
      if (response.success && response.sessions) {
        setEvents(mapSessionsToEvents(response.sessions));
      } else {
        toast.error("Failed to load workout sessions");
      }
    } catch (err) {
      toast.error("Error fetching sessions.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialSessions) {
      setEvents(mapSessionsToEvents(initialSessions));
      setLoading(false);
    } else {
      fetchEvents();
    }
  }, [clientId, initialSessions]);

  const onEventDrop: withDragAndDropProps<WorkoutSessionEvent>["onEventDrop"] = async ({ event, start, end, isAllDay: droppedOnAllDaySlot }) => {
    if (!isTrainer) {
      toast.error("Only trainers can reschedule from the calendar view.");
      return;
    }

    const newStart = new Date(start);
    // Optimistic update
    const previousEvents = [...events];
    const updatedEvents = events.map(e =>
      e.id === event.id ? { ...e, start: newStart, end: new Date(end), allDay: droppedOnAllDaySlot } : e
    );
    setEvents(updatedEvents);

    const result = await updateSessionDate(event.id, toUtcCalendarDate(newStart));
    if (result.success) {
      toast.success("Workout session rescheduled successfully.");
    } else {
      toast.error("Failed to reschedule workout session.");
      setEvents(previousEvents); // Revert
    }
  };

  if (loading) {
    return (
      <div className="flex h-[500px] w-full items-center justify-center rounded-md border text-muted-foreground">
        <Loader2 className="mr-2 h-6 w-6 animate-spin" />
        Loading Calendar...
      </div>
    );
  }

  return (
    <div className="h-[600px] w-full rounded-md border p-4 bg-card">
      <DnDCalendar
        localizer={localizer}
        events={events}
        onEventDrop={onEventDrop}
        resizable={false}
        defaultView={Views.MONTH}
        view={view}
        date={date}
        onView={(view) => setView(view)}
        onNavigate={(date) => {
          setDate(new Date(date));
        }}
        selectable
        style={{ height: "100%" }}
        className="font-sans text-sm"
        draggableAccessor={() => isTrainer}
        tooltipAccessor={(event) => (event.title ? String(event.title) : "")}
        eventPropGetter={(event) => {
           let backgroundColor = "hsl(var(--primary))";
           let textColor = "hsl(var(--primary-foreground))";
           
           if (event.sourceResource?.status === "COMPLETED") {
             backgroundColor = "hsl(var(--success))";
           } else if (event.sourceResource?.status === "IN_PROGRESS") {
             backgroundColor = "hsl(var(--warning))";
           }
           
           return {
             style: {
               backgroundColor,
               color: textColor,
               borderRadius: '4px',
               border: 'none',
             }
           }
        }}
      />
    </div>
  );
}
