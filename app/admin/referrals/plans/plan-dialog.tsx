"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { CommissionType, RetentionScope } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { centsToDollars, parseDollarsToCents } from "@/lib/utils/money";
import { commissionValueInput, parseCommissionValue } from "@/lib/referrals/form";
import { MAX_RETENTION_COUNT, MAX_RETENTION_MONTHS, describeCommission, describeRetention } from "@/lib/referrals/terms";
import { savePlanAction } from "../actions";

export interface PlanValues {
  id: string;
  name: string;
  description: string | null;
  trainerCommissionType: CommissionType;
  trainerCommissionValue: number;
  individualCommissionType: CommissionType;
  individualCommissionValue: number;
  retentionBonusCents: number;
  retentionRequiredCount: number;
  retentionMonths: number;
  retentionScope: RetentionScope;
}

const TYPE_ITEMS: Record<CommissionType, string> = {
  NONE: "No commission",
  FIXED: "Fixed amount ($)",
  PERCENT: "Percent of first payment (%)",
};

const SCOPE_ITEMS: Record<RetentionScope, string> = {
  TRAINERS: "Trainers",
  INDIVIDUALS: "Individuals",
  ALL: "Trainers and individuals",
};

function wholeNumber(input: string, max: number): number | null {
  if (!/^\d{1,4}$/.test(input.trim())) return null;
  const n = Number(input);
  return n >= 1 && n <= max ? n : null;
}

function CommissionField({
  who,
  type,
  value,
  onType,
  onValue,
}: {
  who: string;
  type: CommissionType;
  value: string;
  onType: (t: CommissionType) => void;
  onValue: (v: string) => void;
}) {
  const id = `plan-${who.toLowerCase()}`;
  const invalid = type !== "NONE" && value !== "" && parseCommissionValue(type, value) === null;
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium text-foreground">{who}</legend>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Select items={TYPE_ITEMS} value={type} onValueChange={(v) => onType((v as CommissionType) ?? "NONE")}>
          <SelectTrigger className="w-full" aria-label={`${who} commission type`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(TYPE_ITEMS) as CommissionType[]).map((t) => (
              <SelectItem key={t} value={t}>
                {TYPE_ITEMS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {type !== "NONE" && (
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground" aria-hidden>
              {type === "FIXED" ? "$" : ""}
            </span>
            <Input
              id={id}
              aria-label={`${who} commission ${type === "FIXED" ? "amount" : "percent"}`}
              inputMode="decimal"
              value={value}
              onChange={(e) => onValue(e.target.value)}
              placeholder={type === "FIXED" ? "50.00" : "20"}
              aria-invalid={invalid}
              className={type === "FIXED" ? "pl-7 tabular-nums" : "pr-8 tabular-nums"}
            />
            {type === "PERCENT" && (
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground" aria-hidden>
                %
              </span>
            )}
          </div>
        )}
      </div>
    </fieldset>
  );
}

export function PlanDialog({ plan, trigger, inUseBy = 0 }: { plan?: PlanValues; trigger: React.ReactElement; inUseBy?: number }) {
  const editing = Boolean(plan);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(plan?.name ?? "");
  const [description, setDescription] = useState(plan?.description ?? "");
  const [trainerType, setTrainerType] = useState<CommissionType>(plan?.trainerCommissionType ?? "FIXED");
  const [trainerValue, setTrainerValue] = useState(
    plan ? commissionValueInput(plan.trainerCommissionType, plan.trainerCommissionValue) : ""
  );
  const [indivType, setIndivType] = useState<CommissionType>(plan?.individualCommissionType ?? "FIXED");
  const [indivValue, setIndivValue] = useState(
    plan ? commissionValueInput(plan.individualCommissionType, plan.individualCommissionValue) : ""
  );
  const [retention, setRetention] = useState(plan ? plan.retentionBonusCents > 0 : false);
  const [bonus, setBonus] = useState(plan?.retentionBonusCents ? centsToDollars(plan.retentionBonusCents) : "");
  const [count, setCount] = useState(plan?.retentionRequiredCount ? String(plan.retentionRequiredCount) : "");
  const [months, setMonths] = useState(plan?.retentionMonths ? String(plan.retentionMonths) : "");
  const [scope, setScope] = useState<RetentionScope>(plan?.retentionScope ?? "TRAINERS");
  const [pending, startTransition] = useTransition();

  const trainerCents = parseCommissionValue(trainerType, trainerValue);
  const indivCents = parseCommissionValue(indivType, indivValue);
  const bonusCents = parseDollarsToCents(bonus);
  const countN = wholeNumber(count, MAX_RETENTION_COUNT);
  const monthsN = wholeNumber(months, MAX_RETENTION_MONTHS);
  const retentionValid = !retention || (bonusCents !== null && bonusCents > 0 && countN !== null && monthsN !== null);
  const valid = name.trim() !== "" && trainerCents !== null && indivCents !== null && retentionValid;

  function changeType(set: (t: CommissionType) => void, setValue: (v: string) => void) {
    return (t: CommissionType) => {
      set(t);
      setValue("");
    };
  }

  function save() {
    if (!valid) return;
    startTransition(async () => {
      const res = await savePlanAction(plan?.id ?? null, {
        name,
        description: description || null,
        trainerCommissionType: trainerType,
        trainerCommissionValue: trainerCents!,
        individualCommissionType: indivType,
        individualCommissionValue: indivCents!,
        retentionEnabled: retention,
        retentionBonusCents: retention ? bonusCents! : 0,
        retentionRequiredCount: retention ? countN! : 0,
        retentionMonths: retention ? monthsN! : 0,
        retentionScope: scope,
      });
      if (res.ok) {
        toast.success(editing ? "Plan saved — applies to new referrals" : "Plan created");
        setOpen(false);
      } else toast.error(res.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${plan!.name}` : "New commission plan"}</DialogTitle>
          <DialogDescription>
            {editing && inUseBy > 0
              ? `Used by ${inUseBy} contractor${inUseBy === 1 ? "" : "s"}. `
              : ""}
            Changes apply to referrals made after you save. Referrals already made keep the terms they signed up under, and
            earned commissions never change.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="plan-name">Plan name</Label>
            <Input id="plan-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Standard affiliate" required />
          </div>

          <div className="space-y-3 rounded-lg border border-border p-4">
            <div>
              <p className="font-medium text-foreground">Signup commission</p>
              <p className="text-caption">Earned once, when the referred subscriber&apos;s first payment clears (free trials don&apos;t count).</p>
            </div>
            <CommissionField
              who="Trainers"
              type={trainerType}
              value={trainerValue}
              onType={changeType(setTrainerType, setTrainerValue)}
              onValue={setTrainerValue}
            />
            <CommissionField
              who="Individuals"
              type={indivType}
              value={indivValue}
              onType={changeType(setIndivType, setIndivValue)}
              onValue={setIndivValue}
            />
          </div>

          <div className="space-y-3 rounded-lg border border-border p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Label htmlFor="plan-retention" className="font-medium text-foreground">Retention bonus</Label>
                <p className="text-caption">A bonus for every group of referrals that stay subscribed for a set period.</p>
              </div>
              <Switch id="plan-retention" checked={retention} onCheckedChange={setRetention} />
            </div>
            {retention && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="plan-bonus">Bonus amount</Label>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground" aria-hidden>$</span>
                    <Input
                      id="plan-bonus"
                      inputMode="decimal"
                      value={bonus}
                      onChange={(e) => setBonus(e.target.value)}
                      placeholder="200"
                      className="pl-7 tabular-nums"
                      aria-invalid={bonus !== "" && !(bonusCents && bonusCents > 0)}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Who counts</Label>
                  <Select items={SCOPE_ITEMS} value={scope} onValueChange={(v) => setScope((v as RetentionScope) ?? "TRAINERS")}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(SCOPE_ITEMS) as RetentionScope[]).map((s) => (
                        <SelectItem key={s} value={s}>
                          {SCOPE_ITEMS[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="plan-count">For every</Label>
                  <div className="relative">
                    <Input
                      id="plan-count"
                      inputMode="numeric"
                      value={count}
                      onChange={(e) => setCount(e.target.value)}
                      placeholder="4"
                      className="pr-24 tabular-nums"
                      aria-invalid={count !== "" && countN === null}
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-caption" aria-hidden>
                      subscribers
                    </span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="plan-months">Retained for</Label>
                  <div className="relative">
                    <Input
                      id="plan-months"
                      inputMode="numeric"
                      value={months}
                      onChange={(e) => setMonths(e.target.value)}
                      placeholder="2"
                      className="pr-20 tabular-nums"
                      aria-invalid={months !== "" && monthsN === null}
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-caption" aria-hidden>
                      months
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="plan-desc">Internal note <span className="text-caption">(optional)</span></Label>
            <Textarea id="plan-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="rounded-lg bg-muted/50 p-3 text-body" aria-live="polite">
            <p className="text-caption font-medium tracking-wide uppercase">Summary</p>
            <ul className="mt-1.5 space-y-0.5 text-foreground">
              <li>Trainers: {trainerCents !== null ? describeCommission(trainerType, trainerCents) : "—"}</li>
              <li>Individuals: {indivCents !== null ? describeCommission(indivType, indivCents) : "—"}</li>
              <li>
                {retention
                  ? retentionValid
                    ? describeRetention({
                        retentionBonusCents: bonusCents!,
                        retentionRequiredCount: countN!,
                        retentionMonths: monthsN!,
                        retentionScope: scope,
                      })
                    : "Retention bonus: fill in all three fields"
                  : "No retention bonus"}
              </li>
            </ul>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending || !valid}>
              {pending ? "Saving…" : editing ? "Save plan" : "Create plan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
