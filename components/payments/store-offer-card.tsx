"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CalendarSync, Check, Dumbbell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatStripeAmount } from "@/lib/utils/money";
import { CANCELLATION_POLICY_LABELS, type CancellationPolicy, type OfferKind } from "@/lib/payments/connect-config";
import { startOfferCheckoutAction } from "@/actions/store-actions";

export interface StoreOfferCardData {
  id: string;
  kind: OfferKind;
  name: string;
  description: string | null;
  priceInCents: number;
  currency: string;
  cancellationPolicy: string;
  trainerName: string;
  programName: string | null;
  /** Already owned (program) or a live membership (coaching): no buy button. */
  owned: boolean;
}

export function StoreOfferCard({ offer, showTrainer }: { offer: StoreOfferCardData; showTrainer: boolean }) {
  const [redirecting, setRedirecting] = useState(false);
  const coaching = offer.kind === "COACHING";
  const Icon = coaching ? CalendarSync : Dumbbell;

  async function buy() {
    if (redirecting) return;
    setRedirecting(true);
    const result = await startOfferCheckoutAction(offer.id);
    if (!result.success) {
      toast.error(result.error);
      setRedirecting(false);
      return;
    }
    // Stays disabled: the page is navigating to Stripe Checkout.
    window.location.href = result.data.url;
  }

  return (
    <Card className="h-full">
      <CardContent className="flex h-full flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-foreground">
            <Icon className="size-5" aria-hidden />
          </span>
          {offer.owned && (
            <StatusBadge status="ACTIVE" label={coaching ? "Subscribed" : "Owned"} role="success" size="sm" />
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-heading text-foreground">{offer.name}</p>
          {showTrainer && <p className="text-caption">with {offer.trainerName}</p>}
          {offer.description && <p className="text-body text-muted-foreground">{offer.description}</p>}
        </div>

        <ul className="flex flex-col gap-1.5 text-caption">
          {offer.programName && (
            <li className="flex items-start gap-2">
              <Check className="mt-0.5 size-3.5 shrink-0 text-success-foreground" aria-hidden />
              <span>{coaching ? `Includes ${offer.programName}` : `Unlocks ${offer.programName}`}</span>
            </li>
          )}
          <li className="flex items-start gap-2">
            <Check className="mt-0.5 size-3.5 shrink-0 text-success-foreground" aria-hidden />
            <span>{coaching ? "Billed monthly, cancel anytime" : "One-time payment, yours to keep"}</span>
          </li>
          {coaching && (
            <li className="flex items-start gap-2">
              <Check className="mt-0.5 size-3.5 shrink-0 text-success-foreground" aria-hidden />
              <span>
                {CANCELLATION_POLICY_LABELS[offer.cancellationPolicy as CancellationPolicy] ?? "Cancel anytime"} if you cancel
              </span>
            </li>
          )}
        </ul>

        <div className="mt-auto flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-title text-foreground tabular-nums">
            {formatStripeAmount(offer.priceInCents, offer.currency)}
            {coaching && <span className="text-body text-muted-foreground"> / month</span>}
          </p>
          {!offer.owned && (
            <Button className="h-11 sm:h-9" onClick={buy} disabled={redirecting}>
              {redirecting ? "Opening checkout…" : coaching ? "Subscribe" : "Buy now"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
