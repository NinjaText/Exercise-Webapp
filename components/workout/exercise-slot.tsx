"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatBodyRegion } from "@/lib/utils/formatting";
import { Check, SkipForward, ChevronUp, ChevronDown, ArrowLeftRight, X } from "lucide-react";
import type { Exercise, PlanExercise } from "@prisma/client";

interface ExerciseSlotProps {
  planExercise: PlanExercise & { exercise: Exercise };
  mode: "view" | "edit" | "session";
  feedbackSummary?: { feltGood: number; painful: number; total: number };
  onComplete?: () => void;
  onSkip?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onSwap?: () => void;
  onRemove?: () => void;
  onUpdateSets?: (sets: number) => void;
  onUpdateReps?: (reps: number) => void;
}

export function ExerciseSlot({
  planExercise,
  mode,
  feedbackSummary,
  onComplete,
  onSkip,
  onMoveUp,
  onMoveDown,
  onSwap,
  onRemove,
  onUpdateSets,
  onUpdateReps,
}: ExerciseSlotProps) {
  const exercise = planExercise.exercise;

  return (
    <div className="flex items-start gap-3 p-4 rounded-md border">
      <div className="bg-muted flex h-8 w-8 items-center justify-center rounded text-sm font-medium shrink-0">
        {planExercise.orderIndex + 1}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-medium">{exercise.name}</p>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {exercise.bodyRegion.map((region) => (
                <Badge key={region} variant="outline" className="text-xs">
                  {formatBodyRegion(region)}
                </Badge>
              ))}
              <span className="text-muted-foreground text-xs">
                {mode === "edit" ? (
                  <span className="flex items-center gap-1">
                    <Input
                      type="number"
                      className="h-6 w-14 text-xs"
                      defaultValue={planExercise.sets}
                      min={1}
                      max={20}
                      onChange={(e) => onUpdateSets?.(Number(e.target.value))}
                    />
                    sets
                  </span>
                ) : (
                  `${planExercise.sets} sets`
                )}
              </span>
              {planExercise.reps && (
                <span className="text-muted-foreground text-xs">
                  {mode === "edit" ? (
                    <span className="flex items-center gap-1">
                      x
                      <Input
                        type="number"
                        className="h-6 w-14 text-xs"
                        defaultValue={planExercise.reps}
                        min={1}
                        max={100}
                        onChange={(e) => onUpdateReps?.(Number(e.target.value))}
                      />
                      reps
                    </span>
                  ) : (
                    `x ${planExercise.reps} reps`
                  )}
                </span>
              )}
              {planExercise.durationSeconds && (
                <span className="text-muted-foreground text-xs">
                  {planExercise.durationSeconds}s hold
                </span>
              )}
              {planExercise.restSeconds && (
                <span className="text-muted-foreground text-xs">
                  {planExercise.restSeconds}s rest
                </span>
              )}
            </div>
          </div>

          {mode === "edit" && (
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={onMoveUp} className="h-7 w-7 p-0">
                <ChevronUp className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="sm" onClick={onMoveDown} className="h-7 w-7 p-0">
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="sm" onClick={onSwap} className="h-7 w-7 p-0">
                <ArrowLeftRight className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="sm" onClick={onRemove} className="h-7 w-7 p-0 text-destructive">
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}

          {mode === "session" && (
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={onComplete}>
                <Check className="mr-1 h-3.5 w-3.5" />
                Done
              </Button>
              <Button variant="outline" size="sm" onClick={onSkip}>
                <SkipForward className="mr-1 h-3.5 w-3.5" />
                Skip
              </Button>
            </div>
          )}
        </div>

        {planExercise.notes && (
          <p className="text-muted-foreground text-xs mt-2 italic">{planExercise.notes}</p>
        )}

        {feedbackSummary && feedbackSummary.total > 0 && (
          <div className="flex gap-2 mt-2">
            <Badge variant="secondary" className="text-xs">
              {feedbackSummary.feltGood} felt good
            </Badge>
            {feedbackSummary.painful > 0 && (
              <Badge variant="destructive" className="text-xs">
                {feedbackSummary.painful} painful
              </Badge>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
