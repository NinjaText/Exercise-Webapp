"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, HelpCircle, FileWarning, Check, Trash2 } from "lucide-react";

export type ExerciseMatchFlag = "needs_review" | "not_in_library" | "not_in_document";

const FLAG_META: Record<ExerciseMatchFlag, { label: string; icon: typeof AlertTriangle; className: string }> = {
  needs_review: {
    label: "Needs review",
    icon: HelpCircle,
    className: "bg-amber-50 text-amber-700 border-amber-200",
  },
  not_in_library: {
    label: "Not in library",
    icon: AlertTriangle,
    className: "bg-red-50 text-red-700 border-red-200",
  },
  not_in_document: {
    label: "Couldn't verify in document",
    icon: FileWarning,
    className: "bg-purple-50 text-purple-700 border-purple-200",
  },
};

interface Props {
  exerciseName?: string;
  sets: number;
  reps: string;
  flags: ExerciseMatchFlag[];
  hasSuggestion: boolean;
  resolved: boolean;
  resolvedLabel?: string;
  duplicateCount?: number;
  applyToAll?: boolean;
  onApplyToAllChange?: (checked: boolean) => void;
  onConfirm: () => void;
  onPickAlternative: () => void;
  onSkip: () => void;
}

export function FlaggedExerciseRow({
  exerciseName,
  sets,
  reps,
  flags,
  hasSuggestion,
  resolved,
  resolvedLabel,
  duplicateCount = 0,
  applyToAll = false,
  onApplyToAllChange,
  onConfirm,
  onPickAlternative,
  onSkip,
}: Props) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed p-2">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm">
            {exerciseName} — {sets} x {reps}
          </span>
          {flags.map((flag) => {
            const meta = FLAG_META[flag];
            const Icon = meta.icon;
            return (
              <Badge key={flag} variant="outline" className={`gap-1 text-[10px] ${meta.className}`}>
                <Icon className="h-2.5 w-2.5" />
                {meta.label}
              </Badge>
            );
          })}
        </div>
        {resolved && resolvedLabel && (
          <p className="mt-1 text-xs text-emerald-700">Resolved: {resolvedLabel}</p>
        )}
        {!resolved && duplicateCount > 0 && (
          <label className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Checkbox
              checked={applyToAll}
              onCheckedChange={(checked) => onApplyToAllChange?.(checked === true)}
              aria-label="Apply this action to all matching occurrences"
            />
            Also apply to {duplicateCount} other place{duplicateCount === 1 ? "" : "s"} with this exercise
          </label>
        )}
      </div>
      {!resolved && (
        <div className="flex shrink-0 gap-1.5">
          {hasSuggestion && (
            <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={onConfirm}>
              <Check className="h-3 w-3" /> Confirm
            </Button>
          )}
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onPickAlternative}>
            Choose exercise
          </Button>
          <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs text-muted-foreground" onClick={onSkip}>
            <Trash2 className="h-3 w-3" /> Delete
          </Button>
        </div>
      )}
    </div>
  );
}
