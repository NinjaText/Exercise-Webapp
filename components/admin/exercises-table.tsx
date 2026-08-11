"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";
import type { getAllExercises } from "@/lib/services/admin.service";

type ExerciseRow = Awaited<ReturnType<typeof getAllExercises>>["items"][number];

const bodyRegionColors: Record<string, string> = {
  LOWER_BODY:  "border-amber-500/30 bg-amber-500/10 text-amber-700",
  UPPER_BODY:  "border-blue-500/30 bg-blue-500/10 text-blue-700",
  CORE:        "border-violet-500/30 bg-violet-500/10 text-violet-700",
  FULL_BODY:   "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
  BALANCE:     "border-cyan-500/30 bg-cyan-500/10 text-cyan-700",
  FLEXIBILITY: "border-rose-500/30 bg-rose-500/10 text-rose-700",
};

const bodyRegionLabel: Record<string, string> = {
  LOWER_BODY: "Lower Body", UPPER_BODY: "Upper Body", CORE: "Core",
  FULL_BODY: "Full Body",   BALANCE: "Balance",       FLEXIBILITY: "Flexibility",
};

const phaseLabel: Record<string, string> = {
  WARMUP: "Warm-up", ACTIVATION: "Activation", STRENGTHENING: "Strengthening",
  MOBILITY: "Mobility", COOLDOWN: "Cool-down",
};

const diffLabel: Record<string, string> = {
  BEGINNER: "Beginner", INTERMEDIATE: "Intermediate", ADVANCED: "Advanced",
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

  return (
    <>
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="w-10 px-5 py-3">
                  <Checkbox
                    checked={allOnPageSelected}
                    indeterminate={someOnPageSelected}
                    onCheckedChange={toggleAllOnPage}
                    aria-label="Select all exercises on this page"
                  />
                </th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Exercise</th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Body Region</th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hidden md:table-cell">Phase</th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hidden lg:table-cell">Difficulty</th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hidden xl:table-cell">Created By</th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Status</th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hidden lg:table-cell">Added</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {exercises.map((ex) => (
                <tr
                  key={ex.id}
                  className={cn(
                    "hover:bg-muted/40 transition-colors",
                    selectedIds.has(ex.id) && "bg-primary/5"
                  )}
                >
                  <td className="px-5 py-3">
                    <Checkbox
                      checked={selectedIds.has(ex.id)}
                      onCheckedChange={() => toggleOne(ex.id)}
                      aria-label={`Select ${ex.name}`}
                    />
                  </td>
                  <td className="px-5 py-3">
                    <p className="font-medium text-foreground">{ex.name}</p>
                    {ex.description && (
                      <p className="mt-0.5 max-w-xs truncate text-xs text-muted-foreground">{ex.description}</p>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-1">
                      {ex.bodyRegion.map((region: string) => (
                        <Badge key={region} variant="outline" className={`text-[10px] ${bodyRegionColors[region] ?? "border-border text-muted-foreground"}`}>
                          {bodyRegionLabel[region] ?? region}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-5 py-3 hidden md:table-cell">
                    {ex.exercisePhases?.length
                      ? <span className="text-xs text-muted-foreground">
                          {ex.exercisePhases.map((p: string) => phaseLabel[p] ?? p).join(", ")}
                        </span>
                      : <span className="text-xs text-muted-foreground/40">—</span>}
                  </td>
                  <td className="px-5 py-3 hidden lg:table-cell">
                    <span className="text-xs text-muted-foreground">{diffLabel[ex.difficultyLevel] ?? ex.difficultyLevel}</span>
                  </td>
                  <td className="px-5 py-3 hidden xl:table-cell">
                    {ex.createdBy ? (
                      <div>
                        <p className="text-xs font-medium text-foreground">{ex.createdBy.firstName} {ex.createdBy.lastName}</p>
                        <p className="text-[10px] text-muted-foreground">{ex.createdBy.email}</p>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground/60">System</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    {ex.isActive
                      ? <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Active</span>
                      : <span className="inline-flex items-center gap-1 text-xs text-muted-foreground/60"><span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" /> Inactive</span>}
                  </td>
                  <td className="px-5 py-3 hidden lg:table-cell">
                    <span className="text-xs text-muted-foreground">{format(new Date(ex.createdAt), "MMM d, yyyy")}</span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/admin/exercises/${ex.id}/edit`}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/80 transition-colors"
                      >
                        <Pencil className="h-3 w-3" />
                        Edit
                      </Link>
                      <DeleteExerciseButton exerciseId={ex.id} exerciseName={ex.name} />
                    </div>
                  </td>
                </tr>
              ))}
              {exercises.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-5 py-12 text-center">
                    <Dumbbell className="mx-auto h-8 w-8 text-muted-foreground/30 mb-2" />
                    <p className="text-sm text-muted-foreground">No exercises found.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border px-5 py-3">
            <p className="text-xs text-muted-foreground">Page {page} of {totalPages} · {total.toLocaleString()} exercises</p>
            <div className="flex gap-2">
              {page > 1 && (
                <a href={`?search=${search}&bodyRegion=${bodyRegions.join(",")}&page=${page - 1}${kind === "assessment" ? "&kind=assessment" : ""}`} className="rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/80 transition-colors">← Prev</a>
              )}
              {page < totalPages && (
                <a href={`?search=${search}&bodyRegion=${bodyRegions.join(",")}&page=${page + 1}${kind === "assessment" ? "&kind=assessment" : ""}`} className="rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/80 transition-colors">Next →</a>
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
