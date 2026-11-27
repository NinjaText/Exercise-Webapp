"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { MoreHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteAdminProgramAction } from "@/actions/admin-program-actions";

interface ProgramActionsMenuProps {
  programId: string;
  programName: string;
  /** Whether the program is a Universal copy (deleting removes it for every trainer). */
  isPublic?: boolean;
  /** Where to send the admin after a successful delete (detail pages only). */
  redirectTo?: string;
}

export function ProgramActionsMenu({
  programId,
  programName,
  isPublic,
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
          render={<Button variant="ghost" size="icon-sm" aria-label="Program actions" />}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          disabled={isPending}
        >
          <MoreHorizontal className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="bottom"
          align="end"
          className="w-48"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
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
              {isPublic
                ? "This removes the program from the Universal library for every trainer and permanently deletes it. Copies trainers already added to their own libraries are not affected. This cannot be undone."
                : "This permanently deletes the program along with all of its workouts, exercises, and logged sessions. This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDelete}
              disabled={isPending}
            >
              {isPending ? "Deleting…" : "Delete permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </>
  );
}
