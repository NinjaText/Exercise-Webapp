"use client";

import { useState, useTransition } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import { MoreHorizontal, Archive, RotateCcw, Trash2, Gift, CircleSlash } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  archiveUserAction,
  restoreUserAction,
  deleteUserAction,
  grantFreeAccessAction,
  revokeFreeAccessAction,
} from "@/actions/admin-actions";

interface UserActionsMenuProps {
  userId: string;
  isActive: boolean;
  userName: string;
  /**
   * "granted" = given from this menu (removable here); "env" = set by the
   * BILLING_EXEMPT_EMAILS / SUPER_ADMIN_EMAILS settings (not removable here).
   */
  freeAccess: "none" | "granted" | "env";
}

export function UserActionsMenu({ userId, isActive, userName, freeAccess }: UserActionsMenuProps) {
  const [isPending, startTransition] = useTransition();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [freeAccessDialog, setFreeAccessDialog] = useState<"grant" | "revoke" | null>(null);
  const [note, setNote] = useState("");

  function handleGrantFreeAccess() {
    startTransition(async () => {
      const result = await grantFreeAccessAction(userId, note);
      if (result.success) {
        toast.success(
          result.stoppedSubscriptions > 0
            ? `${userName} now has free access. Their subscription won't renew, so they won't be charged.`
            : `${userName} now has free access.`
        );
        setFreeAccessDialog(null);
        setNote("");
      } else toast.error(result.error);
    });
  }

  function handleRevokeFreeAccess() {
    startTransition(async () => {
      const result = await revokeFreeAccessAction(userId);
      if (result.success) toast.success(`Free access removed for ${userName}.`);
      else toast.error("Failed to remove free access.");
      setFreeAccessDialog(null);
    });
  }

  function handleArchive() {
    startTransition(async () => {
      const result = await archiveUserAction(userId);
      if (result.success) toast.success("User archived.");
      else toast.error("Failed to archive user.");
    });
  }

  function handleRestore() {
    startTransition(async () => {
      const result = await restoreUserAction(userId);
      if (result.success) toast.success("User restored.");
      else toast.error("Failed to restore user.");
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteUserAction(userId);
      if (result.success) toast.success("User permanently deleted.");
      else toast.error((result as { success: false; error: string }).error ?? "Failed to delete user.");
      setShowDeleteDialog(false);
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-sm" aria-label="User actions" />}
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
          {isActive ? (
            <DropdownMenuItem onClick={handleArchive} className="gap-2">
              <Archive className="h-4 w-4" />
              Archive
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={handleRestore} className="gap-2">
              <RotateCcw className="h-4 w-4" />
              Restore
            </DropdownMenuItem>
          )}
          {freeAccess === "none" && (
            <DropdownMenuItem onClick={() => setFreeAccessDialog("grant")} className="gap-2">
              <Gift className="h-4 w-4" />
              Give free access
            </DropdownMenuItem>
          )}
          {freeAccess === "granted" && (
            <DropdownMenuItem onClick={() => setFreeAccessDialog("revoke")} className="gap-2">
              <CircleSlash className="h-4 w-4" />
              Remove free access
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          {/* Delete is offered regardless of active state — deleteUserAction
              still refuses (with a friendly error) when related data exists,
              so there's no need to force an archive step first. */}
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
        open={freeAccessDialog === "grant"}
        onOpenChange={(open) => !open && !isPending && setFreeAccessDialog(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Give {userName} free access?</AlertDialogTitle>
            <AlertDialogDescription>
              They keep full access without paying MIA. If they&apos;re on a free trial or a subscription, it
              won&apos;t renew, so they won&apos;t be charged again. Programs or coaching they bought from a
              coach aren&apos;t affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={`free-access-note-${userId}`}>Note (optional)</Label>
            <Input
              id={`free-access-note-${userId}`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
              placeholder="e.g. Partner clinic, comped for 2027"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleGrantFreeAccess} disabled={isPending}>
              {isPending ? "Saving…" : "Give free access"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={freeAccessDialog === "revoke"}
        onOpenChange={(open) => !open && !isPending && setFreeAccessDialog(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove free access for {userName}?</AlertDialogTitle>
            <AlertDialogDescription>
              They&apos;ll go back to normal billing and be asked to subscribe to keep using MIA. Their free
              trial isn&apos;t repeated.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleRevokeFreeAccess} disabled={isPending}>
              {isPending ? "Removing…" : "Remove free access"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={showDeleteDialog}
        onOpenChange={(open) => !open && setShowDeleteDialog(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {userName}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the user and all their data. This cannot be undone.
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
