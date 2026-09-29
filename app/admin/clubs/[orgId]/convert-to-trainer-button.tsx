"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { setOrgTypeAction } from "@/actions/admin-club-actions";

export function ConvertToTrainerButton({ clerkOrgId, hasMembers }: { clerkOrgId: string; hasMembers: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const convert = () =>
    startTransition(async () => {
      const res = await setOrgTypeAction(clerkOrgId, "TRAINER");
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Converted to a trainer org");
      router.push("/admin/clubs");
    });

  const button = (
    <Button variant="outline" size="sm" disabled={hasMembers || pending} onClick={() => setOpen(true)}>
      Convert to trainer org
    </Button>
  );

  return (
    <>
      {hasMembers ? (
        <Tooltip>
          <TooltipTrigger render={<span tabIndex={0} />}>{button}</TooltipTrigger>
          <TooltipContent>Has members</TooltipContent>
        </Tooltip>
      ) : (
        button
      )}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Convert to trainer org?"
        description="The club will stop being member-paid and its join link will stop working."
        confirmLabel="Convert"
        variant="destructive"
        onConfirm={convert}
      />
    </>
  );
}
