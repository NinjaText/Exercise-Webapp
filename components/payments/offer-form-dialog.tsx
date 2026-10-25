"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarSync, Dumbbell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { centsToDollars, parseDollarsToCents } from "@/lib/utils/money";
import {
  CANCELLATION_POLICY_LABELS,
  OFFER_MAX_PRICE_CENTS,
  OFFER_MIN_PRICE_CENTS,
  type CancellationPolicy,
  type OfferKind,
} from "@/lib/payments/connect-config";
import { createOfferAction, updateOfferAction } from "@/actions/payment-actions";

export interface OfferFormValues {
  id: string;
  kind: OfferKind;
  name: string;
  description: string | null;
  priceInCents: number;
  programTemplateId: string | null;
  cancellationPolicy: string;
}

export interface TemplateChoice {
  id: string;
  name: string;
}

interface OfferFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: TemplateChoice[];
  /** Present when editing; the kind can't change after creation. */
  offer?: OfferFormValues | null;
}

const NO_PROGRAM = "none";

const KIND_OPTIONS: { kind: OfferKind; title: string; text: string; icon: typeof Dumbbell }[] = [
  { kind: "PROGRAM", title: "Program", text: "One-time purchase that unlocks a program", icon: Dumbbell },
  { kind: "COACHING", title: "Coaching membership", text: "Billed monthly until canceled", icon: CalendarSync },
];

/** Keyed by the parent on open, so each open starts from the offer's current values. */
export function OfferFormDialog({ open, onOpenChange, templates, offer }: OfferFormDialogProps) {
  const router = useRouter();
  const editing = Boolean(offer);
  const [kind, setKind] = useState<OfferKind>(offer?.kind ?? "PROGRAM");
  const [name, setName] = useState(offer?.name ?? "");
  const [description, setDescription] = useState(offer?.description ?? "");
  const [price, setPrice] = useState(offer ? centsToDollars(offer.priceInCents) : "");
  const [programId, setProgramId] = useState(offer?.programTemplateId ?? "");
  const [policy, setPolicy] = useState<CancellationPolicy>(
    (offer?.cancellationPolicy as CancellationPolicy | undefined) ?? "END_OF_PERIOD"
  );
  const [saving, setSaving] = useState(false);

  const priceChanged = editing && offer && parseDollarsToCents(price) !== offer.priceInCents;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const priceInCents = parseDollarsToCents(price);
    if (priceInCents === null || priceInCents < OFFER_MIN_PRICE_CENTS || priceInCents > OFFER_MAX_PRICE_CENTS) {
      toast.error("Enter a price between $1.00 and $10,000.00");
      return;
    }
    if (kind === "PROGRAM" && !programId) {
      toast.error("Choose the program this purchase unlocks");
      return;
    }

    const payload = {
      name,
      description,
      priceInCents,
      programTemplateId: programId || null,
      cancellationPolicy: policy,
    };
    setSaving(true);
    const result = offer
      ? await updateOfferAction({ offerId: offer.id, ...payload })
      : await createOfferAction({ kind, ...payload });
    setSaving(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(offer ? "Offer updated" : "Offer published");
    onOpenChange(false);
    router.refresh();
  }

  const programLabel = (value: string) =>
    value === NO_PROGRAM || !value
      ? kind === "PROGRAM"
        ? "Choose a program"
        : "No program"
      : (templates.find((t) => t.id === value)?.name ?? "Choose a program");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={submit} className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit offer" : "New offer"}</DialogTitle>
            <DialogDescription>
              Clients see this in their Store and pay you directly through Stripe.
            </DialogDescription>
          </DialogHeader>

          {!editing && (
            <fieldset className="grid gap-2 sm:grid-cols-2">
              <legend className="sr-only">Offer type</legend>
              {KIND_OPTIONS.map((option) => {
                const selected = kind === option.kind;
                return (
                  <button
                    key={option.kind}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setKind(option.kind)}
                    className={cn(
                      "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
                      selected ? "border-primary bg-brand-soft" : "border-border bg-surface hover:bg-surface-muted"
                    )}
                  >
                    <option.icon className={cn("mt-0.5 size-4 shrink-0", selected ? "text-primary" : "text-muted-foreground")} aria-hidden />
                    <span className="flex flex-col gap-0.5">
                      <span className="text-label text-foreground">{option.title}</span>
                      <span className="text-caption">{option.text}</span>
                    </span>
                  </button>
                );
              })}
            </fieldset>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="offer-name">Name</Label>
            <Input
              id="offer-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder={kind === "PROGRAM" ? "12-week strength program" : "Monthly 1:1 coaching"}
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="offer-description">Description (optional)</Label>
            <Textarea
              id="offer-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="What's included, who it's for…"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="offer-price">{kind === "COACHING" ? "Price per month (USD)" : "Price (USD)"}</Label>
            <Input
              id="offer-price"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="99.00"
              required
            />
            {priceChanged && kind === "COACHING" && (
              <p className="text-caption">New members pay the new price. Existing members keep their current price.</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label>{kind === "PROGRAM" ? "Program this unlocks" : "Program assigned when membership starts (optional)"}</Label>
            <Select
              value={programId || NO_PROGRAM}
              onValueChange={(v) => setProgramId(!v || v === NO_PROGRAM ? "" : v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={programLabel("")}>{(value: string) => programLabel(value)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {kind === "COACHING" && <SelectItem value={NO_PROGRAM}>No program</SelectItem>}
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {templates.length === 0 && (
              <p className="text-caption">Create a program template first; buyers get their own copy.</p>
            )}
          </div>

          {kind === "COACHING" && (
            <div className="flex flex-col gap-2">
              <Label>When a client cancels</Label>
              <Select value={policy} onValueChange={(v) => v && setPolicy(v as CancellationPolicy)}>
                <SelectTrigger className="w-full">
                  <SelectValue>{(value: string) => CANCELLATION_POLICY_LABELS[value as CancellationPolicy]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(CANCELLATION_POLICY_LABELS) as CancellationPolicy[]).map((p) => (
                    <SelectItem key={p} value={p}>
                      {CANCELLATION_POLICY_LABELS[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" className="h-11 sm:h-9" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" className="h-11 sm:h-9" disabled={saving}>
              {saving ? "Saving…" : editing ? "Save changes" : "Publish offer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
