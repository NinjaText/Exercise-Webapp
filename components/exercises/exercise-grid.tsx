"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ExerciseCard } from "@/components/exercises/exercise-card";
import { adoptUniversalExercisesAction } from "@/actions/exercise-actions";
import type { getExercisesPage } from "@/lib/services/exercise.service";

type ExerciseListItem = Awaited<ReturnType<typeof getExercisesPage>>["exercises"][number];

interface ExerciseGridProps {
  exercises: ExerciseListItem[];
  activeSource: "UNIVERSAL" | "ORGANIZATION";
  organizationOrgId?: string;
  favoriteIds: Set<string>;
}

// adoptUniversalExercisesAction clones each id sequentially server-side (no
// batching/concurrency internally), so submitting hundreds of ids in one
// server-action invocation risks approaching typical function time budgets.
// Splitting into smaller sequential calls keeps each invocation bounded.
const BULK_ADOPT_BATCH_SIZE = 25;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

export function ExerciseGrid({ exercises, activeSource, organizationOrgId, favoriteIds }: ExerciseGridProps) {
  const router = useRouter();
  const canAdopt = activeSource === "UNIVERSAL" && !!organizationOrgId;

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isAdopting, startAdopting] = useTransition();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const allSelected = exercises.length > 0 && exercises.every((ex) => selectedIds.has(ex.id));
  const someSelected = exercises.some((ex) => selectedIds.has(ex.id)) && !allSelected;

  // Derive the effective selection from the currently-visible exercises rather
  // than the raw selectedIds Set: a soft navigation (tab switch via ?source=,
  // or a filter change) replaces the `exercises` prop without clearing
  // selectedIds, so ids no longer visible must be dropped from what's
  // displayed and submitted (see Finding 1 in the final-review notes).
  const visibleSelectedIds = exercises.filter((ex) => selectedIds.has(ex.id)).map((ex) => ex.id);

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds((prev) => {
      if (allSelected) {
        const next = new Set(prev);
        exercises.forEach((ex) => next.delete(ex.id));
        return next;
      }
      const next = new Set(prev);
      exercises.forEach((ex) => next.add(ex.id));
      return next;
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  function handleBulkAdopt() {
    const ids = visibleSelectedIds;
    if (ids.length === 0) return;

    startAdopting(async () => {
      let totalSuccessCount = 0;
      const allFailures: { id: string; error: string }[] = [];
      let hardError: string | null = null;

      for (const batch of chunk(ids, BULK_ADOPT_BATCH_SIZE)) {
        const result = await adoptUniversalExercisesAction(batch);
        if (!result.success) {
          hardError = result.error;
          break; // stop on a hard failure rather than continuing to submit more batches
        }
        totalSuccessCount += result.successCount;
        allFailures.push(...result.failures);
      }

      if (hardError) {
        toast.error(hardError);
        return;
      }

      if (allFailures.length === 0) {
        toast.success(`Added ${totalSuccessCount} exercise${totalSuccessCount !== 1 ? "s" : ""} to your organization`);
      } else if (totalSuccessCount > 0) {
        toast.warning(`Added ${totalSuccessCount} of ${ids.length} — ${allFailures.length} could not be added`);
      } else {
        toast.error("Could not add the selected exercises");
      }

      exitSelectMode();
      if (totalSuccessCount > 0) router.push("/exercises?source=ORGANIZATION");
    });
  }

  return (
    <div className="space-y-3">
      {canAdopt && (
        <div className="flex items-center justify-between">
          {selectMode ? (
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Checkbox
                checked={allSelected}
                indeterminate={someSelected}
                onCheckedChange={toggleAll}
                aria-label="Select all exercises on this page"
              />
              Select all on this page
            </label>
          ) : (
            <span />
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
          >
            {selectMode ? "Cancel" : "Select"}
          </Button>
        </div>
      )}

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
            canAdopt={canAdopt}
            selectable={selectMode && canAdopt}
            selected={selectedIds.has(exercise.id)}
            onToggleSelect={() => toggleOne(exercise.id)}
            isFavorite={favoriteIds.has(exercise.id)}
          />
        ))}
      </div>

      {mounted && canAdopt && selectMode && visibleSelectedIds.length > 0 && createPortal(
        <div className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
          <div className="flex items-center gap-3 rounded-full border border-border bg-background/95 px-4 py-2 shadow-lg backdrop-blur">
            <span className="text-sm font-medium">{visibleSelectedIds.length} selected</span>
            <Button size="sm" onClick={handleBulkAdopt} disabled={isAdopting}>
              {isAdopting ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-1.5 h-4 w-4" />
              )}
              Add to My Organization
            </Button>
            <Button size="sm" variant="ghost" onClick={exitSelectMode} disabled={isAdopting}>
              <X className="mr-1.5 h-4 w-4" />
              Clear
            </Button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
