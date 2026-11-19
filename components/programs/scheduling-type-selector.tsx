"use client";

import { CalendarDays, Infinity as InfinityIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProgramSchedulingTypeValue } from "@/lib/utils/program-scheduling";

const OPTIONS: {
  value: ProgramSchedulingTypeValue;
  label: string;
  shortLabel: string;
  description: string;
  icon: typeof CalendarDays;
}[] = [
  {
    value: "SCHEDULED",
    label: "Scheduled",
    shortLabel: "Scheduled",
    description: "Runs on dates. Appears as required workouts and counts toward adherence.",
    icon: CalendarDays,
  },
  {
    value: "ON_DEMAND",
    label: "Resource (on-demand)",
    shortLabel: "On-demand",
    description: "No schedule. Clients use it any time; it never affects adherence.",
    icon: InfinityIcon,
  },
];

interface Props {
  value: ProgramSchedulingTypeValue;
  onChange: (value: ProgramSchedulingTypeValue) => void;
  disabled?: boolean;
  /** Layout overrides for the option grid (e.g. one column in a narrow sidebar). */
  className?: string;
  /**
   * "compact" renders a two-button segmented control with the selected
   * option's description underneath — for narrow settings panels.
   */
  variant?: "cards" | "compact";
}

/**
 * Two-option segmented control shared by the program editor and the AI
 * generate form, so both places describe Scheduled vs. Resource identically.
 */
export function SchedulingTypeSelector({ value, onChange, disabled, className, variant = "cards" }: Props) {
  if (variant === "compact") {
    const selected = OPTIONS.find((o) => o.value === value) ?? OPTIONS[0];
    return (
      <div className={cn("space-y-2", className)}>
        <div
          role="radiogroup"
          aria-label="Scheduling type"
          className="grid grid-cols-2 gap-0.5 rounded-lg bg-muted p-0.5"
        >
          {OPTIONS.map((option) => {
            const Icon = option.icon;
            const isSelected = value === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={isSelected}
                disabled={disabled}
                onClick={() => onChange(option.value)}
                className={cn(
                  "inline-flex h-9 items-center justify-center gap-1.5 rounded-md text-label transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none sm:h-8",
                  isSelected
                    ? "bg-surface text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                  disabled && "cursor-not-allowed opacity-60",
                )}
              >
                <Icon className="size-3.5" aria-hidden />
                {option.shortLabel}
              </button>
            );
          })}
        </div>
        <p className="text-caption text-muted-foreground">{selected.description}</p>
      </div>
    );
  }

  return (
    <div className={cn("grid gap-2 sm:grid-cols-2", className)} role="radiogroup" aria-label="Scheduling type">
      {OPTIONS.map((option) => {
        const Icon = option.icon;
        const isSelected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
              isSelected
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "border-border hover:bg-muted/50",
              disabled && "cursor-not-allowed opacity-60",
            )}
          >
            <Icon
              className={cn(
                "mt-0.5 h-4 w-4 shrink-0",
                isSelected ? "text-primary" : "text-muted-foreground",
              )}
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium">{option.label}</span>
              <span className="block text-xs text-muted-foreground">{option.description}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
