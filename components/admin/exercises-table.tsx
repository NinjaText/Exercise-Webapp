"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { DataList, type Column } from "@/components/shared/data-list";
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
import { Dumbbell, Pencil, Trash2, Loader2, X } from "lucide-react";
import { DeleteExerciseButton } from "@/components/admin/delete-exercise-button";
import { bulkDeleteExercisesAction } from "@/actions/exercise-actions";
import { formatBodyRegion, formatDifficulty } from "@/lib/utils/formatting";
import type { getAllExercises } from "@/lib/services/admin.service";

type ExerciseRow = Awaited<ReturnType<typeof getAllExercises>>["items"][number];

const phaseLabel: Record<string, string> = {
  WARMUP: "Warm-up", ACTIVATION: "Activation", STRENGTHENING: "Strengthening",
  MOBILITY: "Mobility", COOLDOWN: "Cool-down",
};

interface AdminExercisesTableProps {
  exercises: ExerciseRow[];
  total: number;
  totalPages: number;
  page: number;
  search: string;
  bodyRegions: string[];
  kind?: "training" | "assessment";
}

export function AdminExercisesTable({ exercises, total, totalPages, page, search, bodyRegions, kind }: AdminExercisesTableProps) {
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

  const columns: Column<ExerciseRow>[] = [
    {
      key: "select",
      header: "",
      className: "w-10",
      render: (ex) => (
        <Checkbox
          checked={selectedIds.has(ex.id)}
          onCheckedChange={() => toggleOne(ex.id)}
          aria-label={`Select ${ex.name}`}
        />
      ),
    },
    {
      key: "exercise",
      header: "Exercise",
      render: (ex) => (
        <div>
          <p className="font-medium text-foreground">{ex.name}</p>
          {ex.description && (
            <p className="mt-0.5 max-w-xs truncate text-xs text-muted-foreground">{ex.description}</p>
          )}
        </div>
      ),
    },
    {
      key: "bodyRegion",
      header: "Body Region",
      render: (ex) => (
        <div className="flex flex-wrap gap-1">
          {ex.bodyRegion.map((region: string) => (
            <Badge key={region} variant="outline" className="text-[10px]">
              {formatBodyRegion(region)}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      key: "phase",
      header: "Phase",
      className: "hidden md:table-cell",
      render: (ex) =>
        ex.exercisePhases?.length
          ? <span className="text-xs text-muted-foreground">
              {ex.exercisePhases.map((p: string) => phaseLabel[p] ?? p).join(", ")}
            </span>
          : <span className="text-xs text-muted-foreground/40">—</span>,
    },
    {
      key: "difficulty",
      header: "Difficulty",
      className: "hidden lg:table-cell",
      render: (ex) =>
        ex.difficultyLevel ? (
          <StatusBadge
            status={ex.difficultyLevel}
            label={formatDifficulty(ex.difficultyLevel)}
            role={DIFFICULTY_ROLE[ex.difficultyLevel] ?? "neutral"}
            size="sm"
            dot={false}
          />
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      key: "createdBy",
      header: "Created By",
      className: "hidden xl:table-cell",
      render: (ex) =>
        ex.createdBy ? (
          <div>
            <p className="text-xs font-medium text-foreground">{ex.createdBy.firstName} {ex.createdBy.lastName}</p>
            <p className="text-[10px] text-muted-foreground">{ex.createdBy.email}</p>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground/60">System</span>
        ),
    },
    {
      key: "status",
      header: "Status",
      render: (ex) => <StatusBadge status={ex.isActive ? "ACTIVE" : "INACTIVE"} size="sm" />,
    },
    {
      key: "added",
      header: "Added",
      className: "hidden lg:table-cell",
      render: (ex) => <span className="text-xs text-muted-foreground">{format(new Date(ex.createdAt), "MMM d, yyyy")}</span>,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (ex) => (
        <div className="flex items-center justify-end gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/admin/exercises/${ex.id}/edit`}>
              <Pencil className="h-3 w-3" />
              Edit
            </Link>
          </Button>
          <DeleteExerciseButton exerciseId={ex.id} exerciseName={ex.name} />
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="rounded-xl ring-1 ring-border bg-card overflow-hidden">
        {exercises.length > 0 && (
          <div className="flex items-center justify-between border-b border-border px-5 py-2">
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
        )}

        <DataList
          columns={columns}
          data={exercises}
          keyExtractor={(ex) => ex.id}
          density="compact"
          className="rounded-none ring-0"
          emptyState={<EmptyState icon={Dumbbell} title="No exercises found" size="compact" />}
        />

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border px-5 py-3">
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
