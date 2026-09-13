"use client";

import { useState, useTransition } from "react";
import { CheckCheck, Loader2 } from "lucide-react";
import { markAllInboxReadAction } from "@/actions/inbox-actions";
import { toast } from "sonner";

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
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending || done}
      aria-label="Mark all as read"
      className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-medium text-primary hover:underline disabled:opacity-50"
    >
      {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
      <span className="hidden sm:inline">Mark all as read</span>
      <span className="sm:hidden">Mark read</span>
    </button>
  );
}
