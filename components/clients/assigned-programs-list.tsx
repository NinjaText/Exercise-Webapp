"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Library, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { deleteClientProgramAction } from "@/actions/program-actions";
import { SchedulingPill } from "@/components/programs/program-picker";
import { getProgramSchedulingType } from "@/lib/utils/program-scheduling";

interface AssignedProgram {
  id: string;
  name: string;
  status: string;
  /** null on programs written before the field existed — read via getProgramSchedulingType. */
  schedulingType?: string | null;
  _count: { workouts: number };
}

export function AssignedProgramsList({ programs }: { programs: AssignedProgram[] }) {
  const router = useRouter();
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleConfirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const result = await deleteClientProgramAction(pendingDelete.id);
      if (result.success) {
        toast.success("Program deleted");
        setPendingDelete(null);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } finally {
      setDeleting(false);
    }
  }

  if (programs.length === 0) {
    return (
      <EmptyState
        size="compact"
        icon={Library}
        title="No programs assigned yet"
        description="Use Assign program in the page header, or create or generate one from the More actions menu."
      />
    );
  }

  return (
    <>
      <div className="space-y-2">
        {programs.map((prog) => (
          <div
            key={prog.id}
            data-slot="assigned-program-row"
            className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg border border-border p-3 transition-colors hover:bg-surface-muted motion-reduce:transition-none"
          >
            <Link
              href={`/programs/${prog.id}`}
              className="min-w-0 flex-1 basis-48 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <p className="truncate text-label text-foreground">{prog.name}</p>
              <p className="text-caption tabular-nums">
                {prog._count.workouts} workouts
              </p>
            </Link>
            <div data-slot="assigned-program-badges" className="flex shrink-0 items-center gap-2">
              <SchedulingPill kind={getProgramSchedulingType(prog)} />
              <StatusBadge status={prog.status} />
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              className="shrink-0 text-muted-foreground hover:text-destructive"
              aria-label={`Delete ${prog.name}`}
              onClick={() => setPendingDelete({ id: prog.id, name: prog.name })}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <Dialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete &quot;{pendingDelete?.name}&quot;?</DialogTitle>
            <DialogDescription>
              This removes the program from this client and deletes all of its workouts —
              including scheduled and completed sessions — from their calendar. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete Program"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
