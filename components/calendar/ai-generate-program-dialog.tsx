"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { FormField } from "@/components/shared/form-section";
import { cn } from "@/lib/utils";
import { NATIVE_SELECT_CLASS } from "@/lib/ui/native-select";
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
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b border-border px-4 pt-5 pb-4 sm:px-6">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-brand" aria-hidden />
            Generate program with AI
          </DialogTitle>
          <DialogDescription>
            Program starts{" "}
            <span className="font-medium text-foreground">
              {format(initialDate, "EEEE, MMMM d, yyyy")}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-5 px-4 py-5 sm:px-6">
            {/* Program Goals */}
            <FormField label="Program goals" required>
              <div role="group" aria-label="Program goals" className="flex flex-wrap gap-2">
                {FITNESS_GOALS.map((goal) => (
                  <Button
                    key={goal}
                    type="button"
                    variant={selectedGoals.includes(goal) ? "default" : "outline"}
                    size="sm"
                    aria-pressed={selectedGoals.includes(goal)}
                    onClick={() => toggleGoal(goal)}
                  >
                    {goal}
                  </Button>
                ))}
              </div>
            </FormField>

            {/* Difficulty */}
            <FormField label="Difficulty level">
              <div role="group" aria-label="Difficulty level" className="flex flex-wrap gap-2">
                {DIFFICULTY_LEVELS.map((d) => (
                  <Button
                    key={d.value}
                    type="button"
                    variant={difficulty === d.value ? "default" : "outline"}
                    size="sm"
                    aria-pressed={difficulty === d.value}
                    onClick={() => setDifficulty(d.value)}
                  >
                    {d.label}
                  </Button>
                ))}
              </div>
            </FormField>

            {/* Duration + Days Per Week */}
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Session duration (minutes)" htmlFor="ai-generate-duration">
                <select
                  id="ai-generate-duration"
                  className={NATIVE_SELECT_CLASS}
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                >
                  {[15, 20, 25, 30, 45, 60].map((m) => (
                    <option key={m} value={m}>{m} minutes</option>
                  ))}
                </select>
              </FormField>
              <FormField label="Days per week" htmlFor="ai-generate-days">
                <select
                  id="ai-generate-days"
                  className={NATIVE_SELECT_CLASS}
                  value={daysPerWeek}
                  onChange={(e) => setDaysPerWeek(Number(e.target.value))}
                >
                  {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                    <option key={d} value={d}>{d} {d === 1 ? "day" : "days"}</option>
                  ))}
                </select>
              </FormField>
            </div>

            {/* Circuit Structure */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-label text-foreground">Circuit structure</p>
                  <p className="mt-0.5 text-caption">
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
                  <Plus className="size-4" />
                  Add circuit
                </Button>
              </div>
              <div className="flex flex-col gap-2">
                {circuits.map((circuit, index) => (
                  <div
                    key={circuit.id}
                    className="flex items-center gap-2 rounded-lg border border-border bg-surface-muted p-3"
                  >
                    {/* Reorder buttons */}
                    <div className="flex shrink-0 flex-col">
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => moveCircuit(circuit.id, "up")}
                        aria-label={`Move circuit ${index + 1} up`}
                        className="flex size-4 items-center justify-center rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-20"
                      >
                        <ChevronUp className="size-3" />
                      </button>
                      <button
                        type="button"
                        disabled={index === circuits.length - 1}
                        onClick={() => moveCircuit(circuit.id, "down")}
                        aria-label={`Move circuit ${index + 1} down`}
                        className="flex size-4 items-center justify-center rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-20"
                      >
                        <ChevronDown className="size-3" />
                      </button>
                    </div>

                    <span className="w-5 shrink-0 text-caption font-medium">
                      {index + 1}
                    </span>
                    <Input
                      value={circuit.name}
                      onChange={(e) => updateCircuit(circuit.id, { name: e.target.value })}
                      placeholder="Circuit name"
                      aria-label={`Circuit ${index + 1} name`}
                      className="h-8 min-w-0 flex-1 text-body"
                    />
                    <select
                      value={circuit.focusType}
                      onChange={(e) => updateCircuit(circuit.id, { focusType: e.target.value })}
                      aria-label={`Circuit ${index + 1} focus`}
                      className={cn(NATIVE_SELECT_CLASS, "h-8 min-w-0 flex-1 px-2")}
                    >
                      {CIRCUIT_FOCUS_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <div className="flex shrink-0 items-center gap-1">
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
                        aria-label={`Circuit ${index + 1} exercise count`}
                        className="h-8 w-14 text-center text-body"
                      />
                      <span className="whitespace-nowrap text-caption">ex.</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
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
                        aria-label={`Circuit ${index + 1} sets`}
                        className="h-8 w-14 text-center text-body disabled:opacity-50"
                        title="Sets / Cycles"
                      />
                      <span className="whitespace-nowrap text-caption">sets</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
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
                        aria-label={`Circuit ${index + 1} rest between sets (seconds)`}
                        className="h-8 w-14 text-center text-body disabled:opacity-50"
                        title="Rest between sets (seconds)"
                      />
                      <span className="whitespace-nowrap text-caption">s rest</span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeCircuit(circuit.id)}
                      aria-label={`Remove circuit ${index + 1}`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* Training Days */}
            <FormField
              label="Training days"
              hint={`Select exactly ${daysPerWeek} day${daysPerWeek === 1 ? "" : "s"}.`}
            >
              <div role="group" aria-label="Training days" className="flex flex-wrap gap-2">
                {weekDays.map((day) => (
                  <Button
                    key={day}
                    type="button"
                    variant={selectedWeekdays.includes(day) ? "default" : "outline"}
                    size="sm"
                    aria-pressed={selectedWeekdays.includes(day)}
                    onClick={() => toggleWeekday(day)}
                  >
                    {day.slice(0, 3)}
                  </Button>
                ))}
              </div>
            </FormField>

            {/* Subjective */}
            <FormField label="Client subjective" htmlFor="ai-generate-subjective">
              <Textarea
                id="ai-generate-subjective"
                rows={4}
                placeholder="Paste the full subjective report (pain behavior, aggravating factors, functional limits, goals, etc.)"
                value={subjective}
                onChange={(e) => setSubjective(e.target.value)}
              />
            </FormField>

            {/* Trainer prompt */}
            <FormField label="Program instructions (optional)" htmlFor="ai-generate-prompt">
              <Textarea
                id="ai-generate-prompt"
                rows={2}
                placeholder='e.g. "Act as a DPT and create a 1-week PT progression for this subjective."'
                value={trainerPrompt}
                onChange={(e) => setTrainerPrompt(e.target.value)}
              />
            </FormField>

            {/* Notes */}
            <FormField label="Additional notes (optional)" htmlFor="ai-generate-notes">
              <Textarea
                id="ai-generate-notes"
                rows={2}
                placeholder="Any specific requirements, modifications, or goals..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </FormField>
          </div>
        </div>

        <DialogFooter className="shrink-0 border-t border-border bg-surface-muted px-4 py-4 sm:px-6">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button onClick={handleGenerate} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="size-4" />
                Generate program
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
