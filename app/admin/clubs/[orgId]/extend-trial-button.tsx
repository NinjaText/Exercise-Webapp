"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { extendMemberTrialAction } from "@/actions/admin-club-actions";

export function ExtendTrialButton({ userId, disabled }: { userId: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState(7);
  const [pending, startTransition] = useTransition();

  const confirm = () =>
    startTransition(async () => {
      const res = await extendMemberTrialAction(userId, days);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Trial extended by ${days} day${days === 1 ? "" : "s"}`);
      setOpen(false);
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" disabled={disabled} />}>Extend trial</DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Extend trial</DialogTitle>
          <DialogDescription>Adds days to the later of today and the current trial end.</DialogDescription>
        </DialogHeader>
        <Input
          type="number"
          min={1}
          max={90}
          aria-label="Days to extend"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
        />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={pending}>
            {pending ? "Extending…" : "Extend"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
