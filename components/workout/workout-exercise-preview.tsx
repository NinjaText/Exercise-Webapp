"use client";

import { useState } from "react";
import { ChevronRight, Dumbbell, PlayCircle, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ExerciseVideoPlayer } from "@/components/exercises/exercise-video-player";
import { ExerciseImage } from "@/components/exercises/exercise-image";
import { instructionsToBullets } from "./format-instructions";
import { getPrescriptionText, isCircuitBlock, type PrescriptionSet } from "./prescription";
import { WORKOUT_STATE } from "./workout-tokens";

/** The slice of a session's workout the preview reads (both trackers' shapes satisfy it). */
export type PreviewExercise = {
  id: string;
  notes?: string | null;
  activityType?: string | null;
  sets: PrescriptionSet[];
  exercise: {
    name: string;
    imageUrl?: string | null;
    videoUrl?: string | null;
    instructions?: string | null;
    media?: { id: string; url: string; type: string }[];
  };
};

export type PreviewBlock = {
  id: string;
  type: string;
  name?: string | null;
  rounds?: number | null;
  exercises?: PreviewExercise[];
};

type Selected = { exercise: PreviewExercise; block: PreviewBlock };

function thumbnailOf(ex: PreviewExercise): string | undefined {
  return ex.exercise.imageUrl ?? ex.exercise.media?.find((m) => m.type.toLowerCase() === "image")?.url ?? undefined;
}

function hasVideo(ex: PreviewExercise): boolean {
  return Boolean(ex.exercise.videoUrl || ex.exercise.media?.some((m) => m.type.toLowerCase() === "video"));
}

/**
 * Every exercise in the workout, grouped by block, so a client can see what
 * they're in for before starting. Tapping an exercise opens its demo, the
 * prescription, the trainer's tip and the instructions.
 */
export function WorkoutExercisePreview({ blocks }: { blocks: PreviewBlock[] }) {
  const [selected, setSelected] = useState<Selected | null>(null);

  return (
    <>
      <div className="flex flex-col gap-3">
        {blocks.map((block) => {
          const exercises = block.exercises ?? [];
          const rounds = isCircuitBlock(block.type) ? (block.rounds ?? 1) : 1;
          return (
            <section
              key={block.id}
              aria-label={block.name || block.type}
              className="overflow-hidden rounded-lg border border-border"
            >
              <header className="flex min-h-11 items-center gap-3 bg-surface-muted/50 px-3 py-2">
                <span className="flex-1 truncate text-label text-foreground">{block.name || block.type}</span>
                {rounds > 1 && (
                  <Badge variant="secondary" className="shrink-0">
                    <RotateCcw className="size-3" aria-hidden />
                    {rounds} rounds
                  </Badge>
                )}
                <span className="shrink-0 text-caption tabular-nums">{exercises.length} ex.</span>
              </header>
              <ol className="divide-y divide-border border-t border-border">
                {exercises.map((ex) => {
                  const thumbnail = thumbnailOf(ex);
                  return (
                    <li key={ex.id}>
                      <button
                        type="button"
                        onClick={() => setSelected({ exercise: ex, block })}
                        className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left outline-none transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none"
                      >
                        <span className="relative size-10 shrink-0 overflow-hidden rounded-lg bg-muted">
                          {thumbnail ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={thumbnail} alt="" className="size-full object-cover" loading="lazy" />
                          ) : (
                            <span className="flex size-full items-center justify-center">
                              <Dumbbell className="size-4 text-muted-foreground/50" aria-hidden />
                            </span>
                          )}
                          {hasVideo(ex) && (
                            <PlayCircle
                              className="absolute right-0.5 bottom-0.5 size-3.5 rounded-full bg-background text-primary"
                              aria-hidden
                            />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-label text-foreground">{ex.exercise.name}</span>
                          <span className="block truncate text-caption tabular-nums">{getPrescriptionText(ex, block)}</span>
                        </span>
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ol>
            </section>
          );
        })}
      </div>

      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          {selected && <ExerciseDetail {...selected} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ExerciseDetail({ exercise: ex, block }: Selected) {
  const prescription = getPrescriptionText(ex, block);
  const thumbnail = thumbnailOf(ex);

  return (
    <>
      <DialogHeader>
        <DialogTitle>{ex.exercise.name}</DialogTitle>
        <DialogDescription>
          {block.name || block.type}
          {prescription && ` · ${prescription}`}
        </DialogDescription>
      </DialogHeader>

      {hasVideo(ex) ? (
        <ExerciseVideoPlayer
          videoUrl={ex.exercise.videoUrl ?? undefined}
          mediaItems={(ex.exercise.media ?? []).map((m) => ({ id: m.id, url: m.url, mediaType: m.type }))}
        />
      ) : thumbnail ? (
        <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-muted">
          <ExerciseImage src={thumbnail} alt={ex.exercise.name} />
        </div>
      ) : null}

      {ex.notes && (
        <div className="rounded-lg bg-surface-muted px-3 py-2.5">
          <p className={`text-body ${WORKOUT_STATE.current.text}`}>
            <span className="font-semibold">Tip:</span> <span className="italic">{ex.notes}</span>
          </p>
        </div>
      )}

      {ex.exercise.instructions && (
        <div className="flex flex-col gap-1.5">
          <p className="text-label text-foreground">Instructions</p>
          <ul className="list-disc space-y-1 pl-4 text-body text-muted-foreground">
            {instructionsToBullets(ex.exercise.instructions).map((line, idx) => (
              <li key={idx}>{line}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
