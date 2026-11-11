"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
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
import { REFERRAL_CODE_RULES, normalizeReferralCode, suggestReferralCode } from "@/lib/referrals/codes";
import { saveContractorAction } from "./actions";

export interface PlanOption {
  id: string;
  name: string;
  summary: string;
  archived: boolean;
}

export interface ContractorFormValues {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  notes: string | null;
  referralCode: string;
  planId: string | null;
  isActive: boolean;
}

const NO_PLAN = "none";

export function ContractorDialog({
  contractor,
  plans,
  trigger,
}: {
  contractor?: ContractorFormValues;
  plans: PlanOption[];
  trigger: React.ReactElement;
}) {
  const router = useRouter();
  const editing = Boolean(contractor);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(contractor?.name ?? "");
  const [email, setEmail] = useState(contractor?.email ?? "");
  const [phone, setPhone] = useState(contractor?.phone ?? "");
  const [notes, setNotes] = useState(contractor?.notes ?? "");
  const [code, setCode] = useState(contractor?.referralCode ?? "");
  const [planId, setPlanId] = useState<string>(contractor?.planId ?? NO_PLAN);
  const [isActive, setIsActive] = useState(contractor?.isActive ?? true);
  const [pending, startTransition] = useTransition();

  // Archived plans are only offered to a contractor who is already on one.
  const choices = plans.filter((p) => !p.archived || p.id === contractor?.planId);
  const items = { [NO_PLAN]: "No plan (track only)", ...Object.fromEntries(choices.map((p) => [p.id, p.name])) };
  const selected = choices.find((p) => p.id === planId);
  const normalized = normalizeReferralCode(code);
  const codeChanged = editing && normalized !== contractor!.referralCode;
  const planChanged = editing && (planId === NO_PLAN ? null : planId) !== contractor!.planId;

  function save() {
    startTransition(async () => {
      const res = await saveContractorAction(contractor?.id ?? null, {
        name,
        email,
        phone: phone || null,
        notes: notes || null,
        referralCode: code,
        planId: planId === NO_PLAN ? null : planId,
        isActive,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(editing ? "Contractor updated" : "Contractor added");
      setOpen(false);
      if (!editing && res.data) router.push(`/admin/referrals/${res.data.id}`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${contractor!.name}` : "Add contractor"}</DialogTitle>
          <DialogDescription>
            Contractors earn commission on the trainers and individuals who sign up with their link or code.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ct-name">Name</Label>
              <Input id="ct-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ct-email">Email</Label>
              <Input id="ct-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ct-phone">Phone <span className="text-caption">(optional)</span></Label>
              <Input id="ct-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ct-code">Referral code</Label>
              <div className="flex gap-2">
                <Input
                  id="ct-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  aria-invalid={code !== "" && !normalized}
                  className="font-mono uppercase"
                  maxLength={24}
                  required
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Suggest a code"
                  title="Suggest a code from the name"
                  onClick={() => setCode(suggestReferralCode(name))}
                >
                  <Sparkles className="size-4" />
                </Button>
              </div>
            </div>
          </div>
          <p className="-mt-2 text-caption">
            {codeChanged ? (
              <span className="text-warning-foreground">Changing the code stops the old link and code from working.</span>
            ) : (
              REFERRAL_CODE_RULES
            )}
          </p>

          <div className="space-y-1.5">
            <Label>Commission plan</Label>
            <Select items={items} value={planId} onValueChange={(v) => setPlanId(String(v ?? NO_PLAN))}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_PLAN}>No plan (track only)</SelectItem>
                {choices.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                    {p.archived ? " (archived)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-caption">
              {selected ? selected.summary : "Referrals are tracked but earn no commission."}
              {planChanged && " The new plan applies to referrals from now on; earned commissions don't change."}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ct-notes">Notes <span className="text-caption">(optional)</span></Label>
            <Textarea
              id="ct-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Payout details, territory, agreement date…"
            />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
            <div>
              <Label htmlFor="ct-active" className="text-body font-medium">Active</Label>
              <p className="text-caption">Inactive contractors keep their history, but their link and code stop attributing.</p>
            </div>
            <Switch id="ct-active" checked={isActive} onCheckedChange={setIsActive} />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending || !name.trim() || !email.trim() || !normalized}>
              {pending ? "Saving…" : editing ? "Save changes" : "Add contractor"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
