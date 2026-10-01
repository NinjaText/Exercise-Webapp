import { ExerciseCard } from "@/components/exercises/exercise-card";
import type { getExercisesPage } from "@/lib/services/exercise.service";

type ExerciseListItem = Awaited<ReturnType<typeof getExercisesPage>>["exercises"][number];

interface ExerciseGridProps {
  exercises: ExerciseListItem[];
  favoriteIds: Set<string>;
}

export function ExerciseGrid({ exercises, favoriteIds }: ExerciseGridProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {exercises.map((exercise) => (
        <ExerciseCard
          key={exercise.id}
          id={exercise.id}
          name={exercise.name}
          bodyRegion={exercise.bodyRegion}
          difficultyLevel={exercise.difficultyLevel}
          exercisePhases={exercise.exercisePhases}
          equipmentRequired={exercise.equipmentRequired}
          description={exercise.description}
          imageUrl={exercise.imageUrl}
          videoUrl={exercise.videoUrl}
          isActive={exercise.isActive}
          isTrainer
          isFavorite={favoriteIds.has(exercise.id)}
        />
      ))}
    </div>
  );
}
