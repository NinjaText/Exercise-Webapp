"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DIFFICULTY_LEVELS, REHAB_GOALS, PERFORMANCE_GOALS } from "@/lib/utils/constants";
import { generateProgramAction } from "@/actions/program-actions";
import { toast } from "sonner";
import { Check, ChevronDown, ChevronUp, ChevronsUpDown, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { getDistinctEquipmentAction } from "@/actions/program-actions";
import { PlanReviewStep } from "@/components/programs/plan-review-step";
import { ClinicVisibilitySelector } from "@/components/programs/clinic-visibility-selector";
import type { ClinicalPlan, ProgramMode } from "@/lib/ai/types/program-generation";

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

interface ClientSummary {
  id: string;
  firstName: string;
  lastName: string;
  primaryDiagnosis?: string | null;
  painScore?: number | null;
  limitations?: string | null;
  availableEquipment?: string[];
}

export type GenerateExercisesHandler = (params: {
  clientId: string | null;
  programGoals: string[];
  availableEquipment: string[];
  startDate?: string | null;
  durationMinutes: number;
  daysPerWeek: number;
  durationWeeks: number;
  circuits: { name: string; focusType: string; exerciseCount: number; rounds: number; restBetweenRounds: number | null }[];
  preferredWeekdays: string[];
  difficultyLevel: string;
  weekPlan: unknown[];
  organizationIds?: string[];
}) => Promise<{ success: boolean; error?: string; data?: string }>;

interface GenerateProgramFormProps {
  clients: ClientSummary[];
  initialClientId?: string;
  onGenerateExercises?: GenerateExercisesHandler;
  redirectTo?: string;
  clinics?: { id: string; name: string }[];
}

type GenerateState = 'CONFIGURE' | 'PLANNING' | 'REVIEWING' | 'GENERATING';

export function GenerateProgramForm({ clients, initialClientId, onGenerateExercises, redirectTo, clinics }: GenerateProgramFormProps) {
  const weekDays = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ] as const;

  const router = useRouter();
  const [generateState, setGenerateState] = useState<GenerateState>('CONFIGURE');
  const [clinicalPlan, setClinicalPlan] = useState<ClinicalPlan | null>(null);
  const [durationWeeks, setDurationWeeks] = useState(4);
  const [selectedClient, setSelectedClient] = useState(initialClientId ?? "");
  const [programMode, setProgramMode] = useState<ProgramMode>("PERFORMANCE");
  const [programModeTouched, setProgramModeTouched] = useState(false);
  const [selectedOrganizationIds, setSelectedOrganizationIds] = useState<string[]>([]);
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [selectedEquipment, setSelectedEquipment] = useState<string[]>([]);
  const [equipmentOptions, setEquipmentOptions] = useState<string[]>([]);
  const [equipmentOpen, setEquipmentOpen] = useState(false);
  const [startDate, setStartDate] = useState("");
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

  useEffect(() => {
    getDistinctEquipmentAction().then(res => {
      if (res.success) setEquipmentOptions(res.data);
    });
  }, []);

  // Quick client-side guess mirroring hasDocumentedClinicalNeed — good enough
  // for a UI default; the backend's full-profile check still runs whenever
  // no explicit override is sent.
  function guessProgramMode(client: ClientSummary | undefined): ProgramMode {
    if (!client) return "PERFORMANCE";
    const hasClinicalSignal =
      !!client.primaryDiagnosis ||
      (client.painScore != null && client.painScore > 0) ||
      !!client.limitations;
    return hasClinicalSignal ? "CLINICAL" : "PERFORMANCE";
  }

  useEffect(() => {
    if (programModeTouched) return;
    setProgramMode(guessProgramMode(clients.find(c => c.id === selectedClient)));
  }, [selectedClient, clients, programModeTouched]);

  const goalOptions = programMode === "CLINICAL" ? REHAB_GOALS : PERFORMANCE_GOALS;

  // Drop any previously selected goal that doesn't belong to the current
  // program type's list, so a stale invisible selection can't get submitted.
  useEffect(() => {
    const options: readonly string[] = programMode === "CLINICAL" ? REHAB_GOALS : PERFORMANCE_GOALS;
    setSelectedGoals(prev => prev.filter(g => options.includes(g)));
  }, [programMode]);

  function toggleGoal(goal: string) {
    setSelectedGoals(prev =>
      prev.includes(goal) ? prev.filter(g => g !== goal) : [...prev, goal]
    );
  }

  function toggleEquipment(item: string) {
    setSelectedEquipment(prev => {
      if (item === "none") {
        return prev.includes("none") ? [] : ["none"];
      }
      const withoutNone = prev.filter(e => e !== "none");
      return withoutNone.includes(item)
        ? withoutNone.filter(e => e !== item)
        : [...withoutNone, item];
    });
  }

  function toggleWeekday(day: string) {
    setSelectedWeekdays((prev) => {
      if (prev.includes(day)) {
        const next = prev.filter((d) => d !== day);
        return next.length === 0 ? prev : next;
      }
      if (prev.length >= daysPerWeek) {
        return [...prev.slice(1), day];
      }
      return [...prev, day];
    });
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

  async function handleRequestPlan(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (selectedGoals.length === 0) {
      toast.error('Please select at least one program goal');
      return;
    }
    if (selectedClient && !startDate) {
      toast.error('Please select a start date for this client');
      return;
    }
    if (selectedWeekdays.length === 0) {
      toast.error('Please select at least one training day');
      return;
    }

    if (circuits.some(c => c.exerciseCount < 1)) {
      toast.error('Each circuit must have at least 1 exercise');
      return;
    }

    setGenerateState('PLANNING');
    const formData = new FormData(e.currentTarget);

    try {
      const res = await fetch('/api/ai/generate-clinical-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: selectedClient || null,
          programMode,
          programGoals: selectedGoals,
          availableEquipment: selectedEquipment,
          durationWeeks,
          daysPerWeek,
          difficultyLevel: difficulty,
          circuits: circuits.map(({ name, focusType, exerciseCount, rounds, restBetweenRounds }) => ({
            name, focusType, exerciseCount, rounds, restBetweenRounds,
          })),
          preferredWeekdays: selectedWeekdays,
          subjective: (formData.get('subjective') as string) || undefined,
          trainerPrompt: (formData.get('trainerPrompt') as string) || undefined,
          additionalNotes: (formData.get('notes') as string) || undefined,
        }),
      });

      if (!res.ok) throw new Error('Failed to generate program plan');
      const json = await res.json();
      setClinicalPlan(json.data);
      setGenerateState('REVIEWING');
    } catch {
      toast.error('Failed to generate program plan. Please try again.');
      setGenerateState('CONFIGURE');
    }
  }

  async function handleGenerateExercises(approvedPlan: ClinicalPlan) {
    setGenerateState('GENERATING');

    const genParams = {
      clientId: selectedClient || null,
      programMode,
      programGoals: selectedGoals,
      availableEquipment: selectedEquipment,
      startDate: selectedClient ? startDate : null,
      durationMinutes: duration,
      daysPerWeek,
      durationWeeks,
      circuits: circuits.map(({ name, focusType, exerciseCount, rounds, restBetweenRounds }) => ({
        name, focusType, exerciseCount, rounds, restBetweenRounds,
      })),
      preferredWeekdays: selectedWeekdays,
      difficultyLevel: difficulty,
      weekPlan: approvedPlan.weeklyPlan,
      clinicalAssessment: approvedPlan.clinicalAssessment,
      organizationIds: selectedOrganizationIds,
    };

    if (onGenerateExercises) {
      const result = await onGenerateExercises(genParams);
      if (result.success) {
        toast.success('Program generated successfully!');
        router.push(redirectTo ?? (result.data ? `/programs/${result.data}` : '/programs'));
      } else {
        toast.error(result.error);
        setGenerateState('CONFIGURE');
      }
      return;
    }

    const result = await generateProgramAction({
      ...genParams,
      weekPlan: approvedPlan.weeklyPlan,
    });

    if (result.success) {
      toast.success('Program generated successfully!');
      router.push(`/programs/${result.data}`);
    } else {
      toast.error(result.error);
      setGenerateState('CONFIGURE');
    }
  }

  const totalExercises = circuits.reduce((sum, c) => sum + c.exerciseCount, 0);

  const isReviewing = generateState === 'REVIEWING' || generateState === 'GENERATING';

  return (
    <div>
      {isReviewing && clinicalPlan ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-blue-600" />
              {clinicalPlan.programMode === 'PERFORMANCE' ? 'Review Training Plan' : 'Review Clinical Plan'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PlanReviewStep
              plan={clinicalPlan}
              onConfirm={handleGenerateExercises}
              onBack={() => setGenerateState('CONFIGURE')}
              isGenerating={generateState === 'GENERATING'}
            />
          </CardContent>
        </Card>
      ) : (
        <form onSubmit={handleRequestPlan}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-blue-600" />
                AI Program Generator
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Client selector — hidden when no clients available (e.g. admin context) */}
              {clients.length > 0 && (
                <>
                  <div className="space-y-2">
                    <Label>Client <span className="text-muted-foreground font-normal">(optional)</span></Label>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      value={selectedClient}
                      onChange={(e) => setSelectedClient(e.target.value)}
                    >
                      <option value="">No client — general program template</option>
                      {clients.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.firstName} {p.lastName}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Client profile inline summary */}
                  {selectedClient && (() => {
                    const p = clients.find(pt => pt.id === selectedClient)
                    if (!p) return null
                    return (
                      <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm space-y-0.5">
                        <p className="font-medium">{p.firstName} {p.lastName}</p>
                        {p.primaryDiagnosis && (
                          <p className="text-muted-foreground">Dx: {p.primaryDiagnosis}</p>
                        )}
                        {p.painScore != null && (
                          <p className="text-muted-foreground">Pain: {p.painScore}/10</p>
                        )}
                        {p.limitations && (
                          <p className="text-muted-foreground">Limitations: {p.limitations}</p>
                        )}
                      </div>
                    )
                  })()}
                </>
              )}

              {/* Program Type */}
              <div className="space-y-2">
                <Label>Program Type</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={programMode}
                  onChange={(e) => {
                    setProgramMode(e.target.value as ProgramMode);
                    setProgramModeTouched(true);
                  }}
                >
                  <option value="PERFORMANCE">🏋️ Performance / Athletic</option>
                  <option value="CLINICAL">🩺 Rehab / Clinical</option>
                </select>
                <p className="text-xs text-muted-foreground">
                  {programModeTouched ? "Manually set" : "Auto-detected from client profile"} — change if needed
                </p>
              </div>

              {/* Clinic visibility — shown only in admin/global context (clinics provided) */}
              {clinics && (
                <ClinicVisibilitySelector
                  clinics={clinics}
                  value={selectedOrganizationIds}
                  onChange={setSelectedOrganizationIds}
                />
              )}

              {/* Start Date — shown only when a client is selected */}
              {selectedClient && (
                <div className="space-y-2">
                  <Label htmlFor="startDate">
                    Program Start Date <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    min={new Date().toISOString().split("T")[0]}
                  />
                </div>
              )}

              {/* Session Duration + Days Per Week */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Session Duration (minutes)</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    value={daysPerWeek}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setDaysPerWeek(val);
                      setSelectedWeekdays(prev => prev.slice(0, val));
                    }}
                  >
                    {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                      <option key={d} value={d}>{d} {d === 1 ? "day" : "days"}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Program Duration */}
              <div className="space-y-2">
                <Label>Program Duration</Label>
                <div className="flex items-center gap-2 flex-wrap">
                  {[1, 2, 4, 6, 8, 12].map(w => (
                    <Button
                      key={w}
                      type="button"
                      variant={durationWeeks === w ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setDurationWeeks(w)}
                    >
                      {w === 1 && daysPerWeek === 1 ? "1 day" : w === 1 ? "1 wk" : `${w} wks`}
                    </Button>
                  ))}
                  <div className="flex items-center gap-1.5 ml-1">
                    <Input
                      type="number"
                      min={1}
                      max={52}
                      value={durationWeeks}
                      onChange={(e) => {
                        const v = parseInt(e.target.value);
                        if (!isNaN(v) && v >= 1) setDurationWeeks(v);
                      }}
                      className="h-8 w-16 text-sm text-center"
                    />
                    <span className="text-sm text-muted-foreground whitespace-nowrap">weeks</span>
                  </div>
                </div>
              </div>

              {/* Program Goals */}
              <div className="space-y-2">
                <Label>Program Goals *</Label>
                <div className="flex flex-wrap gap-2">
                  {goalOptions.map((goal) => (
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

              {/* Equipment */}
              <div className="space-y-2">
                <Label>Available Equipment</Label>
                <p className="text-xs text-muted-foreground">
                  Only exercises using this equipment (plus bodyweight) will be selected. Leave empty to allow any equipment.
                </p>

                <Popover open={equipmentOpen} onOpenChange={setEquipmentOpen}>
                  <PopoverTrigger
                    render={
                      <Button
                        type="button"
                        variant="outline"
                        role="combobox"
                        className="w-full justify-between font-normal"
                      />
                    }
                  >
                    {selectedEquipment.includes("none")
                      ? "No Equipment (Bodyweight only)"
                      : selectedEquipment.length === 0
                      ? "Select equipment..."
                      : `${selectedEquipment.length} item${selectedEquipment.length === 1 ? "" : "s"} selected`}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search equipment..." />
                      <CommandList>
                        <CommandEmpty>No equipment found.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            key="none"
                            value="none"
                            onSelect={() => toggleEquipment("none")}
                          >
                            <Check
                              className={`mr-2 h-4 w-4 ${
                                selectedEquipment.includes("none") ? "opacity-100" : "opacity-0"
                              }`}
                            />
                            None (Bodyweight only)
                          </CommandItem>
                          {equipmentOptions.map(item => (
                            <CommandItem
                              key={item}
                              value={item}
                              onSelect={() => toggleEquipment(item)}
                            >
                              <Check
                                className={`mr-2 h-4 w-4 ${
                                  selectedEquipment.includes(item) ? "opacity-100" : "opacity-0"
                                }`}
                              />
                              {item}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {selectedEquipment.length > 0 && !selectedEquipment.includes("none") && (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {selectedEquipment.map(item => (
                      <span
                        key={item}
                        className="inline-flex items-center gap-1 rounded-full border bg-secondary px-2.5 py-0.5 text-xs font-medium"
                      >
                        {item}
                        <button
                          type="button"
                          onClick={() => toggleEquipment(item)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Difficulty Level */}
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

              {/* Circuit Structure */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Circuit Structure</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Configure each circuit — name, focus, and exact exercise count.
                      Total: <span className="font-medium text-foreground">{totalExercises} exercises</span> per session.
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
                        className="h-8 rounded-md border border-input bg-background px-2 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring flex-1 min-w-0"
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
                          className="h-8 w-14 text-sm text-center disabled:opacity-50"
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
                <Label htmlFor="subjective">Client Subjective</Label>
                <Textarea
                  id="subjective"
                  name="subjective"
                  rows={6}
                  placeholder="Paste the full subjective report (pain behavior, aggravating factors, functional limits, goals, etc.)"
                />
              </div>

              {/* Trainer prompt */}
              <div className="space-y-2">
                <Label htmlFor="trainerPrompt">Program Instructions (Optional)</Label>
                <Textarea
                  id="trainerPrompt"
                  name="trainerPrompt"
                  rows={3}
                  placeholder='Example: "Focus on progressive overload for a 4-week marathon build-up" or "Act as a DPT and create a 3-day PT progression for this subjective."'
                />
              </div>

              {/* Additional notes */}
              <div className="space-y-2">
                <Label htmlFor="notes">Additional Notes</Label>
                <Textarea
                  id="notes"
                  name="notes"
                  rows={3}
                  placeholder="Any specific requirements, modifications, or goals..."
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => router.back()}>
                  Cancel
                </Button>
                <Button type="submit" disabled={generateState !== 'CONFIGURE'}>
                  {generateState === 'PLANNING' ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Planning...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Plan Program
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      )}
    </div>
  );
}
