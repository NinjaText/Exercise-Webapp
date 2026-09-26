"use client";

import { Check, HeartPulse, Zap, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { EXERCISE_CONTEXT_OPTIONS, type ExerciseContext } from "@/lib/utils/exercise-context";

const ICONS: Record<ExerciseContext, LucideIcon> = {
  CLINICAL: HeartPulse,
  PERFORMANCE: Zap,
};

interface ExerciseContextSelectorProps {
  value: ExerciseContext[];
  onChange: (value: ExerciseContext[]) => void;
  /** Tighter layout for dialogs and narrow panels. */
  compact?: boolean;
  className?: string;
}

/**
 * Multi-select for who an exercise is meant for. Either or both can be chosen;
 * the last remaining selection can't be cleared so the AI always has a target.
 */
export function ExerciseContextSelector({ value, onChange, compact, className }: ExerciseContextSelectorProps) {
  function toggle(option: ExerciseContext) {
    const isSelected = value.includes(option);
    if (isSelected && value.length === 1) return;
    onChange(isSelected ? value.filter((v) => v !== option) : [...value, option]);
  }

  return (
    <div
      role="group"
      aria-label="Exercise context"
      className={cn("grid grid-cols-2", compact ? "gap-2" : "gap-3", className)}
    >
      {EXERCISE_CONTEXT_OPTIONS.map(({ value: option, label, hint }) => {
        const selected = value.includes(option);
        const locked = selected && value.length === 1;
        const Icon = ICONS[option];
        return (
          <button
            key={option}
            type="button"
            aria-pressed={selected}
            title={locked ? "At least one context is required" : undefined}
            onClick={() => toggle(option)}
            className={cn(
              "flex items-center gap-3 rounded-lg border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              compact ? "px-2.5 py-2" : "px-3.5 py-3",
              selected
                ? "border-primary bg-primary/5 text-foreground"
                : "border-border bg-background text-muted-foreground hover:border-border-strong hover:text-foreground",
              locked && "cursor-default"
            )}
          >
            <span
              className={cn(
                "flex shrink-0 items-center justify-center rounded-md",
                compact ? "h-7 w-7" : "h-9 w-9",
                selected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
              )}
            >
              <Icon className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
            </span>
            <span className="min-w-0 flex-1">
              <span className={cn("block font-medium", compact ? "text-xs" : "text-sm")}>{label}</span>
              {!compact && <span className="block truncate text-xs text-muted-foreground">{hint}</span>}
            </span>
            <span
              aria-hidden
              className={cn(
                "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                selected ? "border-primary bg-primary text-primary-foreground" : "border-border-strong bg-background"
              )}
            >
              {selected && <Check className="h-3 w-3" strokeWidth={3} />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** One-line summary of the current selection, for helper text under the selector. */
export function describeExerciseContexts(value: ExerciseContext[]): string {
  if (value.includes("CLINICAL") && value.includes("PERFORMANCE")) {
    return "AI will write metadata that works for both rehab and athletic clients.";
  }
  if (value.includes("PERFORMANCE")) {
    return "AI will write metadata for athletic and general-fitness clients.";
  }
  return "AI will write metadata for rehab and clinical clients.";
}
