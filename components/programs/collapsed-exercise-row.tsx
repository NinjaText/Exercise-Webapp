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
    <div className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-1.5 py-1 shadow-xs transition-colors hover:border-border-strong motion-reduce:transition-none">
      <button
        type="button"
        aria-label={`Drag to reorder ${name}`}
        className="flex size-6 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
        {...dragHandleProps}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onToggle}
        aria-label={`Expand ${name}`}
        className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onSelect}
        className="flex min-h-7 min-w-0 flex-1 items-center gap-2 rounded px-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="truncate text-sm font-medium">{name}</span>
        {hasVideo && (
          <span className="inline-flex shrink-0 items-center gap-1 text-caption font-medium text-info-foreground">
            <Play className="size-3" />
            Video
          </span>
        )}
        {sets.length > 0 && (
          <span className="ml-auto shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-caption font-medium text-muted-foreground tabular-nums">
            {summarizePrescription(sets)}
          </span>
        )}
      </button>
    </div>
  );
}
