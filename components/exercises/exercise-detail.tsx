import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatBodyRegion, formatDifficulty } from "@/lib/utils/formatting";
import { ArrowUp, ArrowDown } from "lucide-react";
import type { Exercise } from "@prisma/client";

interface ExerciseDetailProps {
  exercise: Exercise & {
    media: Array<{ id: string; mediaType: string; url: string; altText: string | null }>;
    progressions: Array<{
      direction: string;
      nextExercise: Exercise | null;
    }>;
  };
}

const difficultyColors: Record<string, string> = {
  beginner: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  intermediate: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  advanced: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

export function ExerciseDetail({ exercise }: ExerciseDetailProps) {
  const progressionList = exercise.progressions.filter(
    (p) => p.direction === "progression" && p.nextExercise
  );
  const regressionList = exercise.progressions.filter(
    (p) => p.direction === "regression" && p.nextExercise
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-2">{exercise.name}</h1>
        <div className="flex flex-wrap gap-2 mb-4">
          {exercise.bodyRegion.map((region) => (
            <Badge key={region} variant="outline">{formatBodyRegion(region)}</Badge>
          ))}
          {exercise.difficultyLevel && (
            <Badge className={difficultyColors[exercise.difficultyLevel] ?? ""}>
              {formatDifficulty(exercise.difficultyLevel)}
            </Badge>
          )}
        </div>
        {exercise.description && (
          <p className="text-muted-foreground">{exercise.description}</p>
        )}
      </div>

      {exercise.equipmentRequired && exercise.equipmentRequired.length > 0 && (
        <div>
          <h3 className="font-semibold mb-2">Equipment Required</h3>
          <div className="flex flex-wrap gap-2">
            {exercise.equipmentRequired.map((eq) => (
              <Badge key={eq} variant="secondary">
                {eq.replace(/_/g, " ")}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {exercise.instructions && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Instructions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="whitespace-pre-wrap text-sm">{exercise.instructions}</div>
          </CardContent>
        </Card>
      )}

      {exercise.contraindications && exercise.contraindications.length > 0 && (
        <Card className="border-amber-200 dark:border-amber-800">
          <CardHeader>
            <CardTitle className="text-lg text-amber-700 dark:text-amber-400">
              Contraindications
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc pl-5 space-y-1">
              {exercise.contraindications.map((ci, i) => (
                <li key={i} className="text-sm">{ci}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {(progressionList.length > 0 || regressionList.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Progression Chain</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {regressionList.length > 0 && (
              <div>
                <h4 className="text-sm font-medium flex items-center gap-1.5 mb-2">
                  <ArrowDown className="h-4 w-4 text-blue-500" />
                  Easier Alternatives (Regressions)
                </h4>
                <div className="flex flex-wrap gap-2">
                  {regressionList.map((p) => (
                    <Badge key={p.nextExercise!.id} variant="secondary">
                      {p.nextExercise!.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {progressionList.length > 0 && (
              <div>
                <h4 className="text-sm font-medium flex items-center gap-1.5 mb-2">
                  <ArrowUp className="h-4 w-4 text-green-500" />
                  Harder Alternatives (Progressions)
                </h4>
                <div className="flex flex-wrap gap-2">
                  {progressionList.map((p) => (
                    <Badge key={p.nextExercise!.id} variant="secondary">
                      {p.nextExercise!.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {exercise.media.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Media</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
              {exercise.media.map((m) => (
                <div key={m.id}>
                  {m.mediaType === "video" ? (
                    <video src={m.url} controls className="w-full rounded-md" />
                  ) : (
                    <img
                      src={m.url}
                      alt={m.altText ?? exercise.name}
                      className="w-full rounded-md object-cover"
                    />
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
