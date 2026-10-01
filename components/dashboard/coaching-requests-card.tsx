"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
import { respondCoachingRequestAction } from "@/actions/coaching-actions";
import type { CoachingRequestItem } from "@/lib/clubs/trainer-coaching";

const NOTE_MAX = 1000;

/** Club trainer dashboard: pending coaching requests with Accept / Decline. */
export function CoachingRequestsCard({ requests }: { requests: CoachingRequestItem[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [declining, setDeclining] = useState<CoachingRequestItem | null>(null);
  const [note, setNote] = useState("");

  function respond(memberId: string, accept: boolean, replyNote?: string) {
    startTransition(async () => {
      const res = await respondCoachingRequestAction(memberId, accept, replyNote);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(accept ? "Request accepted." : "Request declined.");
      setDeclining(null);
      setNote("");
      router.refresh();
    });
  }

  return (
    <SectionCard title="Coaching requests" icon={HeartHandshake} count={requests.length}>
      {requests.length === 0 ? (
        <p className="text-sm text-muted-foreground">No coaching requests</p>
      ) : (
        <ul className="divide-y divide-border">
          {requests.map((r) => (
            <li key={r.memberId} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{r.name}</p>
                {r.note && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">{r.note}</p>}
              </div>
              <div className="flex shrink-0 gap-2">
                <Button size="sm" onClick={() => respond(r.memberId, true)} disabled={pending}>
                  Accept
                </Button>
                <Button size="sm" variant="outline" onClick={() => setDeclining(r)} disabled={pending}>
                  Decline
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={declining !== null} onOpenChange={(open) => !open && setDeclining(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Decline request</DialogTitle>
            <DialogDescription>
              Optionally tell {declining?.name ?? "the member"} why. They can send a new request later.
            </DialogDescription>
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
            <Button variant="outline" onClick={() => setDeclining(null)} disabled={pending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => declining && respond(declining.memberId, false, note)}
              disabled={pending}
            >
              {pending ? "Declining…" : "Decline request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}
