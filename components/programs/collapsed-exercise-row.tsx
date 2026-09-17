"use client";

import { ChevronRight, GripVertical, Play } from "lucide-react";
import type { ExerciseSetInput } from "@/lib/validators/program";

/**
 * One-line prescription summary shown on a collapsed exercise in Focus mode.
 * Uniform sets collapse to "3 × 10"; mixed prescriptions fall back to a count
 * rather than a misleading first-set summary.
 */
export function summarizePrescription(sets: ExerciseSetInput[]): string {
  if (sets.length === 0) return "";

  const first = sets[0];
  const uniform = sets.every(
    (s) =>
      s.targetReps === first.targetReps &&
      s.targetDuration === first.targetDuration &&
      s.targetWeight === first.targetWeight
  );

  if (!uniform) return `${sets.length} sets`;

  const detail =
    first.targetDuration != null && first.targetDuration > 0
      ? `${first.targetDuration}s`
      : `${first.targetReps ?? 0}`;

  return `${sets.length} × ${detail}`;
}

export function CollapsedExerciseRow({
  name,
  sets,
  hasVideo,
  dragHandleProps,
  onSelect,
  onToggle,
}: {
  name: string;
  sets: ExerciseSetInput[];
  hasVideo: boolean;
  dragHandleProps: React.HTMLAttributes<HTMLElement>;
  /** Plain click — open this one and collapse the rest. */
  onSelect: () => void;
  /** Chevron click — open this one without collapsing the rest. */
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border bg-card px-2 py-1.5">
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
        {...dragHandleProps}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onToggle}
        aria-label={`Expand ${name}`}
        className="text-muted-foreground hover:text-foreground"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <span className="truncate text-sm font-medium">{name}</span>
        {hasVideo && (
          <span className="inline-flex shrink-0 items-center gap-0.5 rounded-sm border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">
            <Play className="h-2.5 w-2.5" />
            Video
          </span>
        )}
        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
          {summarizePrescription(sets)}
        </span>
      </button>
    </div>
  );
}
