"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import { HeartHandshake } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  endCoachingAction,
  respondCoachingRequestAction,
  withdrawCoachingOfferAction,
  type CoachingActionResult,
} from "@/actions/coaching-actions";
import { coachingPanelActions } from "@/lib/clubs/coaching-state";
import { COACHING_BADGE } from "@/lib/ui/status";
import type { ClientCoachingPanelData } from "@/lib/clubs/trainer-coaching";

const NOTE_MAX = 1000;

const STATUS_COPY: Record<string, string> = {
  REQUESTED: "This member asked for coaching.",
  ACCEPTED: "You accepted. Waiting for the member to start coaching.",
  ACTIVE: "Coaching is active.",
  PAST_DUE: "Coaching is paused until the member updates their payment.",
};

/** House coach view of one member's coaching state, with the actions legal for it. */
export function ClientCoachingPanel({ coaching }: { coaching: ClientCoachingPanelData }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [declineOpen, setDeclineOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [note, setNote] = useState("");
  const { memberId, status, cancelAtPeriodEnd, periodEnd } = coaching;
  const actions = coachingPanelActions(status, cancelAtPeriodEnd);
  const badge = status ? COACHING_BADGE[status] : undefined;
  // The request note only matters while the request/offer is open.
  const showNote = Boolean(coaching.note) && (status === "REQUESTED" || status === "ACCEPTED");

  function run(fn: () => Promise<CoachingActionResult>, success: string) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(success);
      setDeclineOpen(false);
      setEndOpen(false);
      setNote("");
      router.refresh();
    });
  }

  return (
    <SectionCard
      title="Coaching"
      icon={HeartHandshake}
      action={badge ? <StatusBadge status={status!} label={badge.label} role={badge.role} /> : undefined}
    >
      <div className="flex flex-col items-start gap-3">
        <p className="text-body text-muted-foreground">
          {status && STATUS_COPY[status] ? STATUS_COPY[status] : "No active coaching request."}
          {cancelAtPeriodEnd && periodEnd ? ` Coaching ends ${format(periodEnd, "MMM d, yyyy")}.` : ""}
        </p>
        {showNote && (
          <p className="whitespace-pre-wrap break-words rounded-lg bg-surface-muted p-3 text-body">{coaching.note}</p>
        )}
        {actions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {actions.includes("accept") && (
              <Button onClick={() => run(() => respondCoachingRequestAction(memberId, true), "Request accepted.")} disabled={pending}>
                Accept
              </Button>
            )}
            {actions.includes("decline") && (
              <Button variant="outline" onClick={() => setDeclineOpen(true)} disabled={pending}>
                Decline
              </Button>
            )}
            {actions.includes("withdraw") && (
              <Button
                variant="outline"
                onClick={() => run(() => withdrawCoachingOfferAction(memberId), "Offer withdrawn.")}
                disabled={pending}
              >
                Withdraw offer
              </Button>
            )}
            {actions.includes("end") && (
              <Button variant="outline" onClick={() => setEndOpen(true)} disabled={pending}>
                End coaching
              </Button>
            )}
          </div>
        )}
      </div>

      <Dialog open={declineOpen} onOpenChange={setDeclineOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Decline request</DialogTitle>
            <DialogDescription>Optionally tell the member why.</DialogDescription>
          </DialogHeader>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={NOTE_MAX}
            rows={4}
            placeholder="Optional note"
            aria-label="Note to the member"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeclineOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => run(() => respondCoachingRequestAction(memberId, false, note), "Request declined.")}
              disabled={pending}
            >
              {pending ? "Declining…" : "Decline request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={endOpen}
        onOpenChange={setEndOpen}
        title="End coaching?"
        description={
          periodEnd
            ? `Coaching stays active until ${format(periodEnd, "MMM d, yyyy")}, then the member's coaching subscription ends.`
            : "The member's coaching subscription will end."
        }
        confirmLabel="End coaching"
        variant="destructive"
        onConfirm={() => run(() => endCoachingAction(memberId), "Coaching will end at the end of the billing period.")}
      />
    </SectionCard>
  );
}
