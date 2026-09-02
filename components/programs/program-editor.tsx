"use client";

import { useState, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
import { Dumbbell, Sparkles, Tag, X } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { type ExerciseSourcePreference } from "@/lib/utils/exercise-picker";

const BODY_AREA_SUGGESTIONS = ["Shoulder", "Elbow", "Wrist/Hand", "Chest", "Back", "Hip", "Knee", "Ankle/Foot", "Core"];
const GOAL_SUGGESTIONS = ["Strength", "Mobility", "Endurance", "Weight Loss", "Rehab", "Power"];
const ACTIVITY_SUGGESTIONS = ["Tennis", "Golf", "Running", "Basketball", "Soccer", "Swimming", "General Fitness"];

// Base UI's <Select.Value> renders the raw value string unless the root is
// given an items map — without this it shows "PERFORMANCE" / "UNSET" etc.
// instead of the item's label.
const PROGRAM_TYPE_ITEMS = {
  UNSET: "Select program type",
  PERFORMANCE: "🏋️ Performance / Athletic",
  CLINICAL: "🩺 Rehab / Clinical",
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

export function ProgramEditor({ program, exercises, onSave, redirectTo, organizationOrganizationId, clinics, collections, exerciseSourcePreference }: Props) {
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

  const form = useForm<CreateProgramInput>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(createProgramSchema) as any,
    defaultValues: {
      name: (program?.name as string) || "",
      description: (program?.description as string) || "",
      isTemplate: (program?.isTemplate as boolean) || false,
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
      data.durationWeeks = scheduleSummary.durationWeeks || null;
      data.daysPerWeek = scheduleSummary.daysPerWeek || null;
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
          router.push(redirectTo ?? (result.data?.id ? `/programs/${result.data.id}` : "/programs"));
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
          router.push(`/programs/${result.data.id}`);
        } else {
          toast.error(result.error);
        }
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Metadata Card */}
        <Card>
          <CardHeader>
            <CardTitle>Program Details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Program Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., 12-Week Strength Program"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="programType"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Program Type</FormLabel>
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
                        <SelectItem value="PERFORMANCE">🏋️ Performance / Athletic</SelectItem>
                        <SelectItem value="CLINICAL">🩺 Rehab / Clinical</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Program description..."
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormItem className="sm:col-span-2">
              <FormLabel>Schedule</FormLabel>
              <div className="flex flex-wrap items-center gap-2">
                {scheduleSummary.durationWeeks > 0 ? (
                  <>
                    <Badge variant="secondary" className="text-sm">
                      {scheduleSummary.durationWeeks} week
                      {scheduleSummary.durationWeeks !== 1 ? "s" : ""}
                    </Badge>
                    <Badge variant="secondary" className="text-sm">
                      up to {scheduleSummary.daysPerWeek} day
                      {scheduleSummary.daysPerWeek !== 1 ? "s" : ""}/week
                    </Badge>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Add weeks and days in the builder below to set the schedule.
                  </p>
                )}
              </div>
            </FormItem>
            <FormField
              control={form.control}
              name="isTemplate"
              render={({ field }) => (
                <FormItem className="flex items-center gap-3 sm:col-span-2">
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <FormLabel className="mt-0!">Save as template</FormLabel>
                </FormItem>
              )}
            />
            {clinics && (
              <div className="sm:col-span-2">
                <ClinicVisibilitySelector
                  clinics={clinics}
                  value={selectedOrganizationIds}
                  onChange={setSelectedOrganizationIds}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Categorization Card */}
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 space-y-0">
            <Tag className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Categorization</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Body Area</Label>
                <TagListInput
                  values={bodyAreas}
                  onChange={setBodyAreas}
                  placeholder="Add body area..."
                  suggestions={BODY_AREA_SUGGESTIONS}
                />
              </div>
              <div className="space-y-2">
                <Label>Goal</Label>
                <TagListInput
                  values={goals}
                  onChange={setGoals}
                  placeholder="Add goal..."
                  suggestions={GOAL_SUGGESTIONS}
                />
              </div>
              <div className="space-y-2">
                <Label>Activity / Sport</Label>
                <TagListInput
                  values={activities}
                  onChange={setActivities}
                  placeholder="Add activity..."
                  suggestions={ACTIVITY_SUGGESTIONS}
                />
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Level</Label>
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
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Tags</Label>
                <TagListInput values={tags} onChange={setTags} placeholder="Add a tag..." />
              </div>
            </div>

            {collections && collections.length > 0 && (
              <div className="space-y-2 border-t pt-5">
                <Label>Collections</Label>
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {collections.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                      <Checkbox
                        checked={selectedCollectionIds.includes(c.id)}
                        onCheckedChange={(checked) =>
                          setSelectedCollectionIds((prev) =>
                            checked ? [...prev, c.id] : prev.filter((id) => id !== c.id)
                          )
                        }
                      />
                      {c.name}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Equipment Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <div className="flex items-center gap-2">
              <Dumbbell className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Equipment Needed</CardTitle>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={autoDetectEquipment}
              className="gap-1.5 text-xs"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Auto-detect from exercises
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Current equipment tags */}
            <div className="flex flex-wrap gap-2 min-h-7">
              {equipment.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No equipment added yet. Type below or use auto-detect.
                </p>
              )}
              {equipment.map((item) => (
                <Badge
                  key={item}
                  variant="secondary"
                  className="gap-1 pr-1 text-sm"
                >
                  {item}
                  <button
                    type="button"
                    onClick={() => removeEquipmentItem(item)}
                    className="ml-0.5 rounded-full hover:bg-muted-foreground/20 p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            {/* Manual entry */}
            <div className="flex gap-2">
              <Input
                ref={equipmentInputRef}
                value={equipmentInput}
                onChange={(e) => setEquipmentInput(e.target.value)}
                onKeyDown={handleEquipmentKeyDown}
                placeholder="Add item (e.g. Resistance Band) and press Enter"
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
          </CardContent>
        </Card>

        {/* Program Builder */}
        <ProgramBuilder
          workouts={workouts}
          onChange={setWorkouts}
          exerciseLibrary={exercises}
          organizationOrganizationId={organizationOrganizationId}
          exerciseSourcePreference={exerciseSourcePreference}
        />

        {/* Submit */}
        <div className="flex justify-end gap-3">
          {isAssignedCopyOfTemplate && (
            <Button
              type="button"
              variant="outline"
              disabled={syncingToMaster}
              onClick={() => setSyncConfirmOpen(true)}
            >
              {syncingToMaster ? "Saving..." : "Save changes to master program"}
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving
              ? "Saving..."
              : program
                ? "Update Program"
                : "Create Program"}
          </Button>
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
