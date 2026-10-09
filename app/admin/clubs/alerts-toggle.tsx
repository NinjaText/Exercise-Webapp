"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { setClubAlertsMutedAction } from "@/actions/admin-club-alert-actions";

export function AlertsToggle({ initialMuted }: { initialMuted: boolean }) {
  const [muted, setMuted] = useState(initialMuted);
  const [pending, startTransition] = useTransition();

  function onChange(checked: boolean) {
    const nextMuted = !checked;
    setMuted(nextMuted);
    startTransition(async () => {
      const res = await setClubAlertsMutedAction(nextMuted);
      if (!res.ok) {
        setMuted(!nextMuted);
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Switch id="club-alerts" checked={!muted} onCheckedChange={onChange} disabled={pending} />
      <Label htmlFor="club-alerts" className="text-body">Email me coaching alerts</Label>
    </div>
  );
}
