"use client";

import { useTransition } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Archive, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { archiveClientAction, restoreClientAction } from "@/actions/client-actions";

interface ClientActionsMenuProps {
  clientId: string;
  isActive: boolean;
}

export function ClientActionsMenu({ clientId, isActive }: ClientActionsMenuProps) {
  const [isPending, startTransition] = useTransition();

  function handleArchive() {
    startTransition(async () => {
      const result = await archiveClientAction(clientId);
      if (result.success) toast.success("Client archived.");
      else toast.error(result.error ?? "Failed to archive client.");
    });
  }

  function handleRestore() {
    startTransition(async () => {
      const result = await restoreClientAction(clientId);
      if (result.success) toast.success("Client restored.");
      else toast.error(result.error ?? "Failed to restore client.");
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
        disabled={isPending}
        aria-label="Client actions"
      >
        <MoreHorizontal className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="bottom"
        align="end"
        className="w-44"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {isActive ? (
          <DropdownMenuItem onClick={handleArchive} className="gap-2 text-amber-600">
            <Archive className="h-4 w-4" />
            Mark inactive
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={handleRestore} className="gap-2">
            <RotateCcw className="h-4 w-4" />
            Mark active
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
