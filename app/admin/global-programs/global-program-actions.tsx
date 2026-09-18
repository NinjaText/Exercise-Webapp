"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical, Pencil, Send, Trash2, Building2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  pushGlobalProgramUpdateAction,
  deleteGlobalProgramAction,
} from "@/actions/global-program-actions";
import { AssignClinicsDialog } from "./assign-clinics-dialog";

interface Props {
  programId: string;
  programName: string;
  clinics: { id: string; name: string }[];
  currentOrganizationIds: string[];
}

export function GlobalProgramActions({
  programId,
  programName,
  clinics,
  currentOrganizationIds,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);

  async function handlePushUpdate() {
    setLoading(true);
    try {
      const result = await pushGlobalProgramUpdateAction(programId);
      if (result.success) {
        toast.success(`Update pushed for "${programName}"`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Archive "${programName}"? It will no longer appear in the organization library.`)) return;
    setLoading(true);
    try {
      const result = await deleteGlobalProgramAction(programId);
      if (result.success) {
        toast.success("Program archived");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-sm" aria-label="Global program actions" />}
          disabled={loading}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <MoreVertical className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => router.push(`/admin/global-programs/${programId}/edit`)} className="flex items-center gap-2">
            <Pencil className="h-4 w-4" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setAssignOpen(true)} className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Assign to Clinics
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handlePushUpdate} className="flex items-center gap-2">
            <Send className="h-4 w-4" />
            Push Update Notification
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={handleDelete}
            className="flex items-center gap-2 text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
            Archive
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AssignClinicsDialog
        programId={programId}
        clinics={clinics}
        currentOrganizationIds={currentOrganizationIds}
        open={assignOpen}
        onOpenChange={setAssignOpen}
      />
    </>
  );
}
