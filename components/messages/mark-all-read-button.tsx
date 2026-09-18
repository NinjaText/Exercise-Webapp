"use client";

import { useState, useTransition } from "react";
import { CheckCheck, Loader2 } from "lucide-react";
import { markAllInboxReadAction } from "@/actions/inbox-actions";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function MarkAllReadButton() {
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  function handleClick() {
    startTransition(async () => {
      const result = await markAllInboxReadAction();
      if (result.success) {
        setDone(true);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      onClick={handleClick}
      disabled={isPending || done}
      aria-label="Mark all as read"
      className="gap-1.5 px-2.5 sm:px-3"
    >
      {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
      <span className="hidden sm:inline">Mark all as read</span>
      <span className="sm:hidden">Mark read</span>
    </Button>
  );
}
