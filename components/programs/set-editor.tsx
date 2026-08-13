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

interface Props {
  sets: ExerciseSetInput[];
  activityType?: "STRENGTH" | "RUN" | "INTERVAL_RUN";
  onChange: (sets: ExerciseSetInput[]) => void;
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
      <div className="space-y-1.5">
        <div className="grid grid-cols-[minmax(70px,1fr)_minmax(110px,1.4fr)_minmax(90px,1fr)_minmax(80px,1fr)_minmax(60px,1fr)_40px] gap-2 text-xs text-muted-foreground font-medium px-1">
          <span>Distance</span>
          <span>Duration</span>
          <span>Pace</span>
          <span>HR Zone</span>
          <span>RPE</span>
          <span></span>
        </div>
        {sets.map((set, si) => (
          <div key={si} className="grid grid-cols-[minmax(70px,1fr)_minmax(110px,1.4fr)_minmax(90px,1fr)_minmax(80px,1fr)_minmax(60px,1fr)_40px] gap-2 items-center">
            <Input
              type="number"
              value={set.targetDistance ?? ""}
              onChange={(e) => updateSet(si, "targetDistance", e.target.value ? parseFloat(e.target.value) : null)}
              className="h-8 text-xs"
              placeholder="mi"
              min={0}
              step={0.1}
            />
            <div className="flex gap-1">
              <Input
                type="number"
                value={set.targetDuration ?? ""}
                onChange={(e) => updateSet(si, "targetDuration", e.target.value ? parseInt(e.target.value) : null)}
                className="h-8 text-xs w-full"
                placeholder="Duration"
                min={0}
              />
              <Select value={set.targetDurationUnit || "SEC"} onValueChange={(v) => updateSet(si, "targetDurationUnit", v)}>
                <SelectTrigger className="h-8 text-xs w-16 shrink-0"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SEC">sec</SelectItem>
                  <SelectItem value="MIN">min</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Input
              value={set.targetPace ?? ""}
              onChange={(e) => updateSet(si, "targetPace", e.target.value || null)}
              className="h-8 text-xs"
              placeholder="9:30/mi"
            />
            <Input
              value={set.targetHrZone ?? ""}
              onChange={(e) => updateSet(si, "targetHrZone", e.target.value || null)}
              className="h-8 text-xs"
              placeholder="Zone 2"
            />
            <Input
              type="number"
              value={set.targetRPE ?? ""}
              onChange={(e) => updateSet(si, "targetRPE", e.target.value ? parseInt(e.target.value) : null)}
              className="h-8 text-xs"
              placeholder="RPE"
              min={1}
              max={10}
            />
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeSet(si)} disabled={sets.length <= 1}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
        <Button variant="ghost" size="sm" onClick={addSet} className="text-xs h-7">
          <Plus className="mr-1 h-3 w-3" /> Add Set
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {/* Header row */}
      <div className="grid grid-cols-[100px_minmax(70px,1fr)_minmax(70px,1fr)_minmax(110px,1.4fr)_minmax(60px,1fr)_40px] gap-2 text-xs text-muted-foreground font-medium px-1">
        <span>Type</span>
        <span>Reps</span>
        <span>Weight</span>
        <span>Duration</span>
        <span>RPE</span>
        <span></span>
      </div>
      {sets.map((set, si) => (
        <div
          key={si}
          className="grid grid-cols-[100px_minmax(70px,1fr)_minmax(70px,1fr)_minmax(110px,1.4fr)_minmax(60px,1fr)_40px] gap-2 items-center"
        >
          <Select
            value={set.setType}
            onValueChange={(v) => updateSet(si, "setType", v)}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="NORMAL">Normal</SelectItem>
              <SelectItem value="WARMUP">Warmup</SelectItem>
              <SelectItem value="DROP_SET">Drop</SelectItem>
              <SelectItem value="FAILURE">Failure</SelectItem>
            </SelectContent>
          </Select>
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
            className="h-8 text-xs"
            placeholder="Reps"
            min={0}
          />
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
            className="h-8 text-xs"
            placeholder="lbs"
            min={0}
            step={2.5}
          />
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
              className="h-8 text-xs w-full"
              placeholder="Duration"
              min={0}
            />
            <Select
              value={set.targetDurationUnit || "SEC"}
              onValueChange={(v) => updateSet(si, "targetDurationUnit", v)}
            >
              <SelectTrigger className="h-8 text-xs w-16 shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SEC">sec</SelectItem>
                <SelectItem value="MIN">min</SelectItem>
              </SelectContent>
            </Select>
          </div>
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
            className="h-8 text-xs"
            placeholder="RPE"
            min={1}
            max={10}
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={() => removeSet(si)}
            disabled={sets.length <= 1}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      ))}
      <Button variant="ghost" size="sm" onClick={addSet} className="text-xs h-7">
        <Plus className="mr-1 h-3 w-3" /> Add Set
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
        <div key={si} className="flex items-center gap-2 border rounded-md p-2">
          <span className="text-[10px] font-semibold uppercase text-muted-foreground w-16 shrink-0">
            {SEGMENT_LABEL[set.setType] ?? set.setType}
          </span>
          {set.setType === "WORK" && (
            <Input
              type="number"
              value={set.repeatCount ?? ""}
              onChange={(e) => updateSegment(si, "repeatCount", e.target.value ? parseInt(e.target.value) : null)}
              className="h-8 text-xs w-14"
              placeholder="×N"
              min={1}
            />
          )}
          <Input
            type="number"
            value={set.targetDistance ?? ""}
            onChange={(e) => updateSegment(si, "targetDistance", e.target.value ? parseFloat(e.target.value) : null)}
            className="h-8 text-xs w-20"
            placeholder="mi"
            step={0.05}
          />
          <Input
            type="number"
            value={set.targetDuration ?? ""}
            onChange={(e) => updateSegment(si, "targetDuration", e.target.value ? parseInt(e.target.value) : null)}
            className="h-8 text-xs w-20"
            placeholder="Duration"
          />
          <Select value={set.targetDurationUnit || "SEC"} onValueChange={(v) => updateSegment(si, "targetDurationUnit", v)}>
            <SelectTrigger className="h-8 text-xs w-16 shrink-0"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="SEC">sec</SelectItem>
              <SelectItem value="MIN">min</SelectItem>
            </SelectContent>
          </Select>
          {set.setType === "WORK" && (
            <Input
              value={set.targetPace ?? ""}
              onChange={(e) => updateSegment(si, "targetPace", e.target.value || null)}
              className="h-8 text-xs flex-1"
              placeholder="Target pace (e.g. 7:30/mi)"
            />
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive ml-auto" onClick={() => removeSegment(si)}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => addSegment("WARMUP")} className="text-xs h-7">
          <Plus className="mr-1 h-3 w-3" /> Warm-up
        </Button>
        <Button variant="outline" size="sm" onClick={() => addSegment("WORK")} className="text-xs h-7">
          <Plus className="mr-1 h-3 w-3" /> Work interval
        </Button>
        <Button variant="outline" size="sm" onClick={() => addSegment("RECOVERY")} className="text-xs h-7">
          <Plus className="mr-1 h-3 w-3" /> Recovery
        </Button>
        <Button variant="outline" size="sm" onClick={() => addSegment("COOLDOWN")} className="text-xs h-7">
          <Plus className="mr-1 h-3 w-3" /> Cool-down
        </Button>
      </div>
    </div>
  );
}
