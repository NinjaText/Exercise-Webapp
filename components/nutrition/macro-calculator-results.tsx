"use client";

import { useState } from "react";
import { Cell, Pie, PieChart } from "recharts";
import { AlertTriangle, Calculator, Check, Pencil, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionCard } from "@/components/shared/section-card";
import {
  KCAL_PER_GRAM,
  type MacroCalculationResult,
  type MacroSplit,
  type MacroWarning,
} from "@/lib/nutrition/macro-calculator";

/**
 * Macro colours match components/nutrition/macro-progress-bars.tsx so the
 * calculator, the client's daily progress bars and this donut read as one
 * system: protein = info, carbs = warning, fat = brand.
 */
export const MACRO_STYLES = {
  protein: { label: "Protein", fill: "var(--info)", dot: "bg-info", accent: "accent-info" },
  carbs: { label: "Carbs", fill: "var(--warning)", dot: "bg-warning", accent: "accent-warning" },
  fat: { label: "Fat", fill: "var(--brand)", dot: "bg-brand", accent: "accent-brand" },
} as const;

export const CALORIE_OVERRIDE_LIMITS = { min: 500, max: 20000 } as const;

export interface CurrentTargets {
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
}

interface MacroCalculatorResultsProps {
  result: MacroCalculationResult | null;
  split: MacroSplit;
  currentTargets: CurrentTargets;
  onOverrideChange: (calories: number | null) => void;
}

const kcalFormatter = new Intl.NumberFormat("en-US");
const formatKcal = (value: number) => kcalFormatter.format(value);

function formatSigned(value: number, unit: string): string {
  if (value === 0) return `0${unit}`;
  return `${value > 0 ? "+" : "−"}${formatKcal(Math.abs(value))}${unit}`;
}

export function MacroCalculatorResults({
  result,
  split,
  currentTargets,
  onOverrideChange,
}: MacroCalculatorResultsProps) {
  if (!result) {
    return (
      <SectionCard title="Results" icon={Calculator}>
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border bg-surface-muted px-4 py-10 text-center">
          <Calculator className="size-6 text-muted-foreground" aria-hidden />
          <p className="text-body text-foreground">Enter the client&apos;s stats to see results</p>
          <p className="text-caption">Age, sex, height and weight are all needed for the BMR formula.</p>
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Results" icon={Calculator}>
      <div className="flex flex-col gap-5">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="BMR" value={`${formatKcal(result.bmr)} kcal`} hint="Mifflin–St Jeor" />
          <Stat label="TDEE" value={`${formatKcal(result.tdee)} kcal`} hint="BMR × activity" />
          <Stat
            label="Goal adjustment"
            value={formatSigned(result.adjustmentKcal, " kcal")}
            hint={`${result.adjustmentPct > 0 ? "+" : ""}${result.adjustmentPct}% of TDEE`}
            className="col-span-2 sm:col-span-1"
          />
        </dl>

        <CalorieTarget result={result} onOverrideChange={onOverrideChange} />

        <MacroDonut result={result} split={split} />

        <PerKgRow result={result} />

        {result.warnings.length > 0 && (
          <div className="flex flex-col gap-2">
            {result.warnings.map((warning) => (
              <WarningNote key={warning.kind} warning={warning} />
            ))}
          </div>
        )}

        <ComparisonTable result={result} currentTargets={currentTargets} />

        <p className="text-caption">
          Quick reference: protein {KCAL_PER_GRAM.protein} kcal/g · carbs {KCAL_PER_GRAM.carbs} kcal/g · fat{" "}
          {KCAL_PER_GRAM.fat} kcal/g
        </p>
      </div>
    </SectionCard>
  );
}

function Stat({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: string;
  hint: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border border-border bg-surface-muted px-3 py-2.5", className)}>
      <dt className="text-caption">{label}</dt>
      <dd className="text-heading tabular-nums text-foreground">{value}</dd>
      <dd className="text-caption">{hint}</dd>
    </div>
  );
}

// ─── Calorie target (with trainer override) ─────────────────────────────────

function CalorieTarget({
  result,
  onOverrideChange,
}: {
  result: MacroCalculationResult;
  onOverrideChange: (calories: number | null) => void;
}) {
  // null = not editing; a string = the in-progress draft.
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function startEditing() {
    setDraft(String(result.calories));
    setError(null);
  }

  function cancelEditing() {
    setDraft(null);
    setError(null);
  }

  function commit() {
    if (draft === null) return;
    const value = Number(draft.trim());
    const { min, max } = CALORIE_OVERRIDE_LIMITS;
    if (!Number.isInteger(value) || value < min || value > max) {
      setError(`Enter a whole number between ${formatKcal(min)} and ${formatKcal(max)}.`);
      return;
    }
    onOverrideChange(value === result.computedCalories ? null : value);
    cancelEditing();
  }

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-label text-primary">Daily calorie target</p>
          {draft === null ? (
            <p className="text-display tabular-nums text-foreground">
              {formatKcal(result.calories)}
              <span className="ml-1 text-body text-muted-foreground">kcal</span>
            </p>
          ) : (
            <form
              className="mt-1 flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                commit();
              }}
            >
              <Input
                type="number"
                inputMode="numeric"
                aria-label="Daily calorie target"
                aria-invalid={error !== null}
                autoFocus
                min={CALORIE_OVERRIDE_LIMITS.min}
                max={CALORIE_OVERRIDE_LIMITS.max}
                step={1}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") cancelEditing();
                }}
                className="w-32 tabular-nums"
              />
              <Button type="submit" size="icon-sm" aria-label="Apply calorie target">
                <Check />
              </Button>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Cancel" onClick={cancelEditing}>
                <X />
              </Button>
            </form>
          )}
        </div>
        {draft === null && (
          <Button variant="ghost" size="icon-sm" aria-label="Override calorie target" onClick={startEditing}>
            <Pencil />
          </Button>
        )}
      </div>

      {error && <p className="mt-1 text-caption text-danger-foreground">{error}</p>}

      {result.isOverridden && draft === null && (
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption">
          <span>Manually set · calculated {formatKcal(result.computedCalories)} kcal</span>
          <button
            type="button"
            onClick={() => onOverrideChange(null)}
            className="inline-flex items-center gap-1 rounded-sm text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            <RotateCcw className="size-3" aria-hidden />
            Use calculated
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Donut ───────────────────────────────────────────────────────────────────

function MacroDonut({ result, split }: { result: MacroCalculationResult; split: MacroSplit }) {
  const rows = [
    { key: "protein", grams: result.proteinG, kcal: result.proteinG * KCAL_PER_GRAM.protein, pct: split.p },
    { key: "carbs", grams: result.carbsG, kcal: result.carbsG * KCAL_PER_GRAM.carbs, pct: split.c },
    { key: "fat", grams: result.fatG, kcal: result.fatG * KCAL_PER_GRAM.fat, pct: split.f },
  ] as const;
  // Recharts can't draw an all-zero pie; fall back to a neutral ring.
  const hasData = rows.some((row) => row.kcal > 0);

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <div className="relative size-44 shrink-0">
        <PieChart width={176} height={176}>
          <Pie
            data={hasData ? rows.map((row) => ({ name: row.key, value: row.kcal })) : [{ name: "empty", value: 1 }]}
            dataKey="value"
            cx="50%"
            cy="50%"
            innerRadius={58}
            outerRadius={84}
            paddingAngle={hasData ? 2 : 0}
            stroke="none"
            isAnimationActive={false}
          >
            {hasData
              ? rows.map((row) => <Cell key={row.key} fill={MACRO_STYLES[row.key].fill} />)
              : [<Cell key="empty" fill="var(--muted)" />]}
          </Pie>
        </PieChart>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-heading tabular-nums text-foreground">{formatKcal(result.calories)}</span>
          <span className="text-caption">kcal / day</span>
        </div>
      </div>

      <ul className="flex w-full flex-col gap-2" aria-label="Macro breakdown">
        {rows.map((row) => (
          <li
            key={row.key}
            className="flex items-center gap-3 rounded-lg border border-border px-3 py-2"
          >
            <span className={cn("size-2.5 shrink-0 rounded-full", MACRO_STYLES[row.key].dot)} aria-hidden />
            <span className="flex-1 text-label text-foreground">{MACRO_STYLES[row.key].label}</span>
            <span className="text-heading tabular-nums text-foreground">{row.grams} g</span>
            <span className="text-right text-caption whitespace-nowrap tabular-nums">
              {formatKcal(row.kcal)} kcal · {row.pct}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PerKgRow({ result }: { result: MacroCalculationResult }) {
  const items = [
    { key: "protein", value: result.perKg.protein },
    { key: "carbs", value: result.perKg.carbs },
    { key: "fat", value: result.perKg.fat },
  ] as const;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-label text-foreground">Grams per kg body weight</p>
      <div className="grid grid-cols-3 gap-2">
        {items.map((item) => (
          <div key={item.key} className="rounded-lg bg-surface-muted px-3 py-2 text-center">
            <p className="text-heading tabular-nums text-foreground">{item.value.toFixed(1)}</p>
            <p className="text-caption">{MACRO_STYLES[item.key].label} g/kg</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function WarningNote({ warning }: { warning: MacroWarning }) {
  const message =
    warning.kind === "low_calories"
      ? `This target is below ${formatKcal(warning.minimum)} kcal/day, a common floor for unsupervised dieting. Consider a smaller deficit.`
      : `Protein is ${warning.gramsPerKg.toFixed(1)} g/kg. During fat loss, at least ${warning.minimum} g/kg helps preserve lean mass — try the Higher protein split.`;
  return (
    <div className="flex gap-2 rounded-lg border border-warning-border bg-warning-soft px-3 py-2.5 text-body text-warning-foreground">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p>{message}</p>
    </div>
  );
}

// ─── Current vs new ──────────────────────────────────────────────────────────

function ComparisonTable({
  result,
  currentTargets,
}: {
  result: MacroCalculationResult;
  currentTargets: CurrentTargets;
}) {
  const rows = [
    { label: "Calories", unit: "kcal", current: currentTargets.calories, next: result.calories },
    { label: "Protein", unit: "g", current: currentTargets.proteinG, next: result.proteinG },
    { label: "Carbs", unit: "g", current: currentTargets.carbsG, next: result.carbsG },
    { label: "Fat", unit: "g", current: currentTargets.fatG, next: result.fatG },
  ];
  const hasCurrent = rows.some((row) => row.current !== null);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-label text-foreground">Compared with current targets</p>
      {!hasCurrent && <p className="text-caption">No targets set yet — saving will create them.</p>}
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-body">
          <thead className="bg-surface-muted text-caption">
            <tr>
              <th scope="col" className="px-2.5 py-2 text-left font-medium">
                Target
              </th>
              <th scope="col" className="px-2.5 py-2 text-right font-medium">
                Current
              </th>
              <th scope="col" className="px-2.5 py-2 text-right font-medium">
                New
              </th>
              <th scope="col" className="px-2.5 py-2 text-right font-medium">
                Change
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const diff = row.current === null ? null : row.next - row.current;
              return (
                <tr key={row.label} className="border-t border-border">
                  <th scope="row" className="px-2.5 py-2 text-left font-medium text-foreground">
                    {row.label} <span className="text-caption">({row.unit})</span>
                  </th>
                  <td className="px-2.5 py-2 text-right tabular-nums text-muted-foreground">
                    {row.current === null ? "—" : formatKcal(row.current)}
                  </td>
                  <td className="px-2.5 py-2 text-right tabular-nums text-foreground">{formatKcal(row.next)}</td>
                  <td
                    className={cn(
                      "px-2.5 py-2 text-right tabular-nums",
                      diff === null || diff === 0 ? "text-muted-foreground" : "text-foreground"
                    )}
                  >
                    {diff === null ? "New" : diff === 0 ? "—" : formatSigned(diff, "")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
