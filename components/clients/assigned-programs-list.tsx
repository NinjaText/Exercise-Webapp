"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Trash2 } from "lucide-react";
import { deleteClientProgramAction } from "@/actions/program-actions";

interface AssignedProgram {
  id: string;
  name: string;
  status: string;
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
    return <p className="text-sm text-muted-foreground">No programs assigned yet.</p>;
  }

  return (
    <>
      <div className="space-y-3">
        {programs.map((prog) => (
          <div
            key={prog.id}
            className="flex items-center justify-between gap-2 rounded-lg border border-border p-3 hover:bg-muted/50 transition-colors"
          >
            <Link href={`/programs/${prog.id}`} className="flex-1 min-w-0">
              <p className="font-medium truncate">{prog.name}</p>
              <p className="text-xs text-muted-foreground">
                {prog._count.workouts} workouts
              </p>
            </Link>
            <Badge
              className={
                prog.status === "ACTIVE"
                  ? "border-emerald-200 bg-emerald-100 text-emerald-700"
                  : prog.status === "PAUSED"
                  ? "border-amber-200 bg-amber-100 text-amber-700"
                  : "border-border bg-muted text-muted-foreground"
              }
            >
              {prog.status.charAt(0) + prog.status.slice(1).toLowerCase()}
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
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
