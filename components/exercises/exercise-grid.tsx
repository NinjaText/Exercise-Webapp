"use client";

import { ExerciseCard } from "@/components/exercises/exercise-card";
import type { getExercises } from "@/lib/services/exercise.service";

type ExerciseListItem = Awaited<ReturnType<typeof getExercises>>[number];

interface ExerciseGridProps {
  exercises: ExerciseListItem[];
  activeSource: "UNIVERSAL" | "ORGANIZATION";
  organizationOrgId?: string;
}

export function ExerciseGrid({ exercises, activeSource, organizationOrgId }: ExerciseGridProps) {
  const canAdopt = activeSource === "UNIVERSAL" && !!organizationOrgId;

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
          source={exercise.source}
          isPublic={exercise.isPublic}
          organizationId={exercise.organizationId}
          organizationOrganizationId={organizationOrgId}
          canAdopt={canAdopt}
        />
      ))}
    </div>
  );
}
