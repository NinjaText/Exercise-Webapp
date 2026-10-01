"use client";

import { useState } from "react";
import { bulkInviteAction, type InviteEmailResult } from "@/actions/bulk-invite-action";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { BulkInviteTab } from "@/components/shared/bulk-invite-tab";
import { toast } from "sonner";
import { Upload } from "lucide-react";

interface Props {
  clerkOrgId: string;
  trainerName: string;
}

export function AdminBulkInviteDialog({ clerkOrgId, trainerName }: Props) {
  const [open, setOpen] = useState(false);

  async function handleBulkInvite(emails: string[]): Promise<InviteEmailResult[]> {
    const result = await bulkInviteAction(emails, clerkOrgId);
    if (!result.success) {
      toast.error(result.error ?? "Bulk invite failed");
      return emails.map((e) => ({ email: e, success: false, error: result.error }));
    }
    return result.results;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="sm" className="gap-1.5" />}>
        <Upload className="h-3.5 w-3.5" />
        Bulk Invite
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Bulk Invite Clients</DialogTitle>
          <DialogDescription>
            Upload a CSV of emails to invite clients into {trainerName}&apos;s
            organization.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-2">
          <BulkInviteTab
            onInvite={handleBulkInvite}
            onDone={() => setOpen(false)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
