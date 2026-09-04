import { Suspense } from "react";
import { auth } from "@clerk/nextjs/server";
import { requireRole } from "@/lib/current-user";
import { getExercisesPage, getDistinctEquipment, getFavoriteExerciseIds } from "@/lib/services/exercise.service";
import { ExerciseGrid } from "@/components/exercises/exercise-grid";
import { ExerciseFilters } from "@/components/exercises/exercise-filters";
import { ExerciseToolbarSelects } from "@/components/exercises/exercise-toolbar-selects";
import { PaginationBar } from "@/components/shared/pagination-bar";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Dumbbell, Plus, Upload } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { expandMuscleGroups } from "@/lib/utils/constants";
import type { BodyRegion, DifficultyLevel, ExercisePhase, ExerciseSource } from "@prisma/client";

const PAGE_SIZE = 24;

interface Props {
  searchParams: Promise<{
    search?: string;
    bodyRegion?: string;
    difficultyLevel?: string;
    exercisePhase?: string;
    muscleGroup?: string;
    equipment?: string;
    source?: string;
    kind?: string;
    hasVideo?: string;
    favorite?: string;
    sort?: string;
    page?: string;
  }>;
}

export default async function ExercisesPage({ searchParams }: Props) {
  const [user, { orgId: sessionOrgId }] = await Promise.all([
    requireRole("TRAINER"),
    auth(),
  ]);
  const params = await searchParams;
  const activeSource = params.source === "ORGANIZATION" ? "ORGANIZATION" : "UNIVERSAL";
  const activeKind = params.kind === "assessment" ? "assessment" : "training";
  const sort = params.sort === "name_desc" ? "name_desc" : "name_asc";
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);

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
  const difficultyLevels = params.difficultyLevel
    ? (params.difficultyLevel.split(",").filter(Boolean) as DifficultyLevel[])
    : undefined;
  const equipment = params.equipment
    ? params.equipment.split(",").filter(Boolean)
    : undefined;

  const [favoriteExerciseIds, equipmentOptions] = await Promise.all([
    getFavoriteExerciseIds(user.id),
    getDistinctEquipment(),
  ]);
  const favoriteIdSet = new Set(favoriteExerciseIds);

  const { exercises, total } = await getExercisesPage(
    {
      search: params.search,
      bodyRegions,
      difficultyLevels,
      exercisePhases,
      muscleGroups,
      equipment,
      source: activeSource as ExerciseSource,
      organizationId: activeSource === "ORGANIZATION" ? organizationOrgId : undefined,
      isAssessment: activeKind === "assessment",
      hasVideo: params.hasVideo === "true",
      favoriteExerciseIds: params.favorite === "true" ? favoriteExerciseIds : undefined,
    },
    { page, pageSize: PAGE_SIZE, sort }
  );

  const baseParams = () => {
    const sp = new URLSearchParams();
    if (params.search)          sp.set("search",          params.search);
    if (params.bodyRegion)      sp.set("bodyRegion",      params.bodyRegion);
    if (params.difficultyLevel) sp.set("difficultyLevel", params.difficultyLevel);
    if (params.exercisePhase)   sp.set("exercisePhase",   params.exercisePhase);
    if (params.muscleGroup)     sp.set("muscleGroup",     params.muscleGroup);
    if (params.equipment)       sp.set("equipment",       params.equipment);
    if (params.hasVideo)        sp.set("hasVideo",        params.hasVideo);
    if (params.favorite)        sp.set("favorite",        params.favorite);
    if (sort !== "name_asc")    sp.set("sort",            sort);
    if (activeKind === "assessment") sp.set("kind", "assessment");
    return sp;
  };

  const tabUrl = (source: string) => {
    const sp = baseParams();
    sp.set("source", source);
    return `/exercises?${sp.toString()}`;
  };

  const kindUrl = (kind: "training" | "assessment") => {
    const sp = baseParams();
    sp.delete("kind");
    if (kind === "assessment") sp.set("kind", "assessment");
    sp.set("source", activeSource);
    return `/exercises?${sp.toString()}`;
  };

  const sortUrl = (nextSort: "name_asc" | "name_desc") => {
    const sp = baseParams();
    sp.delete("sort");
    if (nextSort !== "name_asc") sp.set("sort", nextSort);
    sp.set("source", activeSource);
    return `/exercises?${sp.toString()}`;
  };

  const pageUrl = (nextPage: number) => {
    const sp = baseParams();
    sp.set("source", activeSource);
    if (nextPage > 1) sp.set("page", String(nextPage));
    return `/exercises?${sp.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold">Exercise Library</h2>
          <p className="text-muted-foreground">{total} exercises</p>
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
        {(["training", "assessment"] as const).map((k) => (
          <Link
            key={k}
            href={kindUrl(k)}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeKind === k
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {k === "training" ? "Training" : "Assessment"}
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Suspense fallback={<Skeleton className="h-10 w-full max-w-lg" />}>
          <ExerciseFilters equipmentOptions={equipmentOptions} />
        </Suspense>

        <ExerciseToolbarSelects
          activeSource={activeSource}
          sort={sort}
          sourceUrls={{ UNIVERSAL: tabUrl("UNIVERSAL"), ORGANIZATION: tabUrl("ORGANIZATION") }}
          sortUrls={{ name_asc: sortUrl("name_asc"), name_desc: sortUrl("name_desc") }}
        />
      </div>

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
        <>
          <ExerciseGrid
            exercises={exercises}
            activeSource={activeSource}
            organizationOrgId={organizationOrgId}
            favoriteIds={favoriteIdSet}
          />
          <PaginationBar page={page} pageSize={PAGE_SIZE} total={total} buildHref={pageUrl} itemLabel="exercises" />
        </>
      )}
    </div>
  );
}
