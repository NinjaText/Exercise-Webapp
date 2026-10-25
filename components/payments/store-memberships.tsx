"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import { CalendarSync } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { formatStripeAmount } from "@/lib/utils/money";
import { subscriptionBadge } from "@/lib/payments/status-badges";
import { cancelOfferSubscriptionAction, resumeOfferSubscriptionAction } from "@/actions/store-actions";

export interface MembershipRow {
  id: string;
  offerName: string;
  priceInCents: number;
  currency: string;
  cancellationPolicy: string;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
}

function periodText(m: MembershipRow): string {
  const end = m.currentPeriodEnd ? format(new Date(m.currentPeriodEnd), "MMM d, yyyy") : null;
  if (m.status === "CANCELED") return m.canceledAt ? `Ended ${format(new Date(m.canceledAt), "MMM d, yyyy")}` : "Ended";
  if (m.status === "PAST_DUE") return "Your last payment failed. Update your card from Stripe's email to keep access.";
  if (m.status === "PAUSED") return "Paused: payments stopped, so your coach's program is on hold.";
  if (m.cancelAtPeriodEnd) return end ? `Access until ${end}` : "Ends at the end of this period";
  return end ? `Renews ${end}` : "Active";
}

/** What "Cancel" does for this membership, spelled out before confirming. */
function cancelCopy(m: MembershipRow): string {
  const immediate = m.cancellationPolicy === "IMMEDIATE" || m.status === "PAST_DUE" || m.status === "PAUSED";
  if (immediate) return "Your membership ends now and your coach's program is paused. This can't be undone.";
  const end = m.currentPeriodEnd ? format(new Date(m.currentPeriodEnd), "MMM d, yyyy") : "the end of this billing period";
  return `You won't be charged again. You keep access until ${end}, and you can resume before then.`;
}

export function StoreMemberships({ memberships }: { memberships: MembershipRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<MembershipRow | null>(null);

  async function run(id: string, action: typeof cancelOfferSubscriptionAction, success: string) {
    setBusyId(id);
    const result = await action(id);
    setBusyId(null);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(success);
    router.refresh();
  }

  return (
    <>
      <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-xl bg-card shadow-xs ring-1 ring-border">
        {memberships.map((m) => {
          const badge = subscriptionBadge(m.status, m.cancelAtPeriodEnd);
          const live = m.status === "ACTIVE" || m.status === "PAST_DUE" || m.status === "PAUSED";
          const busy = busyId === m.id;
          return (
            <li key={m.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand-foreground">
                  <CalendarSync className="size-4" aria-hidden />
                </span>
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-label text-foreground">{m.offerName}</p>
                    <StatusBadge status={m.status} label={badge.label} role={badge.role} size="sm" />
                  </div>
                  <p className="text-caption">
                    {formatStripeAmount(m.priceInCents, m.currency)}/month · {periodText(m)}
                  </p>
                </div>
              </div>
              {live && (
                <div className="flex shrink-0 gap-2">
                  {m.cancelAtPeriodEnd && m.status === "ACTIVE" ? (
                    <Button
                      variant="outline"
                      className="h-11 w-full sm:h-9 sm:w-auto"
                      disabled={busy}
                      onClick={() => run(m.id, resumeOfferSubscriptionAction, "Membership resumed")}
                    >
                      {busy ? "Resuming…" : "Resume"}
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      className="h-11 w-full sm:h-9 sm:w-auto"
                      disabled={busy}
                      onClick={() => setConfirming(m)}
                    >
                      {busy ? "Canceling…" : "Cancel membership"}
                    </Button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => !open && setConfirming(null)}
        title="Cancel membership?"
        description={confirming ? cancelCopy(confirming) : ""}
        confirmLabel="Cancel membership"
        cancelLabel="Keep membership"
        variant="destructive"
        onConfirm={() => {
          const m = confirming;
          setConfirming(null);
          if (m) void run(m.id, cancelOfferSubscriptionAction, "Membership canceled");
        }}
      />
    </>
  );
}
