"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { requestCoachingAction } from "@/actions/coaching-actions";

const NOTE_MAX = 1000;

export function RequestCoachingDialog({
  triggerLabel = "Request coaching",
}: {
  triggerLabel?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const trimmed = note.trim();

  function submit() {
    startTransition(async () => {
      const res = await requestCoachingAction(note);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Request sent to your coach.");
      setOpen(false);
      setNote("");
      router.refresh();
    });
  }

  return (
    <>
      <Button className="h-11 sm:h-9" onClick={() => setOpen(true)}>{triggerLabel}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request coaching</DialogTitle>
            <DialogDescription>
              Tell your coach what you want to work on. They&apos;ll review your
              request before anything is billed.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={NOTE_MAX}
            rows={5}
            placeholder="Goals, injuries, schedule…"
            aria-label="Note to your coach"
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button onClick={submit} disabled={pending || trimmed.length === 0}>
              {pending ? "Sending…" : "Send request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
