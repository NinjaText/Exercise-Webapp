"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { InvitationsTable } from "@/components/shared/invitations-table";
import { getInvitationsAction } from "@/actions/invitation-actions";
import type { OrgInvitation } from "@/lib/services/invitation.service";
import { Loader2, Mail } from "lucide-react";

interface Props {
  clerkOrgId: string;
  trainerName: string;
}

export function AdminInvitationsDialog({ clerkOrgId, trainerName }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [invitations, setInvitations] = useState<OrgInvitation[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await getInvitationsAction(clerkOrgId);
    if (result.success) {
      setInvitations(result.data);
    } else {
      toast.error(result.error ?? "Failed to load invitations");
    }
    setLoading(false);
  }, [clerkOrgId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-open is the intended sync with the dialog's open state
    if (open) void load();
  }, [open, load]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="sm" className="gap-1.5 text-xs h-7 px-2" />}>
        <Mail className="h-3.5 w-3.5" />
        Invitations
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Invitations — {trainerName}</DialogTitle>
          <DialogDescription>
            Status of every invitation sent into {trainerName}&apos;s organization.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-2">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <InvitationsTable
              invitations={invitations}
              clerkOrgId={clerkOrgId}
              onChanged={load}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
