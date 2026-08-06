"use client";

import { useState, useRef } from "react";
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
import { Dumbbell, Sparkles, X } from "lucide-react";
import {
  createProgramSchema,
  type CreateProgramInput,
  type WorkoutInput,
} from "@/lib/validators/program";
import {
  createProgramAction,
  updateProgramAction,
} from "@/actions/program-actions";
import { ProgramBuilder } from "./program-builder";
import { ClinicVisibilitySelector } from "./clinic-visibility-selector";
import { type ExerciseSourcePreference } from "@/lib/utils/exercise-picker";

interface Props {
  program?: Record<string, unknown>;
  exercises: {
    id: string;
    name: string;
    bodyRegion: string[];
    difficultyLevel: string;
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

export function ProgramEditor({ program, exercises, onSave, redirectTo, organizationOrganizationId, clinics, exerciseSourcePreference }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
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

  const form = useForm<CreateProgramInput>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(createProgramSchema) as any,
    defaultValues: {
      name: (program?.name as string) || "",
      description: (program?.description as string) || "",
      isTemplate: (program?.isTemplate as boolean) || false,
      durationWeeks: (program?.durationWeeks as number) || undefined,
      daysPerWeek: (program?.daysPerWeek as number) || undefined,
      tags: (program?.tags as string[]) || [],
      equipmentRequired: [],
      workouts: [],
    },
  });

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
            <FormField
              control={form.control}
              name="durationWeeks"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Duration (weeks)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      max={52}
                      {...field}
                      value={field.value ?? ""}
                      onChange={(e) =>
                        field.onChange(
                          e.target.value ? parseInt(e.target.value) : undefined
                        )
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="daysPerWeek"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Days per week</FormLabel>
                  <FormControl>
                    <Select
                      value={field.value?.toString() || ""}
                      onValueChange={(v) => field.onChange(v ? parseInt(v) : undefined)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                          <SelectItem key={n} value={n.toString()}>
                            {n}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
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
    </Form>
  );
}
