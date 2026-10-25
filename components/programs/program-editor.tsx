"use client";

import { useState, useRef, useMemo, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ArrowLeft, CalendarDays, Dumbbell, FileText, Info, Loader2, Sparkles, Tags, X } from "lucide-react";
import { SectionCard } from "@/components/shared/section-card";
import {
  createProgramSchema,
  type CreateProgramInput,
  type WorkoutInput,
} from "@/lib/validators/program";
import {
  createProgramAction,
  updateProgramAction,
  syncProgramToMasterAction,
} from "@/actions/program-actions";
import { ProgramBuilder } from "./program-builder";
import { ClinicVisibilitySelector } from "./clinic-visibility-selector";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { TagListInput } from "./tag-list-input";
import { SchedulingTypeSelector } from "./scheduling-type-selector";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { toLocalCalendarDate } from "@/lib/utils/calendar-date";
import { type ExerciseSourcePreference } from "@/lib/utils/exercise-picker";
import {
  getProgramSchedulingType,
  type ProgramSchedulingTypeValue,
} from "@/lib/utils/program-scheduling";

const BODY_AREA_SUGGESTIONS = ["Shoulder", "Elbow", "Wrist/Hand", "Chest", "Back", "Hip", "Knee", "Ankle/Foot", "Core"];
const GOAL_SUGGESTIONS = ["Strength", "Mobility", "Endurance", "Weight Loss", "Rehab", "Power"];
const ACTIVITY_SUGGESTIONS = ["Tennis", "Golf", "Running", "Basketball", "Soccer", "Swimming", "General Fitness"];

// Base UI's <Select.Value> renders the raw value string unless the root is
// given an items map — without this it shows "PERFORMANCE" / "UNSET" etc.
// instead of the item's label.
const PROGRAM_TYPE_ITEMS = {
  UNSET: "Select program type",
  PERFORMANCE: "Performance / Athletic",
  CLINICAL: "Rehab / Clinical",
};
const LEVEL_ITEMS = {
  UNSET: "Select level",
  BEGINNER: "Beginner",
  INTERMEDIATE: "Intermediate",
  ADVANCED: "Advanced",
};

interface Props {
  program?: Record<string, unknown>;
  exercises: {
    id: string;
    name: string;
    bodyRegion: string[];
    difficultyLevel: string | null;
    defaultReps?: number | null;
    musclesTargeted?: string[];
    imageUrl?: string | null;
    equipmentRequired?: string[];
  }[];
  onSave?: (
    data: CreateProgramInput,
    programId?: string
  ) => Promise<{ success: boolean; error?: string; data?: { id: string } }>;
  redirectTo?: string;
  organizationOrganizationId?: string;
  clinics?: { id: string; name: string }[];
  collections?: { id: string; name: string }[];
  exerciseSourcePreference?: ExerciseSourcePreference;
  /**
   * When set, saving a new program (create path only) redirects into that
   * program's assign dialog with this client preselected, instead of the
   * plain program page — e.g. when arriving from a client's profile.
   */
  assignClientId?: string;
  /** Heading in the sticky editor bar. Defaults to "Edit program" / "New program". */
  title?: string;
  /** Where the bar's back arrow goes; omitted = no back arrow. */
  backHref?: string;
  /** One-line context shown above the form (e.g. "Editing on behalf of…"). */
  notice?: string;
}

// Helper to map DB workout to input type
function mapWorkoutToInput(w: Record<string, unknown>): WorkoutInput {
  return {
    id: w.id as string,
    name: w.name as string,
    description: w.description as string | null | undefined,
    dayIndex: w.dayIndex as number,
    weekIndex: w.weekIndex as number,
    orderIndex: w.orderIndex as number,
    estimatedMinutes: w.estimatedMinutes as number | null | undefined,
    // Passed through untouched so a save from this editor never strips a video day.
    videoUrl: w.videoUrl as string | null | undefined,
    videoDurationSec: w.videoDurationSec as number | null | undefined,
    blocks: ((w.blocks as Record<string, unknown>[]) || []).map(
      (b: Record<string, unknown>, bi: number) => ({
        id: b.id as string,
        name: b.name as string | null | undefined,
        type: (["WARMUP", "COOLDOWN", "SUPERSET", "CIRCUIT", "AMRAP", "EMOM"].includes((b.type as string)?.toUpperCase()) ? (b.type as string).toUpperCase() : "NORMAL") as "NORMAL" | "WARMUP" | "COOLDOWN" | "SUPERSET" | "CIRCUIT" | "AMRAP" | "EMOM",
        orderIndex: bi,
        rounds: (b.rounds as number) || 1,
        restBetweenRounds: b.restBetweenRounds as number | null | undefined,
        timeCap: b.timeCap as number | null | undefined,
        notes: b.notes as string | null | undefined,
        exercises: (
          (b.exercises as Record<string, unknown>[]) || []
        ).map((e: Record<string, unknown>, ei: number) => ({
          id: e.id as string,
          exerciseId: e.exerciseId as string,
          orderIndex: ei,
          activityType: ((e.activityType as string) || "STRENGTH") as
            | "STRENGTH"
            | "RUN"
            | "INTERVAL_RUN",
          restSeconds: e.restSeconds as number | null | undefined,
          notes: e.notes as string | null | undefined,
          supersetGroup: e.supersetGroup as string | null | undefined,
          _exerciseName: (e.exercise as Record<string, unknown>)?.name as
            | string
            | undefined,
          _exerciseBodyRegion: (e.exercise as Record<string, unknown>)
            ?.bodyRegion as string[] | undefined,
          sets: ((e.sets as Record<string, unknown>[]) || []).map(
            (s: Record<string, unknown>, si: number) => ({
              id: s.id as string,
              orderIndex: si,
              setType: ((s.setType as string) || "NORMAL") as "NORMAL" | "WARMUP" | "DROP_SET" | "FAILURE",
              targetReps: s.targetReps as number | null | undefined,
              targetWeight: s.targetWeight as number | null | undefined,
              targetDuration: s.targetDuration as number | null | undefined,
              targetDistance: s.targetDistance as number | null | undefined,
              targetRPE: s.targetRPE as number | null | undefined,
              restAfter: s.restAfter as number | null | undefined,
            })
          ),
        })),
      })
    ),
  };
}

export function ProgramEditor({ program, exercises, onSave, redirectTo, organizationOrganizationId, clinics, collections, exerciseSourcePreference, assignClientId, title, backHref, notice }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [syncingToMaster, setSyncingToMaster] = useState(false);
  const [syncConfirmOpen, setSyncConfirmOpen] = useState(false);
  const isAssignedCopyOfTemplate = !!program?.sourceTemplateId && !!program?.clientId;

  async function handleSyncToMaster() {
    if (!program?.id) return;
    setSyncingToMaster(true);
    try {
      const result = await syncProgramToMasterAction(program.id as string);
      if (result.success) {
        toast.success("Master program updated");
      } else {
        toast.error(result.error);
      }
    } finally {
      setSyncingToMaster(false);
    }
  }
  const [workouts, setWorkouts] = useState<WorkoutInput[]>(
    program
      ? ((program.workouts as Record<string, unknown>[]) || []).map(
          mapWorkoutToInput
        )
      : []
  );

  // Equipment state — pre-populated from saved program or empty
  const [equipment, setEquipment] = useState<string[]>(
    (program?.equipmentRequired as string[]) || []
  );
  // Clinic visibility state — pre-populated from saved program or empty (= all clinics)
  const [selectedOrganizationIds, setSelectedOrganizationIds] = useState<string[]>(
    (program?.organizationIds as string[]) || []
  );
  const [equipmentInput, setEquipmentInput] = useState("");
  const equipmentInputRef = useRef<HTMLInputElement>(null);

  // Category fields — pre-populated from saved program or empty
  const [bodyAreas, setBodyAreas] = useState<string[]>((program?.bodyAreas as string[]) || []);
  const [goals, setGoals] = useState<string[]>((program?.goals as string[]) || []);
  const [activities, setActivities] = useState<string[]>((program?.activities as string[]) || []);
  const [tags, setTags] = useState<string[]>((program?.tags as string[]) || []);
  const [level, setLevel] = useState<string | null>((program?.level as string | null) || null);
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<string[]>(
    (program?.collectionIds as string[]) || []
  );
  // Scheduled = dated program with generated sessions; On-Demand = an anytime
  // "Resource" with no schedule (see lib/utils/program-scheduling.ts).
  const [schedulingType, setSchedulingType] = useState<ProgramSchedulingTypeValue>(
    getProgramSchedulingType({
      schedulingType: program?.schedulingType as string | null | undefined,
    })
  );
  const isOnDemand = schedulingType === "ON_DEMAND";
  // A program running for a client needs a start date to be scheduled — its
  // sessions are dated from it. A library program gets one when it's assigned.
  const hasClient = !!program?.clientId;
  const [startDate, setStartDate] = useState(() =>
    format(program?.startDate ? toLocalCalendarDate(program.startDate as Date | string) : new Date(), "yyyy-MM-dd")
  );
  const needsStartDate = hasClient && !isOnDemand;

  const form = useForm<CreateProgramInput>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(createProgramSchema) as any,
    defaultValues: {
      name: (program?.name as string) || "",
      description: (program?.description as string) || "",
      programType: (program?.programType as "PERFORMANCE" | "CLINICAL" | null) || null,
      tags: (program?.tags as string[]) || [],
      equipmentRequired: [],
      workouts: [],
    },
  });

  // Duration / days-per-week are derived from the actual builder schedule
  // rather than typed in manually, so they can never drift from reality.
  const scheduleSummary = useMemo(() => {
    const daysPerWeekCounts = new Map<number, number>();
    workouts.forEach((w) => {
      daysPerWeekCounts.set(w.weekIndex, (daysPerWeekCounts.get(w.weekIndex) ?? 0) + 1);
    });
    return {
      durationWeeks: daysPerWeekCounts.size,
      daysPerWeek: daysPerWeekCounts.size > 0 ? Math.max(...daysPerWeekCounts.values()) : 0,
    };
  }, [workouts]);

  // Unsaved-changes tracking: one serialised snapshot of everything the save
  // sends, compared with the snapshot from the first render.
  const [watchedName, watchedDescription, watchedProgramType] = useWatch({
    control: form.control,
    name: ["name", "description", "programType"],
  });
  const snapshot = useMemo(
    () =>
      JSON.stringify([
        watchedName, watchedDescription ?? "", watchedProgramType ?? null,
        workouts, equipment, selectedOrganizationIds, bodyAreas, goals,
        activities, tags, level, selectedCollectionIds, schedulingType, needsStartDate ? startDate : null,
      ]),
    [watchedName, watchedDescription, watchedProgramType, workouts, equipment, selectedOrganizationIds,
      bodyAreas, goals, activities, tags, level, selectedCollectionIds, schedulingType, needsStartDate, startDate],
  );
  const [initialSnapshot] = useState(snapshot);
  const isDirty = snapshot !== initialSnapshot;

  // Warn before a reload/tab close would drop unsaved edits.
  useEffect(() => {
    if (!isDirty || saving) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty, saving]);

  const totalExercises = workouts.reduce(
    (sum, w) => sum + w.blocks.reduce((n, b) => n + b.exercises.length, 0),
    0,
  );

  // Auto-detect equipment from exercises currently added to the builder
  function autoDetectEquipment() {
    const exerciseIds = workouts
      .flatMap((w) => w.blocks)
      .flatMap((b) => b.exercises)
      .map((e) => e.exerciseId);

    const detected = exerciseIds
      .flatMap((id) => {
        const ex = exercises.find((e) => e.id === id);
        return ex?.equipmentRequired ?? [];
      })
      .filter((eq) => eq && eq.toLowerCase() !== "none");

    const merged = [...new Set([...equipment, ...detected])].sort();
    setEquipment(merged);
    toast.success(`Equipment updated — ${merged.length} item${merged.length !== 1 ? "s" : ""} listed`);
  }

  function addEquipmentItem(item: string) {
    const trimmed = item.trim();
    if (!trimmed || equipment.includes(trimmed)) return;
    setEquipment((prev) => [...prev, trimmed].sort());
  }

  function removeEquipmentItem(item: string) {
    setEquipment((prev) => prev.filter((e) => e !== item));
  }

  function handleEquipmentKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addEquipmentItem(equipmentInput);
      setEquipmentInput("");
    }
  }

  async function onSubmit(data: CreateProgramInput) {
    if (needsStartDate && !startDate) {
      toast.error("Pick a start date for this scheduled program");
      return;
    }
    setSaving(true);
    try {
      const cleanWorkouts = workouts.map((w) => ({
        ...w,
        blocks: w.blocks.map((b) => ({
          ...b,
          exercises: b.exercises.map((e) => {
            const { _exerciseName, _exerciseBodyRegion, ...rest } = e as Record<
              string,
              unknown
            > &
              typeof e;
            void _exerciseName;
            void _exerciseBodyRegion;
            return rest;
          }),
        })),
      }));
      data.workouts = cleanWorkouts;
      data.equipmentRequired = equipment;
      data.organizationIds = selectedOrganizationIds;
      data.schedulingType = schedulingType;
      data.durationWeeks = scheduleSummary.durationWeeks || null;
      // A resource has no weekly cadence and no start date — leaving stale
      // schedule values on it would make the Programs UI and adherence lie.
      data.daysPerWeek = isOnDemand ? null : scheduleSummary.daysPerWeek || null;
      if (isOnDemand) data.startDate = null;
      // Stored UTC-midnight-anchored, like every other program start date.
      else if (needsStartDate) data.startDate = `${startDate}T00:00:00.000Z`;
      data.bodyAreas = bodyAreas;
      data.goals = goals;
      data.activities = activities;
      data.tags = tags;
      data.level = level as CreateProgramInput["level"];
      data.collectionIds = selectedCollectionIds;

      if (onSave) {
        const result = await onSave(data, program?.id as string | undefined);
        if (result.success) {
          toast.success(program ? "Program updated" : "Program created");
          router.push(
            redirectTo ??
              (result.data?.id
                ? assignClientId
                  ? `/programs/${result.data.id}?assign=true&clientId=${assignClientId}`
                  : `/programs/${result.data.id}`
                : "/programs")
          );
        } else {
          toast.error(result.error);
        }
        return;
      }

      if (program) {
        const result = await updateProgramAction(program.id as string, data);
        if (result.success) {
          toast.success("Program updated");
          router.push(`/programs/${program.id}`);
        } else {
          toast.error(result.error);
        }
      } else {
        const result = await createProgramAction(data);
        if (result.success) {
          toast.success("Program created");
          router.push(
            assignClientId
              ? `/programs/${result.data.id}?assign=true&clientId=${assignClientId}`
              : `/programs/${result.data.id}`
          );
        } else {
          toast.error(result.error);
        }
      }
    } finally {
      setSaving(false);
    }
  }

  const heading = title ?? (program ? "Edit program" : "New program");
  const subtitle = watchedName?.trim() || (program ? "Untitled program" : "Name your program to get started");

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        // Bar height (py-3 + min-h-10 + 1px border): the sticky sidebar offsets against it.
        className="flex flex-col [--editor-bar-h:calc(4rem+1px)]"
      >
        {/* Editor bar: pinned under the app header, so Save is always one click
            away and unsaved edits are always visible. Negative margins cancel
            <main>'s gutter (edge to edge, flush with the header) and the
            negative `top` matches it, since sticky offsets start inside the
            scroll container's padding. */}
        <div
          data-slot="program-editor-bar"
          className="sticky -top-4 z-30 -mx-4 -mt-4 mb-6 border-b border-border bg-canvas/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-canvas/90 lg:-top-6 lg:-mx-6 lg:-mt-6 lg:px-6 2xl:-top-8 2xl:-mx-8 2xl:-mt-8 2xl:px-8"
        >
          <div className="mx-auto flex min-h-10 max-w-[1440px] items-center gap-3">
            {backHref && (
              <Button asChild variant="ghost" size="icon-sm" className="shrink-0">
                <Link href={backHref} aria-label="Back">
                  <ArrowLeft />
                </Link>
              </Button>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <h1 className="truncate text-heading text-foreground">{heading}</h1>
                {isDirty && (
                  <span
                    data-slot="unsaved-indicator"
                    className="hidden shrink-0 items-center gap-1.5 rounded-full bg-warning-soft px-2 py-0.5 text-caption font-medium text-warning-foreground sm:inline-flex"
                  >
                    <span aria-hidden className="size-1.5 rounded-full bg-warning" />
                    Unsaved changes
                  </span>
                )}
              </div>
              <p className="truncate text-caption text-muted-foreground">{subtitle}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {isAssignedCopyOfTemplate && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={syncingToMaster}
                  onClick={() => setSyncConfirmOpen(true)}
                >
                  {syncingToMaster ? "Saving…" : "Save to master"}
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                className="hidden sm:inline-flex"
                onClick={() => router.back()}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving} className="min-w-28">
                {saving && <Loader2 className="animate-spin motion-reduce:animate-none" />}
                {saving ? "Saving…" : program ? "Save changes" : "Create program"}
              </Button>
            </div>
          </div>
        </div>

        {notice && (
          <p className="mb-6 flex items-start gap-2 rounded-lg border border-info-border bg-info-soft px-3 py-2 text-body text-info-foreground">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            {notice}
          </p>
        )}

        {/* Main column (details + builder) with a settings sidebar from xl.
            DOM order details → sidebar → builder keeps settings above the
            long builder when stacked; from xl the sidebar spans both rows. */}
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem] xl:grid-rows-[auto_1fr] 2xl:grid-cols-[minmax(0,1fr)_22rem]">
          <SectionCard title="Details" icon={FileText} contentClassName="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Program name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., 12-Week Strength Program" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="programType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Program type</FormLabel>
                  <FormControl>
                    <Select
                      items={PROGRAM_TYPE_ITEMS}
                      value={field.value || "UNSET"}
                      onValueChange={(v) => field.onChange(v === "UNSET" ? null : v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="UNSET">Select program type</SelectItem>
                        <SelectItem value="PERFORMANCE">Performance / Athletic</SelectItem>
                        <SelectItem value="CLINICAL">Rehab / Clinical</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormItem>
              <FormLabel>Level</FormLabel>
              <Select
                items={LEVEL_ITEMS}
                value={level || "UNSET"}
                onValueChange={(v) => setLevel(v === "UNSET" ? null : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="UNSET">Select level</SelectItem>
                  <SelectItem value="BEGINNER">Beginner</SelectItem>
                  <SelectItem value="INTERMEDIATE">Intermediate</SelectItem>
                  <SelectItem value="ADVANCED">Advanced</SelectItem>
                </SelectContent>
              </Select>
            </FormItem>
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="What this program is for, who it suits, and what to expect."
                      rows={3}
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </SectionCard>

          <aside
            data-slot="program-editor-sidebar"
            // From xl the sidebar stays in view while the builder scrolls: pinned
            // 1.5rem under the editor bar (sticky offsets start inside <main>'s
            // padding, 1.5rem at xl and 2rem at 2xl), capped to the viewport
            // below the app header (3.5rem) and scrolling on its own. The 4px
            // inner padding keeps card rings and shadows from being clipped, and
            // shrink-0 stops the capped flex column squashing the cards.
            className="flex min-w-0 flex-col gap-6 *:shrink-0 xl:sticky xl:top-[var(--editor-bar-h)] xl:col-start-2 xl:row-span-2 xl:row-start-1 xl:-m-1 xl:max-h-[calc(100dvh-3.5rem-var(--editor-bar-h)-3rem+0.5rem)] xl:overflow-y-auto xl:overscroll-contain xl:p-1 2xl:top-[calc(var(--editor-bar-h)-0.5rem)]"
          >
            <SectionCard title="Scheduling" icon={CalendarDays} size="compact" contentClassName="space-y-3">
              <SchedulingTypeSelector
                value={schedulingType}
                onChange={setSchedulingType}
                className="xl:grid-cols-1"
              />
              {!isOnDemand && (
                <dl className="grid grid-cols-3 divide-x divide-border rounded-lg bg-surface-muted py-2.5 text-center">
                  {[
                    { label: "Weeks", value: scheduleSummary.durationWeeks },
                    { label: "Days / wk", value: scheduleSummary.daysPerWeek },
                    { label: "Exercises", value: totalExercises },
                  ].map((stat) => (
                    <div key={stat.label} className="px-2">
                      <dd className="text-heading tabular-nums text-foreground">{stat.value}</dd>
                      <dt className="text-caption text-muted-foreground">{stat.label}</dt>
                    </div>
                  ))}
                </dl>
              )}
              {needsStartDate && (
                <div className="space-y-1.5">
                  <Label htmlFor="program-start-date">
                    Start date <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="program-start-date"
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                  <p className="text-caption text-muted-foreground">
                    The client&apos;s sessions are dated from this day.
                  </p>
                </div>
              )}
              {!isOnDemand && !hasClient && (
                <p className="text-caption text-muted-foreground">
                  You&apos;ll pick a start date when you assign it to a client.
                </p>
              )}
              {!isOnDemand && scheduleSummary.durationWeeks === 0 && (
                <p className="text-caption text-muted-foreground">
                  The schedule follows the weeks and days you add in the builder.
                </p>
              )}
            </SectionCard>

            {clinics && (
              <SectionCard title="Visibility" size="compact">
                <ClinicVisibilitySelector
                  clinics={clinics}
                  value={selectedOrganizationIds}
                  onChange={setSelectedOrganizationIds}
                />
              </SectionCard>
            )}

            <SectionCard title="Organization" icon={Tags} size="compact" contentClassName="space-y-4">
              <div className="space-y-1.5">
                <Label>Body area</Label>
                <TagListInput
                  values={bodyAreas}
                  onChange={setBodyAreas}
                  placeholder="Add body area..."
                  suggestions={BODY_AREA_SUGGESTIONS}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Goal</Label>
                <TagListInput
                  values={goals}
                  onChange={setGoals}
                  placeholder="Add goal..."
                  suggestions={GOAL_SUGGESTIONS}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Activity / sport</Label>
                <TagListInput
                  values={activities}
                  onChange={setActivities}
                  placeholder="Add activity..."
                  suggestions={ACTIVITY_SUGGESTIONS}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Tags</Label>
                <TagListInput values={tags} onChange={setTags} placeholder="Add a tag..." />
              </div>
              {collections && collections.length > 0 && (
                <div className="space-y-2 border-t border-border pt-4">
                  <Label id="program-collections-label">Collections</Label>
                  <div role="group" aria-labelledby="program-collections-label" className="flex flex-wrap gap-1.5">
                    {collections.map((c) => {
                      const on = selectedCollectionIds.includes(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          aria-pressed={on}
                          onClick={() =>
                            setSelectedCollectionIds((prev) =>
                              on ? prev.filter((id) => id !== c.id) : [...prev, c.id]
                            )
                          }
                          className={cn(
                            "inline-flex h-7 items-center rounded-full border px-3 text-label transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
                            on
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground"
                          )}
                        >
                          {c.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="Equipment"
              icon={Dumbbell}
              size="compact"
              contentClassName="space-y-3"
              action={
                <Button type="button" variant="ghost" size="sm" onClick={autoDetectEquipment}>
                  <Sparkles />
                  Auto-detect
                </Button>
              }
            >
              {equipment.length === 0 ? (
                <p className="text-caption text-muted-foreground">
                  None yet. Add items below, or auto-detect them from the exercises in this program.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {equipment.map((item) => (
                    <Badge key={item} variant="secondary" className="h-7 gap-1 pr-1 text-sm">
                      {item}
                      {/* Visible glyph stays small; the hit area is 32px via the
                          negative-margin halo so the chip itself doesn't grow. */}
                      <button
                        type="button"
                        onClick={() => removeEquipmentItem(item)}
                        aria-label={`Remove ${item}`}
                        className="relative inline-flex size-5 items-center justify-center rounded-full outline-none after:absolute after:-inset-1.5 hover:bg-muted-foreground/20 focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  ref={equipmentInputRef}
                  value={equipmentInput}
                  onChange={(e) => setEquipmentInput(e.target.value)}
                  onKeyDown={handleEquipmentKeyDown}
                  placeholder="e.g. Resistance band"
                  aria-label="Add equipment"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    addEquipmentItem(equipmentInput);
                    setEquipmentInput("");
                    equipmentInputRef.current?.focus();
                  }}
                >
                  Add
                </Button>
              </div>
            </SectionCard>
          </aside>

          <div className="min-w-0 xl:col-start-1 xl:row-start-2">
            <ProgramBuilder
              workouts={workouts}
              onChange={setWorkouts}
              exerciseLibrary={exercises}
              organizationOrganizationId={organizationOrganizationId}
              exerciseSourcePreference={exerciseSourcePreference}
            />
          </div>
        </div>
      </form>

      <ConfirmDialog
        open={syncConfirmOpen}
        onOpenChange={setSyncConfirmOpen}
        title="Save changes to master program?"
        description="This will overwrite the master template's weeks, days, sections, exercises, and sets with what's currently in this client's program. The template's name, description, and tags won't change. This can't be undone."
        confirmLabel="Save to master"
        variant="destructive"
        onConfirm={() => {
          setSyncConfirmOpen(false);
          handleSyncToMaster();
        }}
      />
    </Form>
  );
}
