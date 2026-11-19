"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/shared/form-section";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DIFFICULTY_LEVELS, REHAB_GOALS, PERFORMANCE_GOALS } from "@/lib/utils/constants";
import { generateProgramAction } from "@/actions/program-actions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { NATIVE_SELECT_CLASS } from "@/lib/ui/native-select";
import { ChevronDown, ChevronUp, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { getDistinctEquipmentAction } from "@/actions/program-actions";
import { PlanReviewStep } from "@/components/programs/plan-review-step";
import { ClinicVisibilitySelector } from "@/components/programs/clinic-visibility-selector";
import {
  ClientDetailsPanel,
  type ClientSummary,
} from "@/components/programs/client-details-panel";
import { mapClientEquipmentToOptions, NO_EQUIPMENT_OPTION } from "@/lib/utils/program-equipment";
import { EQUIPMENT_CATALOG } from "@/lib/utils/equipment-catalog";
import { EquipmentPicker } from "@/components/equipment/equipment-picker";
import { SchedulingTypeSelector } from "@/components/programs/scheduling-type-selector";
import type { ProgramSchedulingTypeValue } from "@/lib/utils/program-scheduling";
import type { ClinicalPlan, ProgramMode } from "@/lib/ai/types/program-generation";

export type { ClientSummary };

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
  schedulingType?: ProgramSchedulingTypeValue;
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
  const [equipmentTouched, setEquipmentTouched] = useState(false);
  const [equipmentOptions, setEquipmentOptions] = useState<string[]>([]);
  const [startDate, setStartDate] = useState("");
  // Scheduled = a dated program with generated sessions; On-Demand = an
  // anytime "Resource" with no schedule at all.
  const [schedulingType, setSchedulingType] =
    useState<ProgramSchedulingTypeValue>("SCHEDULED");
  const isOnDemand = schedulingType === "ON_DEMAND";
  const [difficulty, setDifficulty] = useState("BEGINNER");
  const [duration, setDuration] = useState(25);
  const [daysPerWeek, setDaysPerWeek] = useState(3);
  // A Resource's session count is tracked separately from the scheduled
  // days-per-week so switching scheduling type never carries one mode's
  // number into the other. A Resource previously always generated exactly
  // 1 session, so that stays the default here.
  const [onDemandSessionCount, setOnDemandSessionCount] = useState(1);
  // Same split for weeks: a Resource defaults to a single week, but a trainer
  // can build a multi-week one (e.g. a 4-week mobility series).
  const [onDemandWeeks, setOnDemandWeeks] = useState(1);
  const [selectedWeekdays, setSelectedWeekdays] = useState<string[]>([
    "Monday",
    "Wednesday",
    "Friday",
  ]);
  const [subjective, setSubjective] = useState("");
  const [trainerPrompt, setTrainerPrompt] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [circuits, setCircuits] = useState<CircuitConfig[]>([
    { id: "1", name: "Warm Up", focusType: "WARMUP", exerciseCount: 4, rounds: 1, restBetweenRounds: null },
    { id: "2", name: "Main Circuit", focusType: "FULL_BODY", exerciseCount: 6, rounds: 3, restBetweenRounds: 60 },
    { id: "3", name: "Cool Down", focusType: "COOLDOWN", exerciseCount: 3, rounds: 1, restBetweenRounds: null },
  ]);

  // A Resource has no schedule — no start date, no weekdays. Its weeks and days
  // only shape how many workouts it contains; the client still picks when to
  // do each one.
  const effectiveDurationWeeks = isOnDemand ? onDemandWeeks : durationWeeks;
  const setEffectiveDurationWeeks = isOnDemand ? setOnDemandWeeks : setDurationWeeks;
  const effectiveDaysPerWeek = isOnDemand ? onDemandSessionCount : daysPerWeek;

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

  const selectedClientDetails = selectedClient
    ? clients.find(c => c.id === selectedClient)
    : undefined;

  // Pre-fill the equipment picker from the client's own profile. Mirrors the
  // programMode guard above: once the trainer edits the selection themselves we
  // stop overwriting it, even if they switch client afterwards. Re-runs when the
  // library options land so client spellings snap onto the canonical ones.
  useEffect(() => {
    if (equipmentTouched) return;
    setSelectedEquipment(
      // Catalogue spellings count as known options too, so a client's
      // "Home Gym" items pre-fill as-is.
      mapClientEquipmentToOptions(selectedClientDetails?.availableEquipment, [
        ...EQUIPMENT_CATALOG,
        ...equipmentOptions,
      ])
    );
  }, [selectedClientDetails, equipmentOptions, equipmentTouched]);

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
    // A resource has no schedule, so neither a start date nor training days
    // apply — even when a client is pre-selected.
    if (!isOnDemand && selectedClient && !startDate) {
      toast.error('Please select a start date for this client');
      return;
    }
    if (!isOnDemand && selectedWeekdays.length === 0) {
      toast.error('Please select at least one training day');
      return;
    }

    if (circuits.some(c => c.exerciseCount < 1)) {
      toast.error('Each circuit must have at least 1 exercise');
      return;
    }

    setGenerateState('PLANNING');
    try {
      const res = await fetch('/api/ai/generate-clinical-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: selectedClient || null,
          programMode,
          programGoals: selectedGoals,
          availableEquipment: selectedEquipment,
          durationWeeks: effectiveDurationWeeks,
          daysPerWeek: effectiveDaysPerWeek,
          difficultyLevel: difficulty,
          circuits: circuits.map(({ name, focusType, exerciseCount, rounds, restBetweenRounds }) => ({
            name, focusType, exerciseCount, rounds, restBetweenRounds,
          })),
          preferredWeekdays: isOnDemand ? [] : selectedWeekdays,
          subjective: subjective || undefined,
          trainerPrompt: trainerPrompt || undefined,
          additionalNotes: additionalNotes || undefined,
        }),
      });

      if (!res.ok) {
        // 429 = AI allowance used up: show the server's message (reset date, upgrade hint).
        const body = res.status === 429 ? await res.json().catch(() => null) : null;
        throw new Error(typeof body?.error === 'string' ? body.error : 'Failed to generate program plan. Please try again.');
      }
      const json = await res.json();
      setClinicalPlan(json.data);
      setGenerateState('REVIEWING');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate program plan. Please try again.');
      setGenerateState('CONFIGURE');
    }
  }

  async function handleGenerateExercises(approvedPlan: ClinicalPlan) {
    setGenerateState('GENERATING');

    const genParams = {
      clientId: selectedClient || null,
      programMode,
      schedulingType,
      programGoals: selectedGoals,
      availableEquipment: selectedEquipment,
      startDate: selectedClient && !isOnDemand ? startDate : null,
      durationMinutes: duration,
      daysPerWeek: effectiveDaysPerWeek,
      durationWeeks: effectiveDurationWeeks,
      circuits: circuits.map(({ name, focusType, exerciseCount, rounds, restBetweenRounds }) => ({
        name, focusType, exerciseCount, rounds, restBetweenRounds,
      })),
      preferredWeekdays: isOnDemand ? [] : selectedWeekdays,
      difficultyLevel: difficulty,
      weekPlan: approvedPlan.weeklyPlan,
      clinicalAssessment: approvedPlan.clinicalAssessment,
      subjective: subjective || undefined,
      trainerPrompt: trainerPrompt || undefined,
      additionalNotes: additionalNotes || undefined,
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

  if (isReviewing && clinicalPlan) {
    return (
      <div className="w-full max-w-3xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-brand" />
              {clinicalPlan.programMode === 'PERFORMANCE' ? 'Review training plan' : 'Review clinical plan'}
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
      </div>
    );
  }

  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const clientName = selectedClientDetails
    ? `${selectedClientDetails.firstName} ${selectedClientDetails.lastName}`
    : "No client (template)";
  const scheduleLine = isOnDemand
    ? `On-demand · ${plural(effectiveDurationWeeks, "week")} · ${plural(effectiveDaysPerWeek, "workout")}${effectiveDurationWeeks > 1 ? "/week" : ""}`
    : `${plural(effectiveDurationWeeks, "week")} · ${plural(daysPerWeek, "day")}/week`;
  const difficultyLabel = DIFFICULTY_LEVELS.find((d) => d.value === difficulty)?.label ?? difficulty;
  const summaryRows: { label: string; value: string; muted?: boolean }[] = [
    { label: "Client", value: clientName, muted: !selectedClientDetails },
    { label: "Type", value: programMode === "CLINICAL" ? "Rehab / Clinical" : "Performance / Athletic" },
    { label: "Schedule", value: scheduleLine },
    { label: "Sessions", value: `${duration} min · ${plural(totalExercises, "exercise")}` },
    { label: "Level", value: difficultyLabel },
    {
      label: "Goals",
      value: selectedGoals.length ? selectedGoals.join(", ") : "None selected",
      muted: selectedGoals.length === 0,
    },
    {
      label: "Equipment",
      value: selectedEquipment.length ? plural(selectedEquipment.length, "item") : "Any",
      muted: selectedEquipment.length === 0,
    },
  ];

  return (
    <form
      onSubmit={handleRequestPlan}
      className="grid w-full grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]"
    >
      <div className="flex min-w-0 flex-col gap-6">
        {/* 1 — who and what */}
        <GenerateSection step={1} title="Client and goals" description="Who the program is for and what it should achieve.">
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Client selector — hidden when no clients available (e.g. admin context). */}
            {clients.length > 0 && (
              <FormField label="Client" htmlFor="generate-client" hint="Optional. Leave empty to build a reusable template.">
                <select
                  id="generate-client"
                  className={NATIVE_SELECT_CLASS}
                  value={selectedClient}
                  onChange={(e) => setSelectedClient(e.target.value)}
                >
                  <option value="">No client (template)</option>
                  {clients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.firstName} {p.lastName}
                    </option>
                  ))}
                </select>
              </FormField>
            )}
            <FormField
              label="Program type"
              htmlFor="generate-program-type"
              hint={selectedClient && !programModeTouched ? "Suggested from the client's profile." : undefined}
            >
              <select
                id="generate-program-type"
                aria-describedby={selectedClient && !programModeTouched ? "generate-program-type-hint" : undefined}
                className={NATIVE_SELECT_CLASS}
                value={programMode}
                onChange={(e) => {
                  setProgramMode(e.target.value as ProgramMode);
                  setProgramModeTouched(true);
                }}
              >
                <option value="PERFORMANCE">Performance / Athletic</option>
                <option value="CLINICAL">Rehab / Clinical</option>
              </select>
            </FormField>
          </div>

          <FormField label="Goals" required>
            <div role="group" aria-label="Program goals" className="flex flex-wrap gap-2">
              {goalOptions.map((goal) => (
                <ChoiceChip key={goal} selected={selectedGoals.includes(goal)} onClick={() => toggleGoal(goal)}>
                  {goal}
                </ChoiceChip>
              ))}
            </div>
          </FormField>

          <FormField label="Level">
            <div role="group" aria-label="Difficulty level" className="flex flex-wrap gap-2">
              {DIFFICULTY_LEVELS.map((d) => (
                <ChoiceChip key={d.value} selected={difficulty === d.value} onClick={() => setDifficulty(d.value)}>
                  {d.label}
                </ChoiceChip>
              ))}
            </div>
          </FormField>

          {/* Clinic visibility — shown only in admin/global context (clinics provided) */}
          {clinics && (
            <ClinicVisibilitySelector
              clinics={clinics}
              value={selectedOrganizationIds}
              onChange={setSelectedOrganizationIds}
            />
          )}
        </GenerateSection>

        {/* 2 — when */}
        <GenerateSection step={2} title="Schedule" description="How long it runs and how often the client trains.">
          <SchedulingTypeSelector value={schedulingType} onChange={setSchedulingType} />

          {/* Start Date — shown only for a scheduled program with a client */}
          {selectedClient && !isOnDemand && (
            <FormField label="Start date" htmlFor="startDate" required className="sm:max-w-xs">
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
              />
            </FormField>
          )}

          {/* Program Duration — for a resource this only sets how many weeks of workouts it contains */}
          <FormField label="Length">
            <div role="group" aria-label="Program duration" className="flex flex-wrap items-center gap-2">
              {[1, 2, 4, 6, 8, 12].map(w => (
                <ChoiceChip key={w} selected={effectiveDurationWeeks === w} onClick={() => setEffectiveDurationWeeks(w)}>
                  {w === 1 && effectiveDaysPerWeek === 1 ? "1 day" : w === 1 ? "1 week" : `${w} weeks`}
                </ChoiceChip>
              ))}
              <label className="ml-1 flex items-center gap-1.5 text-body text-muted-foreground">
                <Input
                  type="number"
                  aria-label="Program duration in weeks"
                  min={1}
                  max={52}
                  value={effectiveDurationWeeks}
                  onChange={(e) => {
                    const v = parseInt(e.target.value);
                    if (!isNaN(v) && v >= 1) setEffectiveDurationWeeks(v);
                  }}
                  className="h-10 w-16 text-center text-base sm:h-8 sm:text-body"
                />
                <span className="whitespace-nowrap">weeks</span>
              </label>
            </div>
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label={isOnDemand && effectiveDurationWeeks === 1 ? "Number of workouts" : isOnDemand ? "Workouts per week" : "Days per week"}
              htmlFor="generate-days"
              hint={isOnDemand ? "The client picks when to do each one." : undefined}
            >
              <select
                id="generate-days"
                aria-describedby={isOnDemand ? "generate-days-hint" : undefined}
                className={NATIVE_SELECT_CLASS}
                value={isOnDemand ? onDemandSessionCount : daysPerWeek}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (isOnDemand) {
                    setOnDemandSessionCount(val);
                  } else {
                    setDaysPerWeek(val);
                    setSelectedWeekdays((prev) => prev.slice(0, val));
                  }
                }}
              >
                {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Session length" htmlFor="generate-session-duration">
              <select
                id="generate-session-duration"
                className={NATIVE_SELECT_CLASS}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
              >
                {[15, 20, 25, 30, 45, 60].map((m) => (
                  <option key={m} value={m}>{m} minutes</option>
                ))}
              </select>
            </FormField>
          </div>

          {/* Training Days — a resource has no weekly cadence */}
          {!isOnDemand && (
            <FormField
              label="Training days"
              hint={
                selectedWeekdays.length === daysPerWeek
                  ? undefined
                  : `Pick ${daysPerWeek} day${daysPerWeek === 1 ? "" : "s"} (${selectedWeekdays.length} selected).`
              }
            >
              <div role="group" aria-label="Training days" className="flex flex-wrap gap-2">
                {weekDays.map((day) => (
                  <ChoiceChip
                    key={day}
                    selected={selectedWeekdays.includes(day)}
                    onClick={() => toggleWeekday(day)}
                    className="min-w-12 justify-center"
                  >
                    {day.slice(0, 3)}
                  </ChoiceChip>
                ))}
              </div>
            </FormField>
          )}
        </GenerateSection>

        {/* 3 — with what */}
        <GenerateSection
          step={3}
          title="Equipment"
          description={
            !equipmentTouched && selectedEquipment.length > 0 && selectedClientDetails
              ? `Pre-filled from ${selectedClientDetails.firstName}'s profile. Only exercises using this equipment (plus bodyweight) are picked.`
              : "Only exercises using this equipment (plus bodyweight) are picked. Leave empty to allow anything."
          }
        >
          <EquipmentPicker
            value={selectedEquipment}
            noneValue={NO_EQUIPMENT_OPTION}
            extraItems={equipmentOptions}
            onChange={(items) => {
              setEquipmentTouched(true);
              setSelectedEquipment(items);
            }}
          />
        </GenerateSection>

        {/* 4 — guidance for the AI */}
        <GenerateSection step={4} title="Notes for the AI" description="Optional, but the more context you give, the better the program.">
          <FormField label="Client subjective" htmlFor="subjective">
            <Textarea
              id="subjective"
              name="subjective"
              rows={4}
              placeholder="Paste the subjective report: pain behaviour, aggravating factors, functional limits, goals…"
              value={subjective}
              onChange={(e) => setSubjective(e.target.value)}
            />
          </FormField>
          <FormField label="Program instructions" htmlFor="trainerPrompt">
            <Textarea
              id="trainerPrompt"
              name="trainerPrompt"
              rows={3}
              placeholder='e.g. "Progressive overload for a 4-week marathon build-up"'
              value={trainerPrompt}
              onChange={(e) => setTrainerPrompt(e.target.value)}
            />
          </FormField>

          {/* Fine-tuning most trainers never need: closed by default. */}
          <details className="group rounded-lg border border-border [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span>
                <span className="block text-label text-foreground">Advanced</span>
                <span className="block text-caption text-muted-foreground">
                  Session structure ({plural(circuits.length, "circuit")}, {plural(totalExercises, "exercise")}) and extra notes
                </span>
              </span>
              <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none" />
            </summary>
            <div className="space-y-5 border-t border-border px-4 py-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-label text-foreground">Session structure</p>
                    <p className="mt-0.5 text-caption">
                      Each circuit&apos;s focus and exercise count. Total: <span className="font-medium text-foreground">{plural(totalExercises, "exercise")}</span> per session.
                    </p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={addCircuit} className="shrink-0">
                    <Plus />
                    Add circuit
                  </Button>
                </div>

                <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                  {circuits.map((circuit, index) => (
                    <div
                      key={circuit.id}
                      // Phones wrap into three rows: name + delete, focus, then the
                      // counts (max-sm:order-2 pushes focus/counts after delete).
                      className="flex flex-wrap items-center gap-2 bg-surface p-2.5 sm:flex-nowrap"
                    >
                      <div className="flex shrink-0 flex-col">
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() => moveCircuit(circuit.id, "up")}
                          aria-label={`Move circuit ${index + 1} up`}
                          className="flex size-6 items-center justify-center text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-20 sm:size-4"
                        >
                          <ChevronUp className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          disabled={index === circuits.length - 1}
                          onClick={() => moveCircuit(circuit.id, "down")}
                          aria-label={`Move circuit ${index + 1} down`}
                          className="flex size-6 items-center justify-center text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-20 sm:size-4"
                        >
                          <ChevronDown className="h-3 w-3" />
                        </button>
                      </div>

                      <Input
                        value={circuit.name}
                        onChange={(e) => updateCircuit(circuit.id, { name: e.target.value })}
                        placeholder="Circuit name"
                        aria-label={`Circuit ${index + 1} name`}
                        className="h-10 min-w-0 flex-1 text-base sm:h-8 sm:text-body"
                      />

                      <select
                        value={circuit.focusType}
                        onChange={(e) => updateCircuit(circuit.id, { focusType: e.target.value })}
                        aria-label={`Circuit ${index + 1} focus`}
                        className={cn(NATIVE_SELECT_CLASS, "h-10 min-w-0 flex-1 px-2 max-sm:order-2 max-sm:basis-full sm:h-8")}
                      >
                        {CIRCUIT_FOCUS_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>

                      <CircuitNumber
                        label={`Circuit ${index + 1} exercise count`}
                        unit="ex."
                        min={1}
                        max={12}
                        value={circuit.exerciseCount}
                        onChange={(v) => updateCircuit(circuit.id, { exerciseCount: Math.max(1, Math.min(12, v ?? 1)) })}
                      />
                      <CircuitNumber
                        label={`Circuit ${index + 1} sets`}
                        unit="sets"
                        min={1}
                        max={8}
                        value={circuit.rounds}
                        onChange={(v) => updateCircuit(circuit.id, { rounds: Math.max(1, Math.min(8, v ?? 1)) })}
                      />
                      <CircuitNumber
                        label={`Circuit ${index + 1} rest between sets (seconds)`}
                        unit="s rest"
                        min={0}
                        max={300}
                        value={circuit.restBetweenRounds}
                        disabled={circuit.rounds <= 1}
                        onChange={(v) => updateCircuit(circuit.id, { restBetweenRounds: v == null ? null : Math.max(0, Math.min(300, v)) })}
                      />

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-10 shrink-0 text-muted-foreground hover:text-destructive sm:size-8"
                        onClick={() => removeCircuit(circuit.id)}
                        aria-label={`Remove circuit ${index + 1}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <FormField label="Additional notes" htmlFor="notes">
                <Textarea
                  id="notes"
                  name="notes"
                  rows={3}
                  placeholder="Any specific requirements or modifications…"
                  value={additionalNotes}
                  onChange={(e) => setAdditionalNotes(e.target.value)}
                />
              </FormField>
            </div>
          </details>
        </GenerateSection>
      </div>

      {/* Summary rail: what the AI will build, and the one button that starts it. */}
      <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-6">
        <Card className="gap-0 py-0">
          <div className="border-b border-border px-5 py-4">
            <h2 className="flex items-center gap-2 text-heading text-foreground">
              <Sparkles className="size-4 text-brand" aria-hidden />
              Summary
            </h2>
            <p className="mt-0.5 text-caption text-muted-foreground">
              You&apos;ll review the plan before any exercises are picked.
            </p>
          </div>
          <dl className="divide-y divide-border px-5">
            {summaryRows.map((row) => (
              <div key={row.label} className="flex gap-3 py-2.5">
                <dt className="w-20 shrink-0 text-caption text-muted-foreground">{row.label}</dt>
                <dd className={cn("min-w-0 flex-1 text-label", row.muted ? "text-muted-foreground" : "text-foreground")}>
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-col gap-2 border-t border-border px-5 py-4">
            <Button type="submit" disabled={generateState !== 'CONFIGURE'} className="w-full">
              {generateState === 'PLANNING' ? (
                <>
                  <Loader2 className="animate-spin motion-reduce:animate-none" />
                  Planning…
                </>
              ) : (
                <>
                  <Sparkles />
                  Plan program
                </>
              )}
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => router.back()}>
              Cancel
            </Button>
          </div>
        </Card>

        {selectedClientDetails && <ClientDetailsPanel client={selectedClientDetails} />}
      </aside>
    </form>
  );
}

function GenerateSection({
  step,
  title,
  description,
  children,
}: {
  step: number;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="gap-0 py-0">
      <div className="flex items-start gap-3 border-b border-border px-5 py-4">
        <span
          aria-hidden
          className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-caption font-semibold text-primary tabular-nums"
        >
          {step}
        </span>
        <div className="min-w-0">
          <h2 className="text-heading text-foreground">{title}</h2>
          {description && <p className="mt-0.5 text-body text-muted-foreground">{description}</p>}
        </div>
      </div>
      <div className="flex flex-col gap-5 px-5 py-5">{children}</div>
    </Card>
  );
}

/** Toggle chip: quieter than a solid button, so a row of options doesn't shout. */
function ChoiceChip({
  selected,
  onClick,
  children,
  className,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "inline-flex h-9 items-center rounded-full border px-3.5 text-label transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none sm:h-8",
        selected
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-surface text-foreground hover:border-border-strong hover:bg-muted/50",
        className
      )}
    >
      {children}
    </button>
  );
}

function CircuitNumber({
  label,
  unit,
  min,
  max,
  value,
  disabled,
  onChange,
}: {
  label: string;
  unit: string;
  min: number;
  max: number;
  value: number | null;
  disabled?: boolean;
  onChange: (value: number | null) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1 max-sm:order-2">
      <Input
        type="number"
        min={min}
        max={max}
        value={value ?? ""}
        placeholder="—"
        disabled={disabled}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        aria-label={label}
        className="h-10 w-14 text-center text-base disabled:opacity-50 sm:h-8 sm:text-body"
      />
      <span className="whitespace-nowrap text-caption">{unit}</span>
    </div>
  );
}
