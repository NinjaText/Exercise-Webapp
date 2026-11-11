"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { setPlanArchivedAction } from "../actions";

export function ArchivePlanButton({
  planId,
  archived,
  name,
  inUseBy,
}: {
  planId: string;
  archived: boolean;
  name: string;
  inUseBy: number;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const apply = () =>
    startTransition(async () => {
      const res = await setPlanArchivedAction(planId, !archived);
      if (res.ok) toast.success(archived ? "Plan restored" : "Plan archived");
      else toast.error(res.error);
    });

  if (archived) {
    return (
      <Button variant="ghost" size="sm" disabled={pending} onClick={apply}>
        Restore
      </Button>
    );
  }
  return (
    <>
      <Button variant="ghost" size="sm" disabled={pending} onClick={() => setOpen(true)}>
        Archive
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Archive ${name}?`}
        description={
          inUseBy > 0
            ? `It can no longer be assigned to new contractors. The ${inUseBy} contractor${inUseBy === 1 ? "" : "s"} already on it keep earning under these terms until you move them.`
            : "It can no longer be assigned to contractors. You can restore it later."
        }
        confirmLabel="Archive plan"
        onConfirm={apply}
      />
    </>
  );
}
