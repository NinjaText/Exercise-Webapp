import { notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/current-user";
import { getExerciseById } from "@/lib/services/exercise.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatBodyRegion, formatDifficulty } from "@/lib/utils/formatting";
import { ArrowLeft, ArrowRight, Edit } from "lucide-react";
import { ExerciseVideoPlayer } from "@/components/exercises/exercise-video-player";
import { ExerciseImage } from "@/components/exercises/exercise-image";

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
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/exercises">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-2xl">{exercise.name}</CardTitle>
              <div className="mt-2 flex flex-wrap gap-2">
                {exercise.bodyRegion.map((region) => (
                  <Badge key={region} variant="secondary">{formatBodyRegion(region)}</Badge>
                ))}
                <Badge variant="secondary">{formatDifficulty(exercise.difficultyLevel)}</Badge>
                {exercise.exercisePhases?.map((phase) => (
                  <Badge key={phase} className="bg-indigo-100 text-indigo-700 border-0">
                    {phase.charAt(0) + phase.slice(1).toLowerCase()}
                  </Badge>
                ))}
              </div>
            </div>
            {user.role === "TRAINER" && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/exercises/${exercise.id}/edit`}>
                  <Edit className="mr-1 h-4 w-4" />
                  Edit
                </Link>
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">

          {/* Video — full width */}
          {(exercise.videoUrl || hasAttachedVideo) ? (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">Video Demo</h3>
              <ExerciseVideoPlayer
                videoUrl={exercise.videoUrl}
                mediaItems={exercise.media}
                className="w-full"
              />
            </div>
          ) : (
            <div className="flex items-center justify-center rounded-lg bg-muted h-24">
              <p className="text-sm text-muted-foreground">No video available for this exercise</p>
            </div>
          )}

          {/* Additional video-only media gallery */}
          {exercise.media.filter((m) => m.mediaType !== "image").length > 0 && (
            <div>
              <h3 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">Additional Videos</h3>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                {exercise.media
                  .filter((item) => item.mediaType !== "image")
                  .map((item) => (
                    <div key={item.id} className="rounded-lg overflow-hidden bg-muted">
                      <ExerciseVideoPlayer
                        videoUrl={item.url}
                        mediaItems={[]}
                        className="w-full"
                      />
                    </div>
                  ))}
              </div>
            </div>
          )}

          {exercise.description && (
            <div>
              <h3 className="mb-2 font-semibold text-foreground">Description</h3>
              <p className="text-muted-foreground">{exercise.description}</p>
            </div>
          )}

          {/* Muscles targeted */}
          {exercise.musclesTargeted && exercise.musclesTargeted.length > 0 && (
            <div>
              <h3 className="mb-2 font-semibold text-foreground">Muscles Targeted</h3>
              <div className="flex flex-wrap gap-2">
                {exercise.musclesTargeted.map((m: string) => (
                  <Badge key={m} variant="outline" className="text-xs capitalize">{m}</Badge>
                ))}
              </div>
            </div>
          )}

          {exercise.instructions && (
            <div>
              <h3 className="mb-2 font-semibold text-foreground">Instructions</h3>
              <p className="whitespace-pre-line text-muted-foreground leading-relaxed">{exercise.instructions}</p>
            </div>
          )}

          {/* Form cues */}
          {exercise.cuesThumbnail && (
            <div className="rounded-lg bg-blue-50 p-4 border border-blue-100">
              <h3 className="mb-1 text-sm font-semibold text-blue-800">Key Form Cues</h3>
              <p className="text-sm text-blue-700">{exercise.cuesThumbnail}</p>
            </div>
          )}

          {/* Common mistakes */}
          {exercise.commonMistakes && (
            <div className="rounded-lg bg-amber-50 p-4 border border-amber-100">
              <h3 className="mb-1 text-sm font-semibold text-amber-800">Common Mistakes to Avoid</h3>
              <p className="text-sm text-amber-700">{exercise.commonMistakes}</p>
            </div>
          )}

          {/* Default prescription */}
          {(exercise.defaultSets || exercise.defaultReps || exercise.defaultHoldSeconds) && (
            <div>
              <h3 className="mb-2 font-semibold text-foreground">Default Prescription</h3>
              <p className="text-muted-foreground">
                {exercise.defaultSets && `${exercise.defaultSets} sets`}
                {exercise.defaultReps && ` × ${exercise.defaultReps} reps`}
                {exercise.defaultHoldSeconds && ` × ${exercise.defaultHoldSeconds}s hold`}
              </p>
            </div>
          )}

          {exercise.equipmentRequired.length > 0 && (
            <div>
              <h3 className="mb-2 font-semibold text-foreground">Equipment</h3>
              <div className="flex flex-wrap gap-2">
                {exercise.equipmentRequired.map((eq) => (
                  <Badge key={eq} variant="outline">{eq}</Badge>
                ))}
              </div>
            </div>
          )}

          {exercise.contraindications.length > 0 && (
            <div>
              <h3 className="mb-2 font-semibold text-foreground">Contraindications</h3>
              <ul className="list-inside list-disc text-muted-foreground">
                {exercise.contraindications.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Progressions */}
          {exercise.progressionsFrom.length > 0 && (
            <div>
              <h3 className="mb-2 font-semibold text-foreground">Progressions</h3>
              <div className="space-y-2">
                {exercise.progressionsFrom.map((p) => (
                  <Link
                    key={p.id}
                    href={`/exercises/${p.nextExerciseId}`}
                    className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm hover:bg-muted/50"
                  >
                    <ArrowRight className="h-4 w-4 text-green-600" />
                    <span className="font-medium">{p.nextExercise.name}</span>
                    <Badge variant="secondary" className="text-xs">
                      {p.direction === "PROGRESSION" ? "Harder" : "Easier"}
                    </Badge>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
