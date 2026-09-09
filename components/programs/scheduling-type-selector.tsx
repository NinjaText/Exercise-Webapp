"use client";

import { CalendarDays, Infinity as InfinityIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProgramSchedulingTypeValue } from "@/lib/utils/program-scheduling";

const OPTIONS: {
  value: ProgramSchedulingTypeValue;
  label: string;
  description: string;
  icon: typeof CalendarDays;
}[] = [
  {
    value: "SCHEDULED",
    label: "Scheduled",
    description: "Runs on dates. Appears as required workouts and counts toward adherence.",
    icon: CalendarDays,
  },
  {
    value: "ON_DEMAND",
    label: "Resource (on-demand)",
    description: "No schedule. Clients use it any time; it never affects adherence.",
    icon: InfinityIcon,
  },
];

interface Props {
  value: ProgramSchedulingTypeValue;
  onChange: (value: ProgramSchedulingTypeValue) => void;
  disabled?: boolean;
}

/**
 * Two-option segmented control shared by the program editor and the AI
 * generate form, so both places describe Scheduled vs. Resource identically.
 */
export function SchedulingTypeSelector({ value, onChange, disabled }: Props) {
  return (
    <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Scheduling type">
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
