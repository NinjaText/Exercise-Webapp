"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { replaceClubTrainerAction, resendClubTrainerInviteAction } from "@/actions/admin-club-actions";

type Props = {
  clerkOrgId: string;
  hasTrainer: boolean;
  invitePending: boolean;
};

export function ClubTrainerControls({ clerkOrgId, hasTrainer, invitePending }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [pending, startTransition] = useTransition();

  const resend = () =>
    startTransition(async () => {
      const res = await resendClubTrainerInviteAction(clerkOrgId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Invitation resent");
      router.refresh();
    });

  const replace = () =>
    startTransition(async () => {
      const res = await replaceClubTrainerAction(clerkOrgId, email);
      if (!res.ok) {
        toast.error(res.error);
        router.refresh();
        return;
      }
      toast.success("Invitation sent");
      setOpen(false);
      setEmail("");
      router.refresh();
    });

  return (
    <div className="flex flex-wrap gap-2">
      {invitePending && !hasTrainer && (
        <Button variant="outline" size="sm" onClick={resend} disabled={pending}>
          Resend invite
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger render={<Button variant="outline" size="sm" />}>
          {hasTrainer ? "Replace trainer" : "Invite trainer"}
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{hasTrainer ? "Replace club trainer" : "Invite club trainer"}</DialogTitle>
            <DialogDescription>
              {hasTrainer
                ? "The current trainer is removed from the club and their account is deactivated; their programs transfer to the new trainer when they accept. The new trainer needs a dedicated email that isn't already in use."
                : "The new trainer needs a dedicated email that isn't already in use."}
            </DialogDescription>
          </DialogHeader>
          <Input
            type="email"
            aria-label="New club trainer email"
            placeholder="trainer@club.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={replace} disabled={pending || email.trim() === ""} variant={hasTrainer ? "destructive" : "default"}>
              {pending ? "Sending…" : hasTrainer ? "Replace and invite" : "Send invite"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
