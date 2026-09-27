"use client";

import { useEffect, useState, type ReactNode } from "react";
import { format } from "date-fns";
import { ChevronDown, ChevronRight, Play } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { UniversalVideoPlayer } from "@/components/exercises/universal-video-player";
import { toLocalCalendarDate } from "@/lib/utils/calendar-date";
import { cn } from "@/lib/utils";

interface ProgramStructureReadonlyProps {
  /** The program's workouts, each with its blocks → exercises → sets. */
  workouts: Record<string, unknown>[];
  /** On-demand resources with a single workout hide the "Day 1" chip. */
  isResource?: boolean;
  /** Expands, scrolls to and briefly highlights this workout on mount. */
  initialWorkoutId?: string;
  /** Extra controls at the end of a workout row (e.g. Start Session, voice note). */
  renderWorkoutAction?: (workout: { id: string; name: string }) => ReactNode;
}

function summarizeSets(sets: Record<string, unknown>[]): string {
  if (sets.length === 0) return "";
  const first = sets[0];
  const allSame = sets.every(
    (s) =>
      s.targetReps === first.targetReps &&
      s.targetWeight === first.targetWeight &&
      s.targetDuration === first.targetDuration &&
      s.targetRPE === first.targetRPE &&
      s.setType === first.setType
  );
  const count = allSame ? sets.length : 1;
  const base = allSame ? first : sets[0];
  const prefix = (base.setType as string) !== "NORMAL" ? `${base.setType as string} ` : "";
  const reps = (base.targetReps as number) ? `${base.targetReps as number} reps` : "";
  const weight = (base.targetWeight as number) ? ` @ ${base.targetWeight as number}lb` : "";
  const dur = (base.targetDuration as number)
    ? ` ${base.targetDuration as number}${(base.targetDurationUnit as string) === "MIN" ? "min" : "s"}`
    : "";
  const rpe = (base.targetRPE as number) ? ` RPE ${base.targetRPE as number}` : "";
  const detail = `${prefix}${reps}${weight}${dur}${rpe}`.trim();
  if (allSame && sets.length > 1) return `${count} × ${detail}`;
  if (sets.length === 1) return detail;
  return sets
    .map((s) => {
      const p = (s.setType as string) !== "NORMAL" ? `${s.setType as string} ` : "";
      const r = (s.targetReps as number) ? `${s.targetReps as number} reps` : "";
      const w = (s.targetWeight as number) ? ` @ ${s.targetWeight as number}lb` : "";
      const d = (s.targetDuration as number)
        ? ` ${s.targetDuration as number}${(s.targetDurationUnit as string) === "MIN" ? "min" : "s"}`
        : "";
      return `${p}${r}${w}${d}`.trim();
    })
    .join(" | ");
}

/**
 * A program's week → workout → block → exercise accordion, read-only. Tapping
 * an exercise opens its detail (video, description) in a dialog.
 */
export function ProgramStructureReadonly({
  workouts,
  isResource = false,
  initialWorkoutId,
  renderWorkoutAction,
}: ProgramStructureReadonlyProps) {
  const [detailExercise, setDetailExercise] = useState<Record<string, unknown> | null>(null);
  const [expandedWorkouts, setExpandedWorkouts] = useState<Set<string>>(
    new Set(initialWorkoutId ? [initialWorkoutId] : [])
  );
  const [highlightedWorkoutId, setHighlightedWorkoutId] = useState<string | null>(
    initialWorkoutId ?? null
  );

  function toggleWorkout(id: string) {
    setExpandedWorkouts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const [expandedWeeks, setExpandedWeeks] = useState<Set<number>>(() => {
    if (initialWorkoutId) {
      const target = workouts.find((w) => (w.id as string) === initialWorkoutId);
      if (target) return new Set([(target.weekIndex as number) ?? 0]);
    }
    return new Set([0]);
  });

  function toggleWeek(week: number) {
    setExpandedWeeks((prev) => {
      const next = new Set(prev);
      if (next.has(week)) next.delete(week);
      else next.add(week);
      return next;
    });
  }

  const weekGroups = workouts.reduce<Record<number, typeof workouts>>((acc, w) => {
    const week = (w.weekIndex as number) ?? 0;
    if (!acc[week]) acc[week] = [];
    acc[week].push(w);
    return acc;
  }, {});
  const weekNumbers = Object.keys(weekGroups).map(Number).sort((a, b) => a - b);

  useEffect(() => {
    if (!initialWorkoutId) return;
    // Delay so this runs after Next.js' own post-navigation scroll reset,
    // which otherwise races this scroll and wins.
    const scrollTimer = setTimeout(() => {
      document
        .getElementById(`workout-${initialWorkoutId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
    const timer = setTimeout(() => setHighlightedWorkoutId(null), 3000);
    return () => {
      clearTimeout(scrollTimer);
      clearTimeout(timer);
    };
  }, [initialWorkoutId]);

  return (
    <>
      <div className="space-y-3">
        {weekNumbers.map((weekIdx) => {
          const weekWorkouts = weekGroups[weekIdx].slice().sort(
            (a, b) => ((a.dayIndex as number) ?? 0) - ((b.dayIndex as number) ?? 0)
          );
          const isSingleWeek = weekNumbers.length === 1;
          const isWeekExpanded = isSingleWeek || expandedWeeks.has(weekIdx);
          const sessionCount = weekWorkouts.length;

          return (
            <Card key={weekIdx} className="gap-0 py-0">
              {!isSingleWeek && (
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-5 py-4 text-left outline-none transition-colors hover:bg-surface-muted focus-visible:bg-surface-muted motion-reduce:transition-none"
                  onClick={() => toggleWeek(weekIdx)}
                >
                  {isWeekExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                  <span className="text-heading text-foreground">Week {weekIdx + 1}</span>
                  <span className="text-body text-muted-foreground tabular-nums">
                    {sessionCount} session{sessionCount !== 1 ? "s" : ""}
                  </span>
                </button>
              )}

              {/* Workouts for this week */}
              {isWeekExpanded && (
                <div className={cn(!isSingleWeek && "border-t border-border", "divide-y divide-border")}>
                  {weekWorkouts.map((workout, dayPos) => {
                    const wId = workout.id as string;
                    const isExpanded = expandedWorkouts.has(wId);
                    const blocks = (workout.blocks as Record<string, unknown>[]) || [];
                    const scheduledDate = workout.scheduledDate as string | null | undefined;

                    return (
                      <div
                        key={wId}
                        id={`workout-${wId}`}
                        className={cn(
                          "transition-colors duration-1000",
                          highlightedWorkoutId === wId && "bg-primary/10 ring-1 ring-inset ring-primary/40"
                        )}
                      >
                        {/* Session row */}
                        <div className="flex items-center transition-colors hover:bg-surface-muted/60 motion-reduce:transition-none">
                          <button
                            type="button"
                            className="flex min-w-0 flex-1 items-center gap-3 px-5 py-3.5 text-left outline-none focus-visible:bg-surface-muted"
                            onClick={() => toggleWorkout(wId)}
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                            )}
                            <div className="flex items-center gap-2.5 flex-1 min-w-0">
                              {!(isResource && workouts.length === 1) && (
                                <span className="shrink-0 rounded-md bg-surface-muted px-2 py-0.5 text-caption font-medium ring-1 ring-border">
                                  Day {dayPos + 1}
                                </span>
                              )}
                              <span className="truncate text-label text-foreground">
                                {workout.name as string}
                              </span>
                              {scheduledDate && (
                                <span className="text-xs text-muted-foreground shrink-0">
                                  {format(toLocalCalendarDate(scheduledDate), "MMM d")}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 shrink-0 ml-auto">
                              {!!workout.estimatedMinutes && (
                                <span className="text-xs text-muted-foreground">
                                  ~{workout.estimatedMinutes as number} min
                                </span>
                              )}
                              <span className="text-xs text-muted-foreground">
                                {blocks.reduce((sum, b) => sum + ((b.exercises as unknown[]) || []).length, 0)} exercises
                              </span>
                            </div>
                          </button>
                          {renderWorkoutAction?.({ id: wId, name: workout.name as string })}
                        </div>

                        {/* Expanded blocks */}
                        {isExpanded && (
                          <div className="space-y-3 bg-surface-muted/50 px-5 pt-1 pb-4">
                            {blocks.map((block) => {
                              const bExercises = (block.exercises as Record<string, unknown>[]) || [];
                              return (
                                <div key={block.id as string} className="rounded-lg border border-border bg-card p-4">
                                  <div className="flex items-center gap-2 mb-3">
                                    <span className="text-label text-foreground">
                                      {(block.name as string) || "Block"}
                                    </span>
                                    {(block.type as string) !== "NORMAL" && (
                                      <Badge variant="outline" className="text-xs">
                                        {block.type as string}
                                      </Badge>
                                    )}
                                    {(block.rounds as number) > 1 && (
                                      <Badge variant="secondary" className="text-xs">
                                        {block.rounds as number} rounds
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="space-y-2">
                                    {bExercises.map((be) => {
                                      const exercise = be.exercise as Record<string, unknown>;
                                      const sets = (be.sets as Record<string, unknown>[]) || [];
                                      return (
                                        <div
                                          key={be.id as string}
                                          className="flex items-start gap-3 rounded-md bg-surface-muted p-3"
                                        >
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                              <button
                                                type="button"
                                                className="rounded-sm text-left text-label text-foreground outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                                                onClick={() => setDetailExercise(exercise)}
                                              >
                                                {exercise?.name as string}
                                              </button>
                                              {!!(exercise?.videoUrl) && (
                                                <button
                                                  type="button"
                                                  className="inline-flex items-center gap-0.5 text-[10px] bg-info-soft text-info-foreground border border-info-border px-1.5 py-0.5 rounded-sm font-medium hover:bg-info-border transition-colors"
                                                  onClick={() => setDetailExercise(exercise)}
                                                >
                                                  <Play className="h-2.5 w-2.5" /> Watch
                                                </button>
                                              )}
                                            </div>
                                            {!!(exercise?.description) && (
                                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                                {exercise.description as string}
                                              </p>
                                            )}
                                            {!!be.notes && (
                                              <p className="text-xs text-muted-foreground mt-0.5 italic">
                                                {be.notes as string}
                                              </p>
                                            )}
                                            {sets.length > 0 && (
                                              <div className="flex flex-wrap gap-2 mt-2">
                                                <Badge variant="secondary" className="text-xs">
                                                  {summarizeSets(sets)}
                                                </Badge>
                                                {!!be.restSeconds && (
                                                  <Badge variant="outline" className="text-xs text-muted-foreground">
                                                    Rest {be.restSeconds as number}s
                                                  </Badge>
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Exercise Detail Modal */}
      <Dialog open={!!detailExercise} onOpenChange={(open) => !open && setDetailExercise(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{detailExercise?.name as string}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!!(detailExercise?.videoUrl) ? (
              <div className="w-full aspect-video rounded-md overflow-hidden bg-black/10">
                <UniversalVideoPlayer
                  url={detailExercise.videoUrl as string}
                  provider={detailExercise.videoProvider as string | undefined}
                />
              </div>
            ) : (
              <div className="w-full flex items-center justify-center rounded-md bg-muted h-20">
                <p className="text-sm text-muted-foreground">No video available for this exercise</p>
              </div>
            )}
            {!!(detailExercise?.description) && (
              <p className="text-sm text-muted-foreground">{detailExercise.description as string}</p>
            )}
            {!!(detailExercise?.musclesTargeted) && (detailExercise.musclesTargeted as string[]).length > 0 && (
              <div className="text-sm">
                <span className="font-medium">Muscles targeted: </span>
                <span className="text-muted-foreground">{(detailExercise.musclesTargeted as string[]).join(", ")}</span>
              </div>
            )}
            {!!(detailExercise?.commonMistakes) && (
              <div className="text-sm">
                <span className="font-medium">Common mistakes: </span>
                <span className="text-muted-foreground">{detailExercise.commonMistakes as string}</span>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
