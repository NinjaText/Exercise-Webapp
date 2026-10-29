"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";
import { ArrowLeft, CalendarDays, ChevronDown, Copy, FileText, Loader2, Moon, PlayCircle, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { SectionCard } from "@/components/shared/section-card";
import { createProgramAction, updateProgramAction } from "@/actions/program-actions";
import { toLocalCalendarDate } from "@/lib/utils/calendar-date";
import {
  FOLLOW_ALONG_CONTENT_FORMAT,
  MAX_FOLLOW_ALONG_DAYS,
  dayNumberFromIndices,
  formatDuration,
  getFollowAlongTotalDays,
  indicesFromDayNumber,
} from "@/lib/utils/follow-along";
import { cn } from "@/lib/utils";
import { VideoSourceField } from "./video-source-field";

interface DayDraft {
  /** Existing Workout id — sent back so the save updates the row in place and keeps its sessions. */
  id?: string;
  isRest: boolean;
  name: string;
  description: string;
  videoUrl: string | null;
  videoDurationSec: number | null;
}

/** The slice of a stored program (getProgramById) the editor reads. */
export interface FollowAlongEditorProgram {
  id: string;
  name: string;
  description: string | null;
  clientId: string | null;
  startDate: Date | string | null;
  durationWeeks: number | null;
  workouts: {
    id: string;
    name: string;
    description: string | null;
    weekIndex: number;
    dayIndex: number;
    videoUrl: string | null;
    videoDurationSec: number | null;
  }[];
}

interface FollowAlongEditorProps {
  program?: FollowAlongEditorProgram;
  /** From /programs/new/follow-along?clientId=… — opens the assign dialog after creating. */
  assignClientId?: string;
}

const DEFAULT_DAY_COUNT = 30;
const AUTO_TITLE = /^Day \d+$/;

function emptyDay(): DayDraft {
  return { isRest: false, name: "", description: "", videoUrl: null, videoDurationSec: null };
}

function restDay(): DayDraft {
  return { ...emptyDay(), isRest: true };
}

/** Rebuilds the per-day list from stored workouts; days with no workout row are rest days. */
function daysFromProgram(program: FollowAlongEditorProgram): DayDraft[] {
  const total = getFollowAlongTotalDays(program.workouts, program.durationWeeks);
  const days: DayDraft[] = Array.from({ length: total }, restDay);
  for (const w of program.workouts) {
    days[dayNumberFromIndices(w.weekIndex, w.dayIndex) - 1] = {
      id: w.id,
      isRest: false,
      name: AUTO_TITLE.test(w.name) ? "" : w.name,
      description: w.description ?? "",
      videoUrl: w.videoUrl,
      videoDurationSec: w.videoDurationSec,
    };
  }
  return days;
}

/**
 * Builder for a follow-along program: N days, each one video (R2 upload or
 * YouTube) with a title and trainer notes, or a rest day. Saves through the
 * normal create/update program actions as zero-block video workouts, so
 * assigning, copying and the calendar all work like any other program.
 */
export function FollowAlongEditor({ program, assignClientId }: FollowAlongEditorProps) {
  const router = useRouter();
  const [name, setName] = useState(program?.name ?? "");
  const [description, setDescription] = useState(program?.description ?? "");
  const [days, setDays] = useState<DayDraft[]>(() =>
    program ? daysFromProgram(program) : Array.from({ length: DEFAULT_DAY_COUNT }, emptyDay)
  );
  const [dayCountInput, setDayCountInput] = useState(String(days.length));
  // Several days can be open at once, so an upload in one never gets unmounted by opening another.
  const [expandedDays, setExpandedDays] = useState<Set<number>>(() => new Set(program ? [] : [1]));
  const [uploadingDays, setUploadingDays] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  // A client's program is dated from its start date; a library program gets one when assigned.
  const hasClient = !!program?.clientId;
  const [startDate, setStartDate] = useState(() =>
    format(program?.startDate ? toLocalCalendarDate(program.startDate) : new Date(), "yyyy-MM-dd")
  );

  const snapshot = useMemo(
    () => JSON.stringify([name, description, days, hasClient ? startDate : null]),
    [name, description, days, hasClient, startDate]
  );
  const [initialSnapshot] = useState(snapshot);
  const isDirty = snapshot !== initialSnapshot;

  useEffect(() => {
    if (!isDirty || saving) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty, saving]);

  const videoDayCount = days.filter((d) => !d.isRest).length;
  const missingVideoDays = days.flatMap((d, i) => (!d.isRest && !d.videoUrl ? [i + 1] : []));

  function updateDay(dayNumber: number, patch: Partial<DayDraft>) {
    setDays((prev) => prev.map((d, i) => (i === dayNumber - 1 ? { ...d, ...patch } : d)));
  }

  function applyDayCount(raw: string) {
    const count = Math.round(Number(raw));
    if (!Number.isFinite(count) || count < 1) {
      setDayCountInput(String(days.length));
      return;
    }
    const clamped = Math.min(count, MAX_FOLLOW_ALONG_DAYS);
    setDayCountInput(String(clamped));
    setDays((prev) =>
      clamped <= prev.length ? prev.slice(0, clamped) : [...prev, ...Array.from({ length: clamped - prev.length }, emptyDay)]
    );
    if (count > MAX_FOLLOW_ALONG_DAYS) toast.info(`A follow-along program can run at most ${MAX_FOLLOW_ALONG_DAYS} days`);
  }

  function toggleDay(dayNumber: number) {
    if (expandedDays.has(dayNumber) && uploadingDays.has(dayNumber)) {
      toast.info("Wait for this day's upload to finish");
      return;
    }
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(dayNumber)) next.delete(dayNumber);
      else next.add(dayNumber);
      return next;
    });
  }

  function copyPreviousDay(dayNumber: number) {
    const previous = days[dayNumber - 2];
    if (!previous) return;
    // Copy the content, never the row id — this day keeps its own Workout (and sessions).
    const { id: _previousId, ...content } = previous;
    void _previousId;
    updateDay(dayNumber, { ...content, name: AUTO_TITLE.test(previous.name) ? "" : previous.name });
  }

  function setDayUploading(dayNumber: number, uploading: boolean) {
    setUploadingDays((prev) => {
      const next = new Set(prev);
      if (uploading) next.add(dayNumber);
      else next.delete(dayNumber);
      return next;
    });
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Give the program a name");
      return;
    }
    if (uploadingDays.size > 0) {
      toast.error("Wait for the video uploads to finish");
      return;
    }
    if (videoDayCount === 0) {
      toast.error("Add at least one video day");
      return;
    }
    if (missingVideoDays.length > 0) {
      toast.error(`Day ${missingVideoDays[0]} needs a video (or mark it as a rest day)`);
      setExpandedDays((prev) => new Set(prev).add(missingVideoDays[0]));
      return;
    }
    if (hasClient && !startDate) {
      toast.error("Pick a start date for this program");
      return;
    }

    const workouts = days.flatMap((d, i) => {
      if (d.isRest) return [];
      const dayNumber = i + 1;
      return [
        {
          ...(d.id && { id: d.id }),
          ...indicesFromDayNumber(dayNumber),
          name: d.name.trim() || `Day ${dayNumber}`,
          description: d.description.trim() || null,
          videoUrl: d.videoUrl,
          videoDurationSec: d.videoDurationSec,
          estimatedMinutes: d.videoDurationSec ? Math.max(1, Math.round(d.videoDurationSec / 60)) : null,
          blocks: [],
        },
      ];
    });
    const perWeek = new Map<number, number>();
    for (const w of workouts) perWeek.set(w.weekIndex, (perWeek.get(w.weekIndex) ?? 0) + 1);

    // Only the fields this editor owns — tags, collections, equipment etc. set
    // elsewhere must survive an edit here untouched.
    const shared = {
      name: name.trim(),
      description: description.trim() || null,
      contentFormat: FOLLOW_ALONG_CONTENT_FORMAT,
      durationWeeks: Math.ceil(days.length / 7),
      daysPerWeek: Math.max(...perWeek.values()),
      workouts,
      // Stored UTC-midnight-anchored, like every other program start date.
      ...(hasClient && { startDate: `${startDate}T00:00:00.000Z` }),
    };

    setSaving(true);
    try {
      if (program) {
        const result = await updateProgramAction(program.id, shared);
        if (!result.success) {
          toast.error(result.error);
          return;
        }
        toast.success("Program updated");
        router.push(`/programs/${program.id}`);
      } else {
        const result = await createProgramAction({
          ...shared,
          schedulingType: "SCHEDULED",
          isTemplate: false,
          tags: [],
          equipmentRequired: [],
          organizationIds: [],
          collectionIds: [],
          bodyAreas: [],
          goals: [],
          activities: [],
        });
        if (!result.success) {
          toast.error(result.error);
          return;
        }
        toast.success("Program created");
        router.push(
          assignClientId
            ? `/programs/${result.data.id}?assign=true&clientId=${assignClientId}`
            : `/programs/${result.data.id}`
        );
      }
    } finally {
      setSaving(false);
    }
  }

  const backHref = program ? `/programs/${program.id}` : "/programs";

  return (
    <div className="flex flex-col">
      {/* Same pinned bar as the program editor: Save is always one tap away. */}
      <div className="sticky -top-4 z-30 -mx-4 -mt-4 mb-6 border-b border-border bg-canvas/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-canvas/90 lg:-top-6 lg:-mx-6 lg:-mt-6 lg:px-6 2xl:-top-8 2xl:-mx-8 2xl:-mt-8 2xl:px-8">
        <div className="mx-auto flex min-h-10 max-w-[1440px] items-center gap-3">
          <Button asChild variant="ghost" size="icon-sm" className="shrink-0 max-sm:size-10">
            <Link href={backHref} aria-label="Back">
              <ArrowLeft />
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="truncate text-heading text-foreground">
                {program ? "Edit follow-along program" : "New follow-along program"}
              </h1>
              {isDirty && (
                <span className="hidden shrink-0 items-center gap-1.5 rounded-full bg-warning-soft px-2 py-0.5 text-caption font-medium text-warning-foreground sm:inline-flex">
                  <span aria-hidden className="size-1.5 rounded-full bg-warning" />
                  Unsaved changes
                </span>
              )}
            </div>
            <p className="truncate text-caption">
              {videoDayCount} video {videoDayCount === 1 ? "day" : "days"} · {days.length - videoDayCount} rest
            </p>
          </div>
          <Button type="button" onClick={handleSave} disabled={saving} className="min-w-28">
            {saving && <Loader2 className="animate-spin motion-reduce:animate-none" />}
            {saving ? "Saving…" : program ? "Save changes" : "Create program"}
          </Button>
        </div>
      </div>

      <div className="mx-auto grid w-full max-w-3xl gap-6">
        <SectionCard title="Details" icon={FileText} contentClassName="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="fa-name">Program name</Label>
            <Input
              id="fa-name"
              value={name}
              maxLength={200}
              placeholder="e.g., 90-Day Mobility Reset"
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="fa-description">Description</Label>
            <Textarea
              id="fa-description"
              value={description}
              maxLength={5000}
              rows={3}
              placeholder="What clients can expect from this program"
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fa-days">Number of days</Label>
            <Input
              id="fa-days"
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_FOLLOW_ALONG_DAYS}
              value={dayCountInput}
              onChange={(e) => setDayCountInput(e.target.value)}
              onBlur={(e) => applyDayCount(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  applyDayCount(e.currentTarget.value);
                }
              }}
            />
            <p className="text-caption">Up to {MAX_FOLLOW_ALONG_DAYS} days. One video per day.</p>
          </div>
          {hasClient ? (
            <div className="space-y-1.5">
              <Label htmlFor="fa-start">Start date</Label>
              <Input id="fa-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              <p className="text-caption">Day 1 lands on this date.</p>
            </div>
          ) : (
            <p className="flex items-start gap-2 self-end text-caption">
              <CalendarDays className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              You pick the start date when you assign it to a client — Day 1 lands on that date.
            </p>
          )}
        </SectionCard>

        <SectionCard title="Days" icon={PlayCircle} contentClassName="space-y-2">
          {missingVideoDays.length > 0 && (
            <p className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-body text-warning-foreground ring-1 ring-warning-border">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {missingVideoDays.length === 1
                ? `Day ${missingVideoDays[0]} still needs a video.`
                : `${missingVideoDays.length} days still need a video (first: Day ${missingVideoDays[0]}).`}
            </p>
          )}
          <ol className="space-y-2">
            {days.map((day, i) => {
              const dayNumber = i + 1;
              const expanded = expandedDays.has(dayNumber);
              const title = day.name.trim() || `Day ${dayNumber}`;
              return (
                <li key={dayNumber} className="rounded-lg bg-surface ring-1 ring-border">
                  <button
                    type="button"
                    onClick={() => toggleDay(dayNumber)}
                    aria-expanded={expanded}
                    className="flex min-h-12 w-full items-center gap-3 rounded-lg px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="w-14 shrink-0 text-caption font-medium tabular-nums">Day {dayNumber}</span>
                    <span className="min-w-0 flex-1">
                      <span className={cn("block truncate text-label", day.isRest && "text-muted-foreground")}>
                        {day.isRest ? "Rest day" : title}
                      </span>
                      {!day.isRest && (
                        <span className="block truncate text-caption">
                          {day.videoUrl
                            ? formatDuration(day.videoDurationSec) ?? "Video added"
                            : uploadingDays.has(dayNumber)
                              ? "Uploading…"
                              : "No video yet"}
                        </span>
                      )}
                    </span>
                    {day.isRest ? (
                      <Moon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    ) : day.videoUrl ? (
                      <PlayCircle className="size-4 shrink-0 text-success" aria-hidden />
                    ) : (
                      <TriangleAlert className="size-4 shrink-0 text-warning" aria-hidden />
                    )}
                    <ChevronDown
                      className={cn("size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none", expanded && "rotate-180")}
                      aria-hidden
                    />
                  </button>

                  {expanded && (
                    <div className="space-y-4 border-t border-border p-3 sm:p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <label className="flex items-center gap-2 text-label">
                          <Switch
                            checked={day.isRest}
                            disabled={uploadingDays.has(dayNumber)}
                            onCheckedChange={(checked) => updateDay(dayNumber, { isRest: checked })}
                          />
                          Rest day
                        </label>
                        {dayNumber > 1 && (
                          <Button type="button" variant="outline" size="sm" onClick={() => copyPreviousDay(dayNumber)}>
                            <Copy className="size-3.5" />
                            Copy previous day
                          </Button>
                        )}
                      </div>

                      {!day.isRest && (
                        <>
                          <div className="space-y-1.5">
                            <Label htmlFor={`fa-day-${dayNumber}-name`}>Title</Label>
                            <Input
                              id={`fa-day-${dayNumber}-name`}
                              value={day.name}
                              maxLength={200}
                              placeholder={`Day ${dayNumber}`}
                              onChange={(e) => updateDay(dayNumber, { name: e.target.value })}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label>Video</Label>
                            <VideoSourceField
                              // Remount per day so tab/input state never leaks between days.
                              key={dayNumber}
                              id={`fa-day-${dayNumber}`}
                              value={{ videoUrl: day.videoUrl, videoDurationSec: day.videoDurationSec }}
                              onChange={(next) => updateDay(dayNumber, next)}
                              onUploadingChange={(uploading) => setDayUploading(dayNumber, uploading)}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor={`fa-day-${dayNumber}-notes`}>
                              Notes for the client <span className="font-normal text-muted-foreground">(optional)</span>
                            </Label>
                            <Textarea
                              id={`fa-day-${dayNumber}-notes`}
                              value={day.description}
                              maxLength={2000}
                              rows={3}
                              placeholder="Focus cues, modifications, what to have ready…"
                              onChange={(e) => updateDay(dayNumber, { description: e.target.value })}
                            />
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </SectionCard>
      </div>
    </div>
  );
}
