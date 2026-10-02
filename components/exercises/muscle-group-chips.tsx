"use client";

import { CheckCircle2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { MUSCLE_GROUPS } from "@/lib/utils/constants";
import { cn } from "@/lib/utils";

/** Optional muscle-group multi-select for the exercise create/edit forms. Values are MUSCLE_GROUPS codes. */
export function MuscleGroupChips({
  value,
  onChange,
  compact = false,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  /** Smaller label and chips, for dense dialogs and table rows. */
  compact?: boolean;
}) {
  function toggle(code: string) {
    onChange(value.includes(code) ? value.filter((v) => v !== code) : [...value, code]);
  }

  return (
    <div className={cn("flex flex-col", compact ? "gap-1.5" : "gap-2")}>
      <Label className={cn(compact && "text-xs font-semibold")}>
        Muscle Groups
        {value.length > 0 && (
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {value.length} selected
          </span>
        )}
      </Label>
      <div className={cn("flex flex-wrap", compact ? "gap-1.5" : "gap-2")}>
        {MUSCLE_GROUPS.map((g) => {
          const selected = value.includes(g.value);
          return (
            <button
              key={g.value}
              type="button"
              onClick={() => toggle(g.value)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border font-medium transition-colors",
                compact ? "px-2.5 py-1 text-xs" : "px-3 py-1 text-sm",
                selected
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:border-primary/60 hover:text-foreground"
              )}
            >
              {selected && !compact && <CheckCircle2 className="h-3.5 w-3.5" />}
              {g.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
