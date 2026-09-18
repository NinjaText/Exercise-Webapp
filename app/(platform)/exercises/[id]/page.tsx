import { notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/current-user";
import { getExerciseById } from "@/lib/services/exercise.service";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/shared/page-shell";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatBodyRegion, formatDifficulty } from "@/lib/utils/formatting";
import { AlertTriangle, ArrowRight, Dumbbell, Edit, FileText, ListChecks, Target, Video } from "lucide-react";
import { ExerciseVideoPlayer } from "@/components/exercises/exercise-video-player";
import { DIFFICULTY_ROLE } from "@/lib/ui/status";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ExerciseDetailPage({ params }: Props) {
  const { id } = await params;
  const user = await getCurrentUser();
  const exercise = await getExerciseById(id);
  const hasAttachedVideo = exercise?.media?.some(
    (item) => item.mediaType?.toLowerCase() === "video"
  );

  if (!exercise) notFound();

  return (
    <PageShell>
      <PageHeader
        breadcrumb={[{ label: "Exercises", href: "/exercises" }, { label: exercise.name }]}
        title={exercise.name}
        primaryAction={
          user.role === "TRAINER" ? (
            <Button asChild>
              <Link href={`/exercises/${exercise.id}/edit`}>
                <Edit className="size-4" />
                Edit
              </Link>
            </Button>
          ) : undefined
        }
        meta={
          <>
            {exercise.bodyRegion.map((region) => (
              <StatusBadge key={region} status={region} label={formatBodyRegion(region)} role="neutral" />
            ))}
            {exercise.difficultyLevel && (
              <StatusBadge
                status={exercise.difficultyLevel}
                label={formatDifficulty(exercise.difficultyLevel)}
                role={DIFFICULTY_ROLE[exercise.difficultyLevel] ?? "neutral"}
              />
            )}
            {exercise.exercisePhases?.map((phase) => (
              <StatusBadge
                key={phase}
                status={phase}
                label={phase.charAt(0) + phase.slice(1).toLowerCase()}
                role="neutral"
                dot={false}
              />
            ))}
          </>
        }
      />

      {(exercise.videoUrl || hasAttachedVideo || exercise.media.length > 0) && (
        <SectionCard title="Media" icon={Video}>
          <div className="space-y-6">
            {exercise.videoUrl || hasAttachedVideo ? (
              <ExerciseVideoPlayer
                videoUrl={exercise.videoUrl}
                mediaItems={exercise.media}
                className="w-full"
              />
            ) : (
              <div className="flex h-24 items-center justify-center rounded-lg bg-muted">
                <p className="text-sm text-muted-foreground">No video available for this exercise</p>
              </div>
            )}

            {exercise.media.filter((m) => m.mediaType !== "image").length > 0 && (
              <div>
                <h3 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Additional Videos
                </h3>
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                  {exercise.media
                    .filter((item) => item.mediaType !== "image")
                    .map((item) => (
                      <div key={item.id} className="overflow-hidden rounded-lg bg-muted">
                        <ExerciseVideoPlayer videoUrl={item.url} mediaItems={[]} className="w-full" />
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </SectionCard>
      )}

      {exercise.description && (
        <SectionCard title="Description" icon={FileText}>
          <p className="text-muted-foreground">{exercise.description}</p>
        </SectionCard>
      )}

      {exercise.musclesTargeted && exercise.musclesTargeted.length > 0 && (
        <SectionCard title="Muscles Targeted" icon={Target}>
          <div className="flex flex-wrap gap-2">
            {exercise.musclesTargeted.map((m: string) => (
              <Badge key={m} variant="outline" className="text-xs capitalize">{m}</Badge>
            ))}
          </div>
        </SectionCard>
      )}

      {exercise.instructions && (
        <SectionCard title="Instructions" icon={FileText}>
          <p className="whitespace-pre-line leading-relaxed text-muted-foreground">{exercise.instructions}</p>
        </SectionCard>
      )}

      {exercise.cuesThumbnail && (
        <div className="rounded-lg border border-info-border bg-info-soft p-4">
          <h3 className="mb-1 text-sm font-semibold text-info-foreground">Key Form Cues</h3>
          <p className="text-sm text-info-foreground">{exercise.cuesThumbnail}</p>
        </div>
      )}

      {exercise.commonMistakes && (
        <div className="rounded-lg border border-warning-border bg-warning-soft p-4">
          <h3 className="mb-1 text-sm font-semibold text-warning-foreground">Common Mistakes to Avoid</h3>
          <p className="text-sm text-warning-foreground">{exercise.commonMistakes}</p>
        </div>
      )}

      {(exercise.defaultSets || exercise.defaultReps || exercise.defaultHoldSeconds) && (
        <SectionCard title="Default Prescription" icon={ListChecks}>
          <p className="text-muted-foreground">
            {exercise.defaultSets && `${exercise.defaultSets} sets`}
            {exercise.defaultReps && ` × ${exercise.defaultReps} reps`}
            {exercise.defaultHoldSeconds && ` × ${exercise.defaultHoldSeconds}s hold`}
          </p>
        </SectionCard>
      )}

      {exercise.equipmentRequired.length > 0 && (
        <SectionCard title="Equipment" icon={Dumbbell}>
          <div className="flex flex-wrap gap-2">
            {exercise.equipmentRequired.map((eq) => (
              <Badge key={eq} variant="outline">{eq}</Badge>
            ))}
          </div>
        </SectionCard>
      )}

      {exercise.contraindications.length > 0 && (
        <SectionCard title="Contraindications" icon={AlertTriangle}>
          <ul className="list-inside list-disc text-muted-foreground">
            {exercise.contraindications.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </SectionCard>
      )}

      {exercise.progressionsFrom.length > 0 && (
        <SectionCard title="Progressions" icon={ArrowRight}>
          <div className="space-y-2">
            {exercise.progressionsFrom.map((p) => (
              <Link
                key={p.id}
                href={`/exercises/${p.nextExerciseId}`}
                className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm hover:bg-muted/50"
              >
                <ArrowRight className="size-4 text-success" />
                <span className="font-medium">{p.nextExercise.name}</span>
                <Badge variant="secondary" className="text-xs">
                  {p.direction === "PROGRESSION" ? "Harder" : "Easier"}
                </Badge>
              </Link>
            ))}
          </div>
        </SectionCard>
      )}
    </PageShell>
  );
}
