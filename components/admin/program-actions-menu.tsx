"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { MoreHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteAdminProgramAction } from "@/actions/admin-program-actions";

interface ProgramActionsMenuProps {
  programId: string;
  programName: string;
  /** Where to send the admin after a successful delete (detail pages only). */
  redirectTo?: string;
}

export function ProgramActionsMenu({
  programId,
  programName,
  redirectTo,
}: ProgramActionsMenuProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteAdminProgramAction(programId);
      if (result.success) {
        toast.success("Program permanently deleted.");
        setShowDeleteDialog(false);
        if (redirectTo) router.push(redirectTo);
        return;
      }
      toast.error(result.error ?? "Failed to delete program.");
      setShowDeleteDialog(false);
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
          disabled={isPending}
          aria-label="Program actions"
        >
          <MoreHorizontal className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="bottom" align="end" className="w-40">
          <DropdownMenuItem
            onClick={() => setShowDeleteDialog(true)}
            variant="destructive"
            className="gap-2"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog
        open={showDeleteDialog}
        onOpenChange={(open) => !open && setShowDeleteDialog(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {programName}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the program along with all of its
              workouts, exercises, and logged sessions. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isPending ? "Deleting…" : "Delete permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
