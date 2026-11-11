"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Copy, Plus, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatCents } from "@/lib/referrals/terms";
import { parseSignedDollarsToCents } from "@/lib/referrals/form";
import {
  addAdjustmentAction,
  deleteContractorAction,
  recordPayoutAction,
  reversePayoutAction,
  voidCommissionAction,
} from "../actions";

// ── Copy ─────────────────────────────────────────────────────────────────

export function CopyField({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="min-w-0 space-y-1">
      <p className="text-caption">{label}</p>
      <div className="flex items-center gap-2">
        <code className={`min-w-0 flex-1 truncate rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-sm text-foreground ${mono ? "font-mono" : ""}`}>
          {value}
        </code>
        <Button
          variant="outline"
          size="icon"
          aria-label={`Copy ${label.toLowerCase()}`}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              toast.error("Couldn't copy — select the text instead.");
            }
          }}
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        </Button>
      </div>
    </div>
  );
}

// ── Payout ───────────────────────────────────────────────────────────────

export interface UnpaidCommission {
  id: string;
  description: string;
  amountCents: number;
  earnedAt: string;
}

const METHODS = ["Bank transfer (ACH)", "PayPal", "Zelle", "Venmo", "Check", "Cash", "Other"];
const METHOD_ITEMS = Object.fromEntries(METHODS.map((m) => [m, m]));

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function RecordPayoutDialog({
  contractorId,
  contractorName,
  unpaid,
}: {
  contractorId: string;
  contractorName: string;
  unpaid: UnpaidCommission[];
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(unpaid.map((c) => c.id)));
  const [method, setMethod] = useState(METHODS[0]);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [paidAt, setPaidAt] = useState(todayISO);
  const [pending, startTransition] = useTransition();

  const total = useMemo(
    () => unpaid.filter((c) => selected.has(c.id)).reduce((sum, c) => sum + c.amountCents, 0),
    [unpaid, selected]
  );
  const allSelected = selected.size === unpaid.length;

  function toggle(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function submit() {
    startTransition(async () => {
      const res = await recordPayoutAction({
        contractorId,
        commissionIds: [...selected],
        method,
        reference: reference || null,
        note: note || null,
        paidAt,
      });
      if (res.ok) {
        toast.success(`Recorded ${formatCents(total)} payout to ${contractorName}`);
        setOpen(false);
      } else toast.error(res.error);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setSelected(new Set(unpaid.map((c) => c.id)));
      }}
    >
      <DialogTrigger render={<Button disabled={unpaid.length === 0} />}>
        <Wallet className="size-4" aria-hidden />
        Record payout
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Record payout — {contractorName}</DialogTitle>
          <DialogDescription>
            Log a payment you made outside MIA. The selected commissions are marked paid and kept in the payout history.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-border">
            <label className="flex items-center gap-3 border-b border-border px-3 py-2 text-caption">
              <Checkbox
                checked={allSelected}
                indeterminate={!allSelected && selected.size > 0}
                onCheckedChange={(v) => setSelected(v ? new Set(unpaid.map((c) => c.id)) : new Set())}
              />
              Select all unpaid ({unpaid.length})
            </label>
            <ul className="max-h-56 divide-y divide-border overflow-y-auto">
              {unpaid.map((c) => (
                <li key={c.id}>
                  <label className="flex items-start gap-3 px-3 py-2">
                    <Checkbox checked={selected.has(c.id)} onCheckedChange={(v) => toggle(c.id, v === true)} className="mt-0.5" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body text-foreground">{c.description}</span>
                      <span className="text-caption">{c.earnedAt}</span>
                    </span>
                    <span className={c.amountCents < 0 ? "tabular-nums text-danger" : "tabular-nums text-foreground"}>
                      {formatCents(c.amountCents)}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between border-t border-border px-3 py-2">
              <span className="text-body font-medium">Payout total</span>
              <span className="text-lg font-semibold tabular-nums">{formatCents(total)}</span>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Paid via</Label>
              <Select items={METHOD_ITEMS} value={method} onValueChange={(v) => setMethod(String(v ?? METHODS[0]))}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="po-date">Payment date</Label>
              <Input id="po-date" type="date" value={paidAt} max={todayISO()} onChange={(e) => setPaidAt(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="po-ref">Reference <span className="text-caption">(optional)</span></Label>
            <Input id="po-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Transaction ID, check number…" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="po-note">Note <span className="text-caption">(optional)</span></Label>
            <Textarea id="po-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={submit} disabled={pending || selected.size === 0 || total <= 0 || !paidAt}>
            {pending ? "Saving…" : `Mark ${formatCents(total)} paid`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ReversePayoutButton({ payoutId, amount }: { payoutId: string; amount: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <Button variant="ghost" size="sm" className="relative z-10" disabled={pending} onClick={() => setOpen(true)}>
        Reverse
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Reverse ${amount} payout?`}
        description="Use this when a payout was recorded by mistake. Its commissions go back to unpaid; the payout stays in the history marked reversed."
        confirmLabel="Reverse payout"
        variant="destructive"
        onConfirm={() =>
          startTransition(async () => {
            const res = await reversePayoutAction(payoutId);
            if (res.ok) toast.success("Payout reversed");
            else toast.error(res.error);
          })
        }
      />
    </>
  );
}

// ── Commissions ──────────────────────────────────────────────────────────

export function VoidCommissionButton({ commissionId, label }: { commissionId: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="sm" className="relative z-10" />}>Void</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Void commission</DialogTitle>
          <DialogDescription>{label}. A voided commission no longer counts toward the balance. This can&apos;t be undone.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="void-reason">Reason</Label>
          <Textarea
            id="void-reason"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Subscriber refunded their first payment"
          />
        </div>
        <DialogFooter>
          <Button
            variant="destructive"
            disabled={pending || reason.trim().length < 3}
            onClick={() =>
              startTransition(async () => {
                const res = await voidCommissionAction({ id: commissionId, reason });
                if (res.ok) {
                  toast.success("Commission voided");
                  setOpen(false);
                } else toast.error(res.error);
              })
            }
          >
            {pending ? "Voiding…" : "Void commission"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AdjustmentDialog({ contractorId }: { contractorId: string }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [pending, startTransition] = useTransition();
  const cents = parseSignedDollarsToCents(amount);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>
        <Plus className="size-4" aria-hidden />
        Adjustment
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add adjustment</DialogTitle>
          <DialogDescription>
            A one-off credit (e.g. a spiff) or, with a minus sign, a clawback. It joins the unpaid balance.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (cents === null) return;
            startTransition(async () => {
              const res = await addAdjustmentAction({ contractorId, amountCents: cents, description });
              if (res.ok) {
                toast.success("Adjustment added");
                setOpen(false);
                setAmount("");
                setDescription("");
              } else toast.error(res.error);
            });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="adj-amount">Amount (USD)</Label>
            <Input
              id="adj-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="100.00 or -50.00"
              aria-invalid={amount !== "" && cents === null}
              className="tabular-nums"
            />
            {cents !== null && (
              <p className="text-caption">{cents < 0 ? `Deducts ${formatCents(-cents)}` : `Credits ${formatCents(cents)}`}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="adj-desc">Description</Label>
            <Input id="adj-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Q4 launch spiff" />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending || cents === null || description.trim().length < 3}>
              {pending ? "Saving…" : "Add adjustment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteContractorButton({ contractorId, name }: { contractorId: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <Button variant="ghost" disabled={pending} onClick={() => setOpen(true)} className="text-danger hover:text-danger">
        Delete
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Delete ${name}?`}
        description="They have no referrals or commissions yet, so nothing else is affected. Their link stops working."
        confirmLabel="Delete contractor"
        variant="destructive"
        onConfirm={() =>
          startTransition(async () => {
            const res = await deleteContractorAction(contractorId);
            if (res.ok) {
              toast.success("Contractor deleted");
              router.push("/admin/referrals");
            } else toast.error(res.error);
          })
        }
      />
    </>
  );
}
