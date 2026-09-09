"use client";

import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { FeedbackList } from "@/components/feedback/feedback-list";
import {
  getPendingFeedbackAction,
  type PendingFeedbackItem,
} from "@/actions/feedback-actions";
import { Loader2, TriangleAlert } from "lucide-react";

interface PendingFeedbackSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Server-computed count shown on the hero tile, used for the sheet's subtitle. */
  pendingCount: number;
}

/**
 * Loads and renders the pending-feedback list.
 *
 * Split out so it mounts only while the sheet is open: the fetch then belongs
 * to a plain mount effect with `loading` seeded true, and re-opening the sheet
 * naturally refetches instead of showing a stale list.
 */
function PendingFeedbackPanel() {
  const [items, setItems] = useState<PendingFeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    getPendingFeedbackAction()
      .then((result) => {
        if (!active) return;
        if (result.success) setItems(result.data);
        else setError(result.error ?? "Failed to load pending feedback");
      })
      .catch(() => {
        if (active) setError("Failed to load pending feedback");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading feedback…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
        <TriangleAlert className="h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  return <FeedbackList items={items} isTrainer emptyMessage={"You're all caught up."} />;
}

/**
 * Slide-over listing every unanswered piece of exercise feedback, with the
 * existing respond flow mounted inline.
 *
 * Data is fetched on open rather than during the dashboard's server render:
 * the full feedback bodies are only needed once a trainer actually opens the
 * panel, and the hero tile already has the count it needs.
 */
export function PendingFeedbackSheet({
  open,
  onOpenChange,
  pendingCount,
}: PendingFeedbackSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Pending Feedback</SheetTitle>
          <SheetDescription>
            {pendingCount > 0
              ? `${pendingCount} item${pendingCount === 1 ? "" : "s"} awaiting your response`
              : "Feedback your clients are waiting on"}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          {open && <PendingFeedbackPanel />}
        </div>
      </SheetContent>
    </Sheet>
  );
}
