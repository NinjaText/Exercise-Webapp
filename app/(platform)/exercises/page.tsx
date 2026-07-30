import { Suspense } from "react";
import { auth } from "@clerk/nextjs/server";
import { requireRole } from "@/lib/current-user";
import { getExercises } from "@/lib/services/exercise.service";
import { ExerciseGrid } from "@/components/exercises/exercise-grid";
import { ExerciseFilters } from "@/components/exercises/exercise-filters";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Dumbbell, Plus, Upload } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { expandMuscleGroups } from "@/lib/utils/constants";
import type { BodyRegion, DifficultyLevel, ExercisePhase, ExerciseSource } from "@prisma/client";

interface Props {
  searchParams: Promise<{
    search?: string;
    bodyRegion?: string;
    difficultyLevel?: string;
    exercisePhase?: string; // comma-separated ExercisePhase values
    muscleGroup?: string; // comma-separated MUSCLE_GROUPS values
    equipment?: string;
    source?: string;
  }>;
}

export default async function ExercisesPage({ searchParams }: Props) {
  const [user, { orgId: sessionOrgId }] = await Promise.all([
    requireRole("TRAINER"),
    auth(),
  ]);
  const params = await searchParams;
  const activeSource = params.source === "ORGANIZATION" ? "ORGANIZATION" : "UNIVERSAL";

  // Prefer live session orgId — dbUser.clerkOrgId may be null for accounts created before orgs were set up
  const organizationOrgId = sessionOrgId ?? user.clerkOrgId ?? undefined;

  const exercisePhases = params.exercisePhase
    ? (params.exercisePhase.split(",").filter(Boolean) as ExercisePhase[])
    : undefined;
  const bodyRegions = params.bodyRegion
    ? (params.bodyRegion.split(",").filter(Boolean) as BodyRegion[])
    : undefined;
  const muscleGroupCodes = params.muscleGroup
    ? params.muscleGroup.split(",").filter(Boolean)
    : undefined;
  const muscleGroups = muscleGroupCodes?.length
    ? expandMuscleGroups(muscleGroupCodes)
    : undefined;

  const exercises = await getExercises({
    search: params.search,
    bodyRegions,
    difficultyLevel: params.difficultyLevel as DifficultyLevel | undefined,
    exercisePhases,
    muscleGroups,
    equipment: params.equipment,
    source: activeSource as ExerciseSource,
    organizationId: activeSource === "ORGANIZATION" ? organizationOrgId : undefined,
  });

  const tabUrl = (source: string) => {
    const sp = new URLSearchParams();
    if (params.search)          sp.set("search",          params.search);
    if (params.bodyRegion)      sp.set("bodyRegion",      params.bodyRegion);
    if (params.difficultyLevel) sp.set("difficultyLevel", params.difficultyLevel);
    if (params.exercisePhase)   sp.set("exercisePhase",   params.exercisePhase);
    if (params.muscleGroup)     sp.set("muscleGroup",     params.muscleGroup);
    if (params.equipment)       sp.set("equipment",       params.equipment);
    sp.set("source", source);
    return `/exercises?${sp.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold">Exercise Library</h2>
          <p className="text-muted-foreground">{exercises.length} exercises</p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Button variant="outline" size="sm" asChild>
            <Link href="/exercises/bulk-import">
              <Upload className="h-4 w-4 mr-1.5" />
              Import
            </Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/exercises/new">
              <Plus className="h-4 w-4 mr-1.5" />
              New Exercise
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex gap-1 border-b">
        {(["UNIVERSAL", "ORGANIZATION"] as const).map((src) => (
          <Link
            key={src}
            href={tabUrl(src)}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeSource === src
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {src === "UNIVERSAL" ? "Universal" : "My Organization"}
          </Link>
        ))}
      </div>

      <Suspense fallback={<Skeleton className="h-10 w-full max-w-lg" />}>
        <ExerciseFilters />
      </Suspense>

      {exercises.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Dumbbell className="mx-auto h-12 w-12 text-muted-foreground/40" />
          <h3 className="mt-4 font-semibold">No exercises found</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {activeSource === "ORGANIZATION"
              ? "Your organization hasn't added any exercises yet."
              : "Try adjusting your filters, or add a new exercise to the library."}
          </p>
        </div>
      ) : (
        <ExerciseGrid
          exercises={exercises}
          activeSource={activeSource}
          organizationOrgId={organizationOrgId}
        />
      )}
    </div>
  );
}
