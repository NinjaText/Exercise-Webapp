"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { PlanTier } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatTokens } from "@/lib/ai/usage/format";
import { setTierAllowanceAction } from "./actions";

interface TierAllowanceFormProps {
  tier: PlanTier;
  label: string;
  monthlyTokens: number;
  isDefault: boolean;
}

export function TierAllowanceForm({ tier, label, monthlyTokens, isDefault }: TierAllowanceFormProps) {
  const [value, setValue] = useState(String(monthlyTokens));
  const [pending, startTransition] = useTransition();
  const parsed = Number(value.replace(/[,\s_]/g, ""));
  const valid = value.trim() !== "" && Number.isInteger(parsed) && parsed >= 0;
  const dirty = valid && parsed !== monthlyTokens;

  function save() {
    startTransition(async () => {
      const res = await setTierAllowanceAction({ tier, monthlyTokens: parsed });
      if (res.ok) toast.success(`${label} allowance saved`);
      else toast.error(res.error);
    });
  }

  const id = `tier-${tier}`;
  return (
    <form
      className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (dirty) save();
      }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id} className="font-medium text-foreground">{label}</Label>
        <span className="text-caption tabular-nums">
          {valid ? formatTokens(parsed) : "—"} / month{isDefault ? " · placeholder default" : ""}
        </span>
      </div>
      <div className="flex gap-2">
        <Input
          id={id}
          inputMode="numeric"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={!valid}
          className="tabular-nums"
        />
        <Button type="submit" variant="outline" disabled={!dirty || pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
