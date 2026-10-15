"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Dumbbell, Flame, Gauge, PieChart, RotateCcw, Save, Scale, Target, UserRound, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SectionCard } from "@/components/shared/section-card";
import { saveMacroCalculatorTargetAction } from "@/actions/nutrition-actions";
import {
  ACTIVITY_LEVELS,
  GOALS,
  MACRO_PRESETS,
  STAT_LIMITS,
  calculateMacroGrams,
  calculateMacros,
  clampAdjustment,
  getActivityLevel,
  getGoal,
  isSplitValid,
  rebalanceSplit,
  type ActivityLevel,
  type Goal,
  type MacroKey,
  type Sex,
  type UnitSystem,
} from "@/lib/nutrition/macro-calculator";
import type { MacroCalculatorInputs } from "@/lib/validators/macro-calculator";
import {
  createDefaultFormState,
  formStateFromInputs,
  formToInputs,
  heightCmFromForm,
  parseNumberText,
  switchUnits,
  weightKgFromForm,
  type CalculatorFormState,
} from "./macro-calculator-form";
import { MACRO_STYLES, MacroCalculatorResults, type CurrentTargets } from "./macro-calculator-results";

interface MacroCalculatorProps {
  clientId: string;
  clientName: string;
  /** Age derived from the client's date of birth, when parseable. */
  defaultAge: number | null;
  /** Inputs from the last save, already validated server-side. */
  savedInputs: MacroCalculatorInputs | null;
  currentTargets: CurrentTargets;
}

const GOAL_ICONS: Record<Goal, LucideIcon> = {
  fat_loss: Flame,
  maintenance: Scale,
  muscle_gain: Dumbbell,
  performance: Zap,
};

const MACRO_ROWS: { key: MacroKey; style: keyof typeof MACRO_STYLES; gramsKey: "proteinG" | "carbsG" | "fatG" }[] = [
  { key: "p", style: "protein", gramsKey: "proteinG" },
  { key: "c", style: "carbs", gramsKey: "carbsG" },
  { key: "f", style: "fat", gramsKey: "fatG" },
];

export function MacroCalculator({
  clientId,
  clientName,
  defaultAge,
  savedInputs,
  currentTargets,
}: MacroCalculatorProps) {
  const router = useRouter();
  const [isSaving, startSaving] = useTransition();
  const [form, setForm] = useState<CalculatorFormState>(() =>
    savedInputs ? formStateFromInputs(savedInputs) : createDefaultFormState(defaultAge)
  );

  const inputs = useMemo(() => formToInputs(form), [form]);
  const result = useMemo(() => (inputs ? calculateMacros(inputs) : null), [inputs]);
  const splitValid = isSplitValid(form.split);
  const canSave = inputs !== null && result !== null && splitValid && !isSaving;

  function update(patch: Partial<CalculatorFormState>) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function handleGoalChange(goal: Goal) {
    update({ goal, adjustmentPct: getGoal(goal).defaultPct });
  }

  function handleReset() {
    setForm(createDefaultFormState(defaultAge));
  }

  function handleSave() {
    if (!inputs) return;
    startSaving(async () => {
      const response = await saveMacroCalculatorTargetAction({ clientId, inputs });
      if (!response.success) {
        toast.error(response.error);
        return;
      }
      toast.success(`Saved ${clientName}'s targets`, {
        description: `${response.data.calories} kcal · P ${response.data.proteinG} g · C ${response.data.carbsG} g · F ${response.data.fatG} g`,
      });
      router.push(`/nutrition/${clientId}`);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,440px)]">
        <div className="flex min-w-0 flex-col gap-6">
          <ClientInfoSection form={form} onChange={update} onUnitsChange={(u) => setForm((f) => switchUnits(f, u))} />
          <GoalSection form={form} onGoalChange={handleGoalChange} onAdjustmentChange={(pct) => update({ adjustmentPct: pct })} />
          <MacroSplitSection
            form={form}
            calories={result?.calories ?? null}
            onSplitChange={(split) => update({ split })}
          />
        </div>

        <div className="min-w-0 xl:sticky xl:top-6">
          <MacroCalculatorResults
            result={result}
            split={form.split}
            currentTargets={currentTargets}
            onOverrideChange={(calorieOverride) => update({ calorieOverride })}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
        {!splitValid && (
          <p className="mr-auto text-caption text-danger-foreground">Macro split must total 100% before saving.</p>
        )}
        <Button variant="outline" onClick={handleReset} disabled={isSaving}>
          <RotateCcw />
          Reset
        </Button>
        <Button onClick={handleSave} disabled={!canSave}>
          <Save />
          {isSaving ? "Saving…" : "Save to client's targets"}
        </Button>
      </div>
    </div>
  );
}

// ─── Shared bits ─────────────────────────────────────────────────────────────

/**
 * Number box that lets the trainer type freely and only commits (and clamps)
 * on blur / Enter. While not focused it mirrors `value`, so slider moves show
 * up immediately.
 */
function CommitNumberInput({
  value,
  min,
  max,
  onCommit,
  className,
  ...rest
}: {
  value: number;
  min: number;
  max: number;
  onCommit: (value: number) => void;
  className?: string;
  "aria-label": string;
  id?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  function commit() {
    if (draft === null) return;
    const parsed = parseNumberText(draft);
    if (parsed !== undefined) onCommit(Math.min(max, Math.max(min, Math.round(parsed))));
    setDraft(null);
  }

  return (
    <Input
      {...rest}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      step={1}
      value={draft ?? String(value)}
      onFocus={() => setDraft(String(value))}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        }
      }}
      className={cn("w-20 text-right tabular-nums", className)}
    />
  );
}

function SegmentedToggle<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | null;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex w-full rounded-md bg-surface-muted p-0.5 sm:w-auto">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "h-8 flex-1 rounded-[5px] px-3 text-label whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50 motion-reduce:transition-none sm:flex-none",
              active ? "bg-surface text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function UnitInput({
  id,
  unit,
  value,
  onChange,
  invalid,
  placeholder,
  label,
}: {
  id: string;
  unit: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  placeholder?: string;
  label?: string;
}) {
  return (
    <div className="relative min-w-0 flex-1">
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        min={0}
        value={value}
        placeholder={placeholder}
        aria-label={label}
        aria-invalid={invalid || undefined}
        onChange={(e) => onChange(e.target.value)}
        className="pr-10 tabular-nums"
      />
      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-caption">{unit}</span>
    </div>
  );
}

/** True when a field has a value that falls outside its plausible range. */
function isOutOfRange(value: number | undefined, limits: { min: number; max: number }): boolean {
  return value !== undefined && (value < limits.min || value > limits.max);
}

// ─── 1. Client information ───────────────────────────────────────────────────

const UNIT_OPTIONS: { value: UnitSystem; label: string }[] = [
  { value: "metric", label: "Metric (kg, cm)" },
  { value: "imperial", label: "Imperial (lb, ft)" },
];

const SEX_OPTIONS: { value: Sex; label: string }[] = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
];

function ClientInfoSection({
  form,
  onChange,
  onUnitsChange,
}: {
  form: CalculatorFormState;
  onChange: (patch: Partial<CalculatorFormState>) => void;
  onUnitsChange: (units: UnitSystem) => void;
}) {
  const age = parseNumberText(form.age);
  const heightCm = heightCmFromForm(form);
  const weightKg = weightKgFromForm(form);
  const ageInvalid = isOutOfRange(age, STAT_LIMITS.age);
  const heightInvalid = isOutOfRange(heightCm, STAT_LIMITS.heightCm);
  const weightInvalid = isOutOfRange(weightKg, STAT_LIMITS.weightKg);
  const activity = getActivityLevel(form.activity);

  return (
    <SectionCard title="Client information" icon={UserRound}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-label">Units</span>
          <SegmentedToggle label="Units" value={form.units} options={UNIT_OPTIONS} onChange={onUnitsChange} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="mc-age">Age</Label>
          <UnitInput
            id="mc-age"
            unit="yrs"
            value={form.age}
            invalid={ageInvalid}
            onChange={(v) => onChange({ age: v })}
          />
          {ageInvalid && (
            <p className="text-caption text-danger-foreground">
              Age must be {STAT_LIMITS.age.min}–{STAT_LIMITS.age.max}.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-label">Sex</span>
          <SegmentedToggle label="Sex" value={form.sex} options={SEX_OPTIONS} onChange={(sex) => onChange({ sex })} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="mc-height">Height</Label>
          {form.units === "metric" ? (
            <UnitInput
              id="mc-height"
              unit="cm"
              value={form.heightCm}
              invalid={heightInvalid}
              onChange={(v) => onChange({ heightCm: v })}
            />
          ) : (
            <div className="flex gap-2">
              <UnitInput
                id="mc-height"
                unit="ft"
                label="Height, feet"
                value={form.heightFt}
                invalid={heightInvalid}
                onChange={(v) => onChange({ heightFt: v })}
              />
              <UnitInput
                id="mc-height-in"
                unit="in"
                label="Height, inches"
                value={form.heightIn}
                invalid={heightInvalid}
                onChange={(v) => onChange({ heightIn: v })}
              />
            </div>
          )}
          {heightInvalid && (
            <p className="text-caption text-danger-foreground">
              Height must be {STAT_LIMITS.heightCm.min}–{STAT_LIMITS.heightCm.max} cm.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="mc-weight">Weight</Label>
          <UnitInput
            id="mc-weight"
            unit={form.units === "metric" ? "kg" : "lb"}
            value={form.weight}
            invalid={weightInvalid}
            onChange={(v) => onChange({ weight: v })}
          />
          {weightInvalid && (
            <p className="text-caption text-danger-foreground">
              Weight must be {STAT_LIMITS.weightKg.min}–{STAT_LIMITS.weightKg.max} kg.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="mc-activity">Activity level</Label>
          <Select
            value={form.activity}
            onValueChange={(value: ActivityLevel | null) => {
              if (value) onChange({ activity: value });
            }}
          >
            <SelectTrigger id="mc-activity">
              <SelectValue>
                {(value: ActivityLevel) => {
                  const level = getActivityLevel(value);
                  return `${level.label} (×${level.multiplier})`;
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {ACTIVITY_LEVELS.map((level) => (
                <SelectItem key={level.id} value={level.id}>
                  <span className="flex flex-col">
                    <span>
                      {level.label} <span className="text-muted-foreground tabular-nums">×{level.multiplier}</span>
                    </span>
                    <span className="text-caption">{level.hint}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-caption">{activity.hint}</p>
        </div>
      </div>
    </SectionCard>
  );
}

// ─── 2. Goal ─────────────────────────────────────────────────────────────────

function formatPct(pct: number): string {
  return `${pct > 0 ? "+" : ""}${pct}%`;
}

function GoalSection({
  form,
  onGoalChange,
  onAdjustmentChange,
}: {
  form: CalculatorFormState;
  onGoalChange: (goal: Goal) => void;
  onAdjustmentChange: (pct: number) => void;
}) {
  const goal = getGoal(form.goal);
  const isFixed = goal.minPct === goal.maxPct;

  return (
    <SectionCard title="Goal" icon={Target}>
      <div className="flex flex-col gap-5">
        <div role="radiogroup" aria-label="Goal" className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {GOALS.map((option) => {
            const active = option.id === form.goal;
            const Icon = GOAL_ICONS[option.id];
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onGoalChange(option.id)}
                className={cn(
                  "flex flex-col items-start gap-1.5 rounded-lg border px-3 py-3 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50 motion-reduce:transition-none",
                  active ? "border-primary bg-primary/5" : "border-border bg-surface hover:bg-surface-muted"
                )}
              >
                <Icon className={cn("size-5", active ? "text-primary" : "text-muted-foreground")} aria-hidden />
                <span className="text-label text-foreground">{option.label}</span>
                <span className="text-caption">
                  {option.description} · {formatPct(option.defaultPct)}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="mc-adjustment">Calorie adjustment</Label>
            {!isFixed && (
              <div className="flex items-center gap-1.5">
                <CommitNumberInput
                  id="mc-adjustment-pct"
                  aria-label="Calorie adjustment percent"
                  value={form.adjustmentPct}
                  min={goal.minPct}
                  max={goal.maxPct}
                  onCommit={(pct) => onAdjustmentChange(clampAdjustment(form.goal, pct))}
                />
                <span className="text-caption">%</span>
              </div>
            )}
          </div>
          {isFixed ? (
            <p className="text-caption">No adjustment — the calorie target equals TDEE.</p>
          ) : (
            <>
              <input
                id="mc-adjustment"
                type="range"
                min={goal.minPct}
                max={goal.maxPct}
                step={1}
                value={form.adjustmentPct}
                onChange={(e) => onAdjustmentChange(clampAdjustment(form.goal, Number(e.target.value)))}
                className="w-full accent-primary"
                aria-valuetext={formatPct(form.adjustmentPct)}
              />
              <div className="flex justify-between text-caption tabular-nums">
                <span>{formatPct(goal.minPct)}</span>
                <span className="text-foreground">{formatPct(form.adjustmentPct)} of TDEE</span>
                <span>{formatPct(goal.maxPct)}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

// ─── 3. Macro distribution ───────────────────────────────────────────────────

function MacroSplitSection({
  form,
  calories,
  onSplitChange,
}: {
  form: CalculatorFormState;
  calories: number | null;
  onSplitChange: (split: CalculatorFormState["split"]) => void;
}) {
  const { split } = form;
  const total = split.p + split.c + split.f;
  const grams = calories !== null ? calculateMacroGrams(calories, split) : null;

  return (
    <SectionCard
      title="Macro distribution"
      icon={PieChart}
      description="Adjusting one macro rebalances the other two so the split always totals 100%."
    >
      <div className="flex flex-col gap-5">
        <div role="radiogroup" aria-label="Macro preset" className="grid gap-2 sm:grid-cols-3">
          {MACRO_PRESETS.map((preset) => {
            const active =
              preset.split.p === split.p && preset.split.c === split.c && preset.split.f === split.f;
            return (
              <button
                key={preset.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onSplitChange({ ...preset.split })}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50 motion-reduce:transition-none",
                  active ? "border-primary bg-primary/5" : "border-border bg-surface hover:bg-surface-muted"
                )}
              >
                <span className="min-w-0">
                  <span className="block text-label text-foreground">{preset.label}</span>
                  <span className="block text-caption tabular-nums">
                    {preset.split.p}P / {preset.split.c}C / {preset.split.f}F
                  </span>
                </span>
                {active && <Check className="size-4 shrink-0 text-primary" aria-hidden />}
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-4">
          {MACRO_ROWS.map((row) => {
            const style = MACRO_STYLES[row.style];
            const inputId = `mc-split-${row.key}`;
            return (
              <div key={row.key} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor={inputId}>
                    <span className={cn("size-2.5 rounded-full", style.dot)} aria-hidden />
                    {style.label}
                    {grams && <span className="text-caption tabular-nums">{grams[row.gramsKey]} g</span>}
                  </Label>
                  <div className="flex items-center gap-1.5">
                    <CommitNumberInput
                      aria-label={`${style.label} percent`}
                      value={split[row.key]}
                      min={0}
                      max={100}
                      onCommit={(value) => onSplitChange(rebalanceSplit(split, row.key, value))}
                    />
                    <span className="text-caption">%</span>
                  </div>
                </div>
                <input
                  id={inputId}
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={split[row.key]}
                  onChange={(e) => onSplitChange(rebalanceSplit(split, row.key, Number(e.target.value)))}
                  className={cn("w-full", style.accent)}
                  aria-valuetext={`${split[row.key]}%`}
                />
              </div>
            );
          })}
        </div>

        <div
          className={cn(
            "flex items-center justify-between rounded-lg px-3 py-2 text-label",
            total === 100 ? "bg-success-soft text-success-foreground" : "bg-danger-soft text-danger-foreground"
          )}
        >
          <span className="inline-flex items-center gap-1.5">
            {total === 100 ? <Check className="size-4" aria-hidden /> : <Gauge className="size-4" aria-hidden />}
            {total === 100 ? "Split totals 100%" : "Split must total 100%"}
          </span>
          <span className="tabular-nums">{total}%</span>
        </div>
      </div>
    </SectionCard>
  );
}
