"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { DIFFICULTY_ROLE } from "@/lib/ui/status";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dumbbell, Pencil, Trash2, Loader2, X, PlayCircle } from "lucide-react";
import { DeleteExerciseButton } from "@/components/admin/delete-exercise-button";
import { ExerciseImage } from "@/components/exercises/exercise-image";
import { hasRealVideoUrl } from "@/lib/utils/video";
import { cn } from "@/lib/utils";
import { bulkDeleteExercisesAction } from "@/actions/exercise-actions";
import { formatBodyRegion, formatDifficulty } from "@/lib/utils/formatting";
import type { getAllExercises } from "@/lib/services/admin.service";

type ExerciseRow = Awaited<ReturnType<typeof getAllExercises>>["items"][number];

const phaseLabel: Record<string, string> = {
  WARMUP: "Warm-up", ACTIVATION: "Activation", STRENGTHENING: "Strengthening",
  MOBILITY: "Mobility", COOLDOWN: "Cool-down",
};

/** Mirrors the trainer-side ExerciseCard so admins can recognise an exercise
 *  by its thumbnail, with admin-only details (creator, date, status) and actions. */
function AdminExerciseCard({
  exercise: ex,
  selected,
  onToggleSelect,
}: {
  exercise: ExerciseRow;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const editHref = `/admin/exercises/${ex.id}/edit`;
  const phases = ex.exercisePhases ?? [];

  return (
    <Card
      className={cn(
        "group relative flex flex-col overflow-hidden ring-1 ring-border shadow-none transition-shadow duration-250 hover:shadow-sm hover:ring-border-strong",
        !ex.isActive && "opacity-60",
        selected && "ring-2 ring-primary hover:ring-primary"
      )}
    >
      <div className="absolute left-2 top-2 z-20">
        <Checkbox
          checked={selected}
          onCheckedChange={onToggleSelect}
          aria-label={`Select ${ex.name}`}
          className="bg-background/90"
        />
      </div>

      <Link href={editHref} className="relative block h-44 overflow-hidden bg-muted">
        <ExerciseImage src={null} alt={ex.name} videoUrl={ex.videoUrl} label={ex.name.split(" ").slice(0, 3).join(" ")} />
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <div className="flex items-center gap-1.5 rounded-full bg-white/90 px-4 py-1.5 text-sm font-semibold text-foreground shadow-lg backdrop-blur-sm">
            <Pencil className="h-3.5 w-3.5" />
            Edit Exercise
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-2.5">
          {phases.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {phases.map((p: string) => (
                <span
                  key={p}
                  className="rounded-full bg-foreground/75 px-2 py-0.5 text-[10px] font-semibold text-background backdrop-blur-sm"
                >
                  {phaseLabel[p] ?? p}
                </span>
              ))}
            </div>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            {hasRealVideoUrl(ex.videoUrl) && (
              <span className="flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
                <PlayCircle className="h-3 w-3" />Video
              </span>
            )}
          </div>
        </div>
      </Link>

      <CardContent className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <Link href={editHref} className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold leading-tight transition-colors group-hover:text-primary">
              {ex.name}
            </h3>
          </Link>
          {ex.difficultyLevel && (
            <StatusBadge
              status={ex.difficultyLevel}
              label={formatDifficulty(ex.difficultyLevel)}
              role={DIFFICULTY_ROLE[ex.difficultyLevel] ?? "neutral"}
              size="sm"
              dot={false}
              className="shrink-0"
            />
          )}
        </div>

        <p className="mt-1 text-xs font-medium text-muted-foreground/70">
          {ex.bodyRegion.map(formatBodyRegion).join(", ")}
        </p>

        {ex.description && (
          <p className="mt-2 line-clamp-2 flex-1 text-xs leading-relaxed text-muted-foreground">{ex.description}</p>
        )}

        {ex.equipmentRequired.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {ex.equipmentRequired.slice(0, 3).map((eq: string) => (
              <Badge key={eq} variant="outline" className="h-5 px-1.5 text-[10px] font-medium text-muted-foreground">
                {eq}
              </Badge>
            ))}
            {ex.equipmentRequired.length > 3 && (
              <Badge variant="outline" className="h-5 px-1.5 text-[10px] text-muted-foreground">
                +{ex.equipmentRequired.length - 3}
              </Badge>
            )}
          </div>
        )}

        <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-medium text-foreground">
              {ex.createdBy ? `${ex.createdBy.firstName ?? ""} ${ex.createdBy.lastName ?? ""}`.trim() || ex.createdBy.email : "System"}
            </p>
            <p className="text-[10px] text-muted-foreground">Added {format(new Date(ex.createdAt), "MMM d, yyyy")}</p>
          </div>
          <StatusBadge status={ex.isActive ? "ACTIVE" : "INACTIVE"} size="sm" className="shrink-0" />
        </div>

        <div className="mt-3 flex gap-1.5">
          <Button asChild variant="outline" size="sm" className="flex-1">
            <Link href={editHref}>
              <Pencil className="h-3 w-3" />
              Edit
            </Link>
          </Button>
          <DeleteExerciseButton exerciseId={ex.id} exerciseName={ex.name} />
        </div>
      </CardContent>
    </Card>
  );
}

interface AdminExercisesGridProps {
  exercises: ExerciseRow[];
  total: number;
  totalPages: number;
  page: number;
  search: string;
  bodyRegions: string[];
  kind?: "training" | "assessment";
}

export function AdminExercisesGrid({ exercises, total, totalPages, page, search, bodyRegions, kind }: AdminExercisesGridProps) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const allOnPageSelected = exercises.length > 0 && exercises.every((ex) => selectedIds.has(ex.id));
  const someOnPageSelected = exercises.some((ex) => selectedIds.has(ex.id)) && !allOnPageSelected;

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllOnPage() {
    setSelectedIds((prev) => {
      if (allOnPageSelected) {
        const next = new Set(prev);
        exercises.forEach((ex) => next.delete(ex.id));
        return next;
      }
      const next = new Set(prev);
      exercises.forEach((ex) => next.add(ex.id));
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function handleBulkDelete() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    setConfirmOpen(false);
    startTransition(async () => {
      const result = await bulkDeleteExercisesAction(ids);
      if (!result.success) {
        toast.error(result.error);
        return;
      }

      const { deletedCount, skipped } = result;
      if (skipped.length === 0) {
        toast.success(`Deleted ${deletedCount} exercise${deletedCount !== 1 ? "s" : ""}`);
      } else if (deletedCount > 0) {
        toast.warning(
          `Deleted ${deletedCount} of ${ids.length} — ${skipped.length} skipped`,
          { description: skipped.slice(0, 5).map((s) => `${s.name}: ${s.reason}`).join("; ") }
        );
      } else {
        toast.error(`Could not delete the selected exercises — ${skipped[0]?.reason ?? "in use"}`);
      }

      clearSelection();
      router.refresh();
    });
  }

  return (
    <>
      <div className="space-y-4">
        {exercises.length > 0 ? (
          <>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Checkbox
                  checked={allOnPageSelected}
                  indeterminate={someOnPageSelected}
                  onCheckedChange={toggleAllOnPage}
                  aria-label="Select all exercises on this page"
                />
                Select all on this page
              </label>
              <span className="text-xs text-muted-foreground">{total.toLocaleString()} exercises</span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {exercises.map((ex) => (
                <AdminExerciseCard
                  key={ex.id}
                  exercise={ex}
                  selected={selectedIds.has(ex.id)}
                  onToggleSelect={() => toggleOne(ex.id)}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="rounded-xl bg-card ring-1 ring-border">
            <EmptyState icon={Dumbbell} title="No exercises found" size="compact" />
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between rounded-xl bg-card px-5 py-3 ring-1 ring-border">
            <p className="text-xs text-muted-foreground">Page {page} of {totalPages} · {total.toLocaleString()} exercises</p>
            <div className="flex gap-2">
              {page > 1 && (
                <Button asChild variant="outline" size="sm">
                  <Link href={`?search=${search}&bodyRegion=${bodyRegions.join(",")}&page=${page - 1}${kind === "assessment" ? "&kind=assessment" : ""}`}>← Prev</Link>
                </Button>
              )}
              {page < totalPages && (
                <Button asChild variant="outline" size="sm">
                  <Link href={`?search=${search}&bodyRegion=${bodyRegions.join(",")}&page=${page + 1}${kind === "assessment" ? "&kind=assessment" : ""}`}>Next →</Link>
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {selectedIds.size > 0 && (
        <div className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
          <div className="flex items-center gap-3 rounded-full border border-border bg-background/95 px-4 py-2 shadow-lg backdrop-blur">
            <span className="text-sm font-medium">{selectedIds.size} selected</span>
            <Button size="sm" variant="destructive" onClick={() => setConfirmOpen(true)} disabled={isPending}>
              {isPending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-1.5 h-4 w-4" />
              )}
              Delete Selected
            </Button>
            <Button size="sm" variant="ghost" onClick={clearSelection} disabled={isPending}>
              <X className="mr-1.5 h-4 w-4" />
              Clear
            </Button>
          </div>
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} exercise{selectedIds.size !== 1 ? "s" : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              This deactivates the selected exercises platform-wide. Any exercise currently used in a trainer&apos;s workout or program will be skipped automatically and left untouched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleBulkDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
