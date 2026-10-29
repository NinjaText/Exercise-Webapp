"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import type { ExerciseSetInput } from "@/lib/validators/program";
import { cn } from "@/lib/utils";

// Base UI's <Select.Value> renders the raw value without an items map.
const SET_TYPE_ITEMS = { NORMAL: "Normal", WARMUP: "Warm-up", DROP_SET: "Drop", FAILURE: "Failure" };
const DURATION_UNIT_ITEMS = { SEC: "sec", MIN: "min" };

interface Props {
  sets: ExerciseSetInput[];
  activityType?: "STRENGTH" | "RUN" | "INTERVAL_RUN";
  onChange: (sets: ExerciseSetInput[]) => void;
}

// Phones (< sm) render each set as a bordered 2-column card with a label on
// every field; from sm up the wrappers below collapse (`sm:contents`) so the
// cells fall back into the single-row column grid with one header row.
const STRENGTH_GRID =
  "sm:grid-cols-[24px_100px_minmax(70px,1fr)_minmax(70px,1fr)_minmax(110px,1.4fr)_minmax(60px,1fr)_32px]";
const RUN_GRID =
  "sm:grid-cols-[minmax(70px,1fr)_minmax(110px,1.4fr)_minmax(90px,1fr)_minmax(80px,1fr)_minmax(60px,1fr)_40px]";
const ROW_CARD =
  "grid grid-cols-2 items-end gap-2 rounded-lg border border-border p-2.5 sm:items-center sm:rounded-none sm:border-0 sm:p-0";
// 16px text on phones: iOS zooms into inputs below that.
const FIELD = "h-10 text-base sm:h-8 sm:text-sm";
const TRIGGER = "h-10 text-sm sm:h-8";
const DELETE_BUTTON =
  "size-9 shrink-0 text-muted-foreground hover:text-destructive sm:order-last sm:size-7";
const ADD_BUTTON = "h-9 text-xs sm:h-7";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 sm:contents">
      <span className="text-caption sm:hidden">{label}</span>
      {children}
    </label>
  );
}

export function SetEditor({ sets, activityType = "STRENGTH", onChange }: Props) {
  function addSet() {
    const last = sets[sets.length - 1];
    onChange([
      ...sets,
      {
        orderIndex: sets.length,
        setType: last?.setType || "NORMAL",
        targetReps: last?.targetReps || 10,
        targetWeight: last?.targetWeight || null,
        targetDuration: last?.targetDuration || null,
        targetDurationUnit: last?.targetDurationUnit || "SEC",
        targetDistance: last?.targetDistance || null,
        targetRPE: last?.targetRPE || null,
        restAfter: last?.restAfter || null,
      },
    ]);
  }

  function removeSet(idx: number) {
    if (sets.length <= 1) return;
    onChange(
      sets.filter((_, i) => i !== idx).map((s, i) => ({ ...s, orderIndex: i }))
    );
  }

  function updateSet(idx: number, field: string, value: number | string | null) {
    const next = [...sets];
    next[idx] = { ...next[idx], [field]: value };
    onChange(next);
  }

  if (activityType === "INTERVAL_RUN") {
    return <IntervalSetEditor sets={sets} onChange={onChange} />; // added in Task 21
  }

  if (activityType === "RUN") {
    return (
      <div className="space-y-1.5 sm:overflow-x-auto">
        <div className="space-y-2 sm:min-w-[560px] sm:space-y-1.5">
          <div className={cn("hidden px-1 text-xs font-medium text-muted-foreground sm:grid", RUN_GRID)}>
            <span>Distance</span>
            <span>Duration</span>
            <span>Pace</span>
            <span>HR Zone</span>
            <span>RPE</span>
            <span></span>
          </div>
          {sets.map((set, si) => (
            <div key={si} className={cn(ROW_CARD, RUN_GRID)}>
              <div className="col-span-2 flex items-center justify-between sm:contents">
                <span className="text-label text-foreground sm:hidden">Set {si + 1}</span>
                <Button variant="ghost" size="icon" className={DELETE_BUTTON} onClick={() => removeSet(si)} disabled={sets.length <= 1} aria-label={`Remove set ${si + 1}`}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
              <Field label="Distance">
                <Input
                  type="number"
                  value={set.targetDistance ?? ""}
                  onChange={(e) => updateSet(si, "targetDistance", e.target.value ? parseFloat(e.target.value) : null)}
                  className={FIELD}
                  placeholder="mi"
                  min={0}
                  step={0.1}
                />
              </Field>
              <Field label="Duration">
                <div className="flex gap-1">
                  <Input
                    type="number"
                    value={set.targetDuration ?? ""}
                    onChange={(e) => updateSet(si, "targetDuration", e.target.value ? parseInt(e.target.value) : null)}
                    className={cn(FIELD, "w-full min-w-0")}
                    placeholder="Duration"
                    min={0}
                  />
                  <Select items={DURATION_UNIT_ITEMS} value={set.targetDurationUnit || "SEC"} onValueChange={(v) => updateSet(si, "targetDurationUnit", v)}>
                    <SelectTrigger className={cn(TRIGGER, "w-[4.5rem] shrink-0")}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SEC">sec</SelectItem>
                      <SelectItem value="MIN">min</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </Field>
              <Field label="Pace">
                <Input
                  value={set.targetPace ?? ""}
                  onChange={(e) => updateSet(si, "targetPace", e.target.value || null)}
                  className={FIELD}
                  placeholder="9:30/mi"
                />
              </Field>
              <Field label="HR Zone">
                <Input
                  value={set.targetHrZone ?? ""}
                  onChange={(e) => updateSet(si, "targetHrZone", e.target.value || null)}
                  className={FIELD}
                  placeholder="Zone 2"
                />
              </Field>
              <Field label="RPE">
                <Input
                  type="number"
                  value={set.targetRPE ?? ""}
                  onChange={(e) => updateSet(si, "targetRPE", e.target.value ? parseInt(e.target.value) : null)}
                  className={FIELD}
                  placeholder="RPE"
                  min={1}
                  max={10}
                />
              </Field>
            </div>
          ))}
        </div>
        <Button variant="ghost" size="sm" onClick={addSet} className={ADD_BUTTON}>
          <Plus className="mr-1 h-3 w-3" /> Add set
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5 sm:overflow-x-auto">
      <div className="space-y-2 sm:min-w-[540px] sm:space-y-1.5">
        {/* Header row (phones label each field inline instead) */}
        <div className={cn("hidden px-1 text-xs font-medium text-muted-foreground sm:grid", STRENGTH_GRID)}>
          <span className="text-center">Set</span>
          <span>Type</span>
          <span>Reps</span>
          <span>Weight</span>
          <span>Duration</span>
          <span>RPE</span>
          <span></span>
        </div>
        {sets.map((set, si) => (
          <div key={si} className={cn(ROW_CARD, STRENGTH_GRID)}>
            {/* Phones: "Set N · type · delete" header line; sm+: separate grid cells. */}
            <div className="col-span-2 flex items-center gap-2 sm:contents">
              <span className="shrink-0 text-caption font-medium text-muted-foreground tabular-nums sm:text-center">
                <span className="sm:hidden">Set </span>{si + 1}
              </span>
              <Select
                items={SET_TYPE_ITEMS}
                value={set.setType}
                onValueChange={(v) => updateSet(si, "setType", v)}
              >
                <SelectTrigger className={cn(TRIGGER, "min-w-0 flex-1 sm:flex-none")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NORMAL">Normal</SelectItem>
                  <SelectItem value="WARMUP">Warm-up</SelectItem>
                  <SelectItem value="DROP_SET">Drop</SelectItem>
                  <SelectItem value="FAILURE">Failure</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="icon"
                className={DELETE_BUTTON}
                onClick={() => removeSet(si)}
                disabled={sets.length <= 1}
                aria-label={`Remove set ${si + 1}`}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
            <Field label="Reps">
              <Input
                type="number"
                value={set.targetReps ?? ""}
                onChange={(e) =>
                  updateSet(
                    si,
                    "targetReps",
                    e.target.value ? parseInt(e.target.value) : null
                  )
                }
                className={FIELD}
                placeholder="Reps"
                min={0}
              />
            </Field>
            <Field label="Weight">
              <Input
                type="number"
                value={set.targetWeight ?? ""}
                onChange={(e) =>
                  updateSet(
                    si,
                    "targetWeight",
                    e.target.value ? parseFloat(e.target.value) : null
                  )
                }
                className={FIELD}
                placeholder="lbs"
                min={0}
                step={2.5}
              />
            </Field>
            <Field label="Duration">
              <div className="flex gap-1">
                <Input
                  type="number"
                  value={set.targetDuration ?? ""}
                  onChange={(e) =>
                    updateSet(
                      si,
                      "targetDuration",
                      e.target.value ? parseInt(e.target.value) : null
                    )
                  }
                  className={cn(FIELD, "w-full min-w-0")}
                  placeholder="Duration"
                  min={0}
                />
                <Select
                  items={DURATION_UNIT_ITEMS}
                  value={set.targetDurationUnit || "SEC"}
                  onValueChange={(v) => updateSet(si, "targetDurationUnit", v)}
                >
                  <SelectTrigger className={cn(TRIGGER, "w-[4.5rem] shrink-0")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SEC">sec</SelectItem>
                    <SelectItem value="MIN">min</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </Field>
            <Field label="RPE">
              <Input
                type="number"
                value={set.targetRPE ?? ""}
                onChange={(e) =>
                  updateSet(
                    si,
                    "targetRPE",
                    e.target.value ? parseInt(e.target.value) : null
                  )
                }
                className={FIELD}
                placeholder="RPE"
                min={1}
                max={10}
              />
            </Field>
          </div>
        ))}
      </div>
      <Button variant="ghost" size="sm" onClick={addSet} className={ADD_BUTTON}>
        <Plus className="mr-1 h-3 w-3" /> Add set
      </Button>
    </div>
  );
}

function segmentDefaults(setType: string): Partial<ExerciseSetInput> {
  if (setType === "WARMUP" || setType === "COOLDOWN") {
    return { targetDistance: 1, targetDurationUnit: "MIN" };
  }
  if (setType === "WORK") {
    return { targetDistance: 0.25, targetPace: null, repeatCount: 6 };
  }
  return { targetDuration: 90, targetDurationUnit: "SEC" }; // RECOVERY
}

function IntervalSetEditor({ sets, onChange }: { sets: ExerciseSetInput[]; onChange: (sets: ExerciseSetInput[]) => void }) {
  function addSegment(setType: "WARMUP" | "WORK" | "RECOVERY" | "COOLDOWN") {
    onChange([
      ...sets,
      { orderIndex: sets.length, setType, ...segmentDefaults(setType) },
    ]);
  }

  function removeSegment(idx: number) {
    onChange(sets.filter((_, i) => i !== idx).map((s, i) => ({ ...s, orderIndex: i })));
  }

  function updateSegment(idx: number, field: string, value: number | string | null) {
    const next = [...sets];
    next[idx] = { ...next[idx], [field]: value };
    onChange(next);
  }

  const SEGMENT_LABEL: Record<string, string> = {
    WARMUP: "Warm-up", WORK: "Work", RECOVERY: "Recovery", COOLDOWN: "Cool-down",
  };

  return (
    <div className="space-y-1.5">
      {sets.map((set, si) => (
        <div key={si} className="flex flex-wrap items-center gap-2 rounded-md border p-2 sm:flex-nowrap">
          <span className="text-[10px] font-semibold uppercase text-muted-foreground w-16 shrink-0">
            {SEGMENT_LABEL[set.setType] ?? set.setType}
          </span>
          {set.setType === "WORK" && (
            <Input
              type="number"
              value={set.repeatCount ?? ""}
              onChange={(e) => updateSegment(si, "repeatCount", e.target.value ? parseInt(e.target.value) : null)}
              className={cn(FIELD, "w-14")}
              placeholder="×N"
              min={1}
            />
          )}
          <Input
            type="number"
            value={set.targetDistance ?? ""}
            onChange={(e) => updateSegment(si, "targetDistance", e.target.value ? parseFloat(e.target.value) : null)}
            className={cn(FIELD, "w-20")}
            placeholder="mi"
            step={0.05}
          />
          <Input
            type="number"
            value={set.targetDuration ?? ""}
            onChange={(e) => updateSegment(si, "targetDuration", e.target.value ? parseInt(e.target.value) : null)}
            className={cn(FIELD, "w-20")}
            placeholder="Duration"
          />
          <Select items={DURATION_UNIT_ITEMS} value={set.targetDurationUnit || "SEC"} onValueChange={(v) => updateSegment(si, "targetDurationUnit", v)}>
            <SelectTrigger className={cn(TRIGGER, "w-[4.5rem] shrink-0")}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="SEC">sec</SelectItem>
              <SelectItem value="MIN">min</SelectItem>
            </SelectContent>
          </Select>
          {set.setType === "WORK" && (
            <Input
              value={set.targetPace ?? ""}
              onChange={(e) => updateSegment(si, "targetPace", e.target.value || null)}
              className={cn(FIELD, "min-w-0 basis-full sm:basis-auto sm:flex-1")}
              placeholder="Target pace (e.g. 7:30/mi)"
            />
          )}
          <Button variant="ghost" size="icon" className="ml-auto size-9 text-muted-foreground hover:text-destructive sm:size-7" onClick={() => removeSegment(si)} aria-label="Remove segment">
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => addSegment("WARMUP")} className={ADD_BUTTON}>
          <Plus className="mr-1 h-3 w-3" /> Warm-up
        </Button>
        <Button variant="outline" size="sm" onClick={() => addSegment("WORK")} className={ADD_BUTTON}>
          <Plus className="mr-1 h-3 w-3" /> Work interval
        </Button>
        <Button variant="outline" size="sm" onClick={() => addSegment("RECOVERY")} className={ADD_BUTTON}>
          <Plus className="mr-1 h-3 w-3" /> Recovery
        </Button>
        <Button variant="outline" size="sm" onClick={() => addSegment("COOLDOWN")} className={ADD_BUTTON}>
          <Plus className="mr-1 h-3 w-3" /> Cool-down
        </Button>
      </div>
    </div>
  );
}
