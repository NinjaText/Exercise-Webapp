"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { DIFFICULTY_LEVELS, FITNESS_GOALS } from "@/lib/utils/constants";
import { generateProgramAction } from "@/actions/program-actions";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";

interface CircuitConfig {
  id: string;
  name: string;
  focusType: string;
  exerciseCount: number;
  rounds: number;
  restBetweenRounds: number | null;
}

const CIRCUIT_FOCUS_OPTIONS = [
  { value: "WARMUP", label: "Warm Up" },
  { value: "LOWER_BODY", label: "Lower Body" },
  { value: "UPPER_BODY", label: "Upper Body" },
  { value: "CORE", label: "Core" },
  { value: "FULL_BODY", label: "Full Body" },
  { value: "BALANCE", label: "Balance" },
  { value: "FLEXIBILITY", label: "Flexibility / Mobility" },
  { value: "COOLDOWN", label: "Cool Down" },
  { value: "CARDIO", label: "Cardio" },
];

interface AiGenerateProgramDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  initialDate: Date;
  onSuccess: () => void;
}

export function AiGenerateProgramDialog({
  open,
  onOpenChange,
  clientId,
  initialDate,
  onSuccess,
}: AiGenerateProgramDialogProps) {
  const weekDays = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ] as const;

  const [loading, setLoading] = useState(false);
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState("BEGINNER");
  const [duration, setDuration] = useState(25);
  const [daysPerWeek, setDaysPerWeek] = useState(3);
  const [selectedWeekdays, setSelectedWeekdays] = useState<string[]>([
    "Monday",
    "Wednesday",
    "Friday",
  ]);
  const [circuits, setCircuits] = useState<CircuitConfig[]>([
    { id: "1", name: "Warm Up", focusType: "WARMUP", exerciseCount: 4, rounds: 1, restBetweenRounds: null },
    { id: "2", name: "Main Circuit", focusType: "FULL_BODY", exerciseCount: 6, rounds: 3, restBetweenRounds: 60 },
    { id: "3", name: "Cool Down", focusType: "COOLDOWN", exerciseCount: 3, rounds: 1, restBetweenRounds: null },
  ]);
  const [subjective, setSubjective] = useState("");
  const [trainerPrompt, setTrainerPrompt] = useState("");
  const [notes, setNotes] = useState("");

  function toggleGoal(goal: string) {
    setSelectedGoals((prev) =>
      prev.includes(goal) ? prev.filter((g) => g !== goal) : [...prev, goal]
    );
  }

  function toggleWeekday(day: string) {
    setSelectedWeekdays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  function addCircuit() {
    setCircuits((prev) => [
      ...prev,
      { id: Date.now().toString(), name: "Circuit", focusType: "FULL_BODY", exerciseCount: 4, rounds: 3, restBetweenRounds: 60 },
    ]);
  }

  function removeCircuit(id: string) {
    if (circuits.length <= 1) {
      toast.error("At least one circuit is required");
      return;
    }
    setCircuits((prev) => prev.filter((c) => c.id !== id));
  }

  function updateCircuit(id: string, updates: Partial<Omit<CircuitConfig, "id">>) {
    setCircuits((prev) => prev.map((c) => {
      if (c.id !== id) return c;
      const merged = { ...c, ...updates };
      if (updates.focusType && (updates.focusType === "WARMUP" || updates.focusType === "COOLDOWN")) {
        merged.rounds = 1;
        merged.restBetweenRounds = null;
      }
      return merged;
    }));
  }

  function moveCircuit(id: string, direction: "up" | "down") {
    setCircuits((prev) => {
      const idx = prev.findIndex((c) => c.id === id);
      if (idx === -1) return prev;
      const newIdx = direction === "up" ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      return next;
    });
  }

  async function handleGenerate() {
    if (selectedGoals.length === 0) {
      toast.error("Please select at least one program goal");
      return;
    }
    if (selectedWeekdays.length === 0) {
      toast.error("Please select at least one training day");
      return;
    }
    if (selectedWeekdays.length !== daysPerWeek) {
      toast.error("Days per week must match your selected weekdays");
      return;
    }

    setLoading(true);
    const result = await generateProgramAction({
      clientId,
      programGoals: selectedGoals,
      durationMinutes: duration,
      daysPerWeek,
      circuits: circuits.map(({ name, focusType, exerciseCount, rounds, restBetweenRounds }) => ({
        name,
        focusType,
        exerciseCount,
        rounds,
        restBetweenRounds,
      })),
      preferredWeekdays: selectedWeekdays,
      difficultyLevel: difficulty,
      startDate: format(initialDate, "yyyy-MM-dd"),
      additionalNotes: notes || undefined,
      subjective: subjective || undefined,
      trainerPrompt: trainerPrompt || undefined,
    });
    setLoading(false);

    if (result.success) {
      toast.success("Program generated and scheduled!");
      onOpenChange(false);
      onSuccess();
    } else {
      toast.error(result.error);
    }
  }

  const totalExercises = circuits.reduce((sum, c) => sum + c.exerciseCount, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl flex flex-col p-0 max-h-[90vh] overflow-hidden">
        <DialogHeader className="px-4 pt-6 pb-4 border-b shrink-0 sm:px-6">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-600" />
            Generate Program with AI
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Program starts{" "}
            <span className="font-medium text-foreground">
              {format(initialDate, "EEEE, MMMM d, yyyy")}
            </span>
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="px-4 py-5 space-y-5 sm:px-6">
            {/* Program Goals */}
            <div className="space-y-2">
              <Label>Program Goals *</Label>
              <div className="flex flex-wrap gap-2">
                {FITNESS_GOALS.map((goal) => (
                  <Button
                    key={goal}
                    type="button"
                    variant={selectedGoals.includes(goal) ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleGoal(goal)}
                  >
                    {goal}
                  </Button>
                ))}
              </div>
            </div>

            {/* Difficulty */}
            <div className="space-y-2">
              <Label>Difficulty Level</Label>
              <div className="flex gap-2">
                {DIFFICULTY_LEVELS.map((d) => (
                  <Button
                    key={d.value}
                    type="button"
                    variant={difficulty === d.value ? "default" : "outline"}
                    size="sm"
                    onClick={() => setDifficulty(d.value)}
                  >
                    {d.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Duration + Days Per Week */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Session Duration (minutes)</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                >
                  {[15, 20, 25, 30, 45, 60].map((m) => (
                    <option key={m} value={m}>{m} minutes</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Days Per Week</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={daysPerWeek}
                  onChange={(e) => setDaysPerWeek(Number(e.target.value))}
                >
                  {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                    <option key={d} value={d}>{d} {d === 1 ? "day" : "days"}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Circuit Structure */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Circuit Structure</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Total:{" "}
                    <span className="font-medium text-foreground">
                      {totalExercises} exercises
                    </span>{" "}
                    per session
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addCircuit}
                  className="shrink-0"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Circuit
                </Button>
              </div>
              <div className="space-y-2">
                {circuits.map((circuit, index) => (
                  <div
                    key={circuit.id}
                    className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3"
                  >
                    {/* Reorder buttons */}
                    <div className="flex flex-col shrink-0">
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => moveCircuit(circuit.id, "up")}
                        className="h-4 w-4 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed"
                      >
                        <ChevronUp className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        disabled={index === circuits.length - 1}
                        onClick={() => moveCircuit(circuit.id, "down")}
                        className="h-4 w-4 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed"
                      >
                        <ChevronDown className="h-3 w-3" />
                      </button>
                    </div>

                    <span className="text-xs font-medium text-muted-foreground w-5 shrink-0">
                      {index + 1}
                    </span>
                    <Input
                      value={circuit.name}
                      onChange={(e) => updateCircuit(circuit.id, { name: e.target.value })}
                      placeholder="Circuit name"
                      className="h-8 text-sm flex-1 min-w-0"
                    />
                    <select
                      value={circuit.focusType}
                      onChange={(e) => updateCircuit(circuit.id, { focusType: e.target.value })}
                      className="h-8 rounded-md border border-input bg-background px-2 py-1 text-sm flex-1 min-w-0"
                    >
                      {CIRCUIT_FOCUS_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <div className="flex items-center gap-1 shrink-0">
                      <Input
                        type="number"
                        min={1}
                        max={12}
                        value={circuit.exerciseCount}
                        onChange={(e) =>
                          updateCircuit(circuit.id, {
                            exerciseCount: Math.max(1, Math.min(12, Number(e.target.value))),
                          })
                        }
                        className="h-8 w-14 text-sm text-center"
                      />
                      <span className="text-xs text-muted-foreground whitespace-nowrap">ex.</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Input
                        type="number"
                        min={1}
                        max={8}
                        value={circuit.rounds}
                        onChange={(e) =>
                          updateCircuit(circuit.id, {
                            rounds: Math.max(1, Math.min(8, Number(e.target.value))),
                          })
                        }
                        disabled={circuit.focusType === "WARMUP" || circuit.focusType === "COOLDOWN"}
                        className="h-8 w-14 text-sm text-center disabled:opacity-50"
                        title="Sets / Cycles"
                      />
                      <span className="text-xs text-muted-foreground whitespace-nowrap">sets</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Input
                        type="number"
                        min={0}
                        max={300}
                        value={circuit.restBetweenRounds ?? ""}
                        placeholder="—"
                        onChange={(e) =>
                          updateCircuit(circuit.id, {
                            restBetweenRounds: e.target.value === "" ? null : Math.max(0, Math.min(300, Number(e.target.value))),
                          })
                        }
                        disabled={circuit.rounds <= 1}
                        className="h-8 w-14 text-sm text-center disabled:opacity-50"
                        title="Rest between sets (seconds)"
                      />
                      <span className="text-xs text-muted-foreground whitespace-nowrap">s rest</span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeCircuit(circuit.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* Training Days */}
            <div className="space-y-2">
              <Label>Training Days</Label>
              <div className="flex flex-wrap gap-2">
                {weekDays.map((day) => (
                  <Button
                    key={day}
                    type="button"
                    variant={selectedWeekdays.includes(day) ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleWeekday(day)}
                  >
                    {day.slice(0, 3)}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Select exactly {daysPerWeek} day{daysPerWeek === 1 ? "" : "s"}.
              </p>
            </div>

            {/* Subjective */}
            <div className="space-y-2">
              <Label>Client Subjective</Label>
              <Textarea
                rows={4}
                placeholder="Paste the full subjective report (pain behavior, aggravating factors, functional limits, goals, etc.)"
                value={subjective}
                onChange={(e) => setSubjective(e.target.value)}
              />
            </div>

            {/* Trainer prompt */}
            <div className="space-y-2">
              <Label>
                Program Instructions{" "}
                <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Textarea
                rows={2}
                placeholder='e.g. "Act as a DPT and create a 1-week PT progression for this subjective."'
                value={trainerPrompt}
                onChange={(e) => setTrainerPrompt(e.target.value)}
              />
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>
                Additional Notes{" "}
                <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Textarea
                rows={2}
                placeholder="Any specific requirements, modifications, or goals..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="px-4 py-4 border-t shrink-0 sm:px-6">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={loading}
            className="bg-violet-600 hover:bg-violet-700 text-white"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Generate Program
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
