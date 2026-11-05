"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatTokens } from "@/lib/ai/usage/format";
import { grantBonusTokensAction, setUsageOverrideAction } from "./actions";

interface TrainerUsageDialogProps {
  userId: string;
  name: string;
  tierLabel: string;
  tierAllowance: number;
  resetsOn: string;
  bonusTokens: number;
  override: { customMonthlyTokens: number | null; unlimited: boolean; note: string | null } | null;
}

function parseTokens(raw: string): number | null {
  const n = Number(raw.replace(/[,\s_]/g, ""));
  return raw.trim() !== "" && Number.isInteger(n) && n >= 0 ? n : null;
}

/** Per-trainer override: custom monthly limit, unlimited flag, and this-cycle bonus tokens. */
export function TrainerUsageDialog(props: TrainerUsageDialogProps) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(props.override?.customMonthlyTokens?.toString() ?? "");
  const [unlimited, setUnlimited] = useState(props.override?.unlimited ?? false);
  const [note, setNote] = useState(props.override?.note ?? "");
  const [bonus, setBonus] = useState("");
  const [pending, startTransition] = useTransition();

  const customValue = custom.trim() === "" ? null : parseTokens(custom);
  const customInvalid = custom.trim() !== "" && customValue === null;
  const bonusValue = parseTokens(bonus);

  function saveOverride() {
    startTransition(async () => {
      const res = await setUsageOverrideAction({
        userId: props.userId,
        customMonthlyTokens: customValue,
        unlimited,
        note: note.trim() || null,
      });
      if (res.ok) {
        toast.success("Override saved");
        setOpen(false);
      } else toast.error(res.error);
    });
  }

  function grantBonus() {
    if (!bonusValue) return;
    startTransition(async () => {
      const res = await grantBonusTokensAction({ userId: props.userId, tokens: bonusValue });
      if (res.ok) {
        toast.success(`Added ${formatTokens(bonusValue)} bonus tokens`);
        setBonus("");
      } else toast.error(res.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" className="relative z-10" />}>Adjust</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>AI allowance — {props.name}</DialogTitle>
          <DialogDescription>
            {props.tierLabel} plan: {formatTokens(props.tierAllowance)} tokens / cycle. Current cycle resets {props.resetsOn}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="ai-unlimited" className="text-body">Unlimited (still tracked)</Label>
            <Switch id="ai-unlimited" checked={unlimited} onCheckedChange={setUnlimited} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ai-custom">Custom monthly limit (tokens)</Label>
            <Input
              id="ai-custom"
              inputMode="numeric"
              placeholder={`Plan default: ${props.tierAllowance.toLocaleString("en-US")}`}
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              disabled={unlimited}
              aria-invalid={customInvalid}
              className="tabular-nums"
            />
            <p className="text-caption">Leave empty to use the plan allowance.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ai-note">Note</Label>
            <Textarea id="ai-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why this override exists" />
          </div>
          <DialogFooter>
            <Button onClick={saveOverride} disabled={pending || customInvalid}>
              {pending ? "Saving…" : "Save override"}
            </Button>
          </DialogFooter>

          <div className="space-y-1.5 border-t border-border pt-4">
            <Label htmlFor="ai-bonus">Bonus tokens for this cycle</Label>
            <div className="flex gap-2">
              <Input
                id="ai-bonus"
                inputMode="numeric"
                placeholder="e.g. 250000"
                value={bonus}
                onChange={(e) => setBonus(e.target.value)}
                className="tabular-nums"
              />
              <Button variant="outline" onClick={grantBonus} disabled={pending || !bonusValue}>
                Add
              </Button>
            </div>
            <p className="text-caption">
              Already granted this cycle: {formatTokens(props.bonusTokens)}. Bonus expires when the cycle resets.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
