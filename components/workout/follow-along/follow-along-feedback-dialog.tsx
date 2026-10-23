"use client";

import { useState } from "react";
import { Annoyed, Frown, Laugh, Loader2, Send, Smile, SmilePlus, Trophy, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  FEELING_OPTIONS,
  FOLLOW_ALONG_COMMENT_MAX_LENGTH,
  type FeelingRating,
} from "@/lib/utils/follow-along";

const FEELING_ICONS: Record<FeelingRating, LucideIcon> = {
  HARD: Frown,
  CHALLENGING: Annoyed,
  JUST_RIGHT: Smile,
  EASY: SmilePlus,
  GREAT: Laugh,
};

interface FollowAlongFeedbackDialogProps {
  open: boolean;
  /** True when the client stopped before the video finished. */
  endedEarly: boolean;
  /** Whether a comment reaches the trainer's inbox (org has messaging); otherwise it's only saved on the session. */
  canMessageTrainer: boolean;
  submitting: boolean;
  onSubmit: (answer: { feelingRating: FeelingRating | null; comment: string }) => void;
  onSkip: () => void;
}

/**
 * "How did it go?" — five faces plus an optional comment. Not dismissable by
 * clicking outside: both buttons complete the session, so closing it any other
 * way would leave the session half-finished.
 */
export function FollowAlongFeedbackDialog({
  open,
  endedEarly,
  canMessageTrainer,
  submitting,
  onSubmit,
  onSkip,
}: FollowAlongFeedbackDialogProps) {
  const [feeling, setFeeling] = useState<FeelingRating | null>(null);
  const [comment, setComment] = useState("");
  const hasComment = comment.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={() => undefined}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader className="pr-0">
          <div className="mx-auto mb-2 flex size-14 items-center justify-center rounded-2xl bg-success-soft text-success-foreground">
            <Trophy className="size-7" aria-hidden />
          </div>
          <DialogTitle className="text-center text-title">
            {endedEarly ? "Session ended" : "Workout complete!"}
          </DialogTitle>
          <DialogDescription className="text-center">How did it go?</DialogDescription>
        </DialogHeader>

        <div role="radiogroup" aria-label="How did it go?" className="grid grid-cols-5 gap-1.5">
          {FEELING_OPTIONS.map(({ value, label }) => {
            const Icon = FEELING_ICONS[value];
            const selected = feeling === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setFeeling(selected ? null : value)}
                className={cn(
                  "flex min-h-11 flex-col items-center gap-1 rounded-xl px-1 py-2 text-caption outline-none ring-1 transition-colors focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
                  selected
                    ? "bg-brand-soft text-brand-foreground ring-brand-border"
                    : "bg-surface text-muted-foreground ring-border hover:bg-surface-muted"
                )}
              >
                <Icon className="size-7" aria-hidden />
                <span className={cn("leading-tight", selected && "font-medium")}>{label}</span>
              </button>
            );
          })}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="follow-along-comment" className="font-semibold">
            {canMessageTrainer ? "Comment for your trainer" : "Notes"}{" "}
            <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Textarea
            id="follow-along-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={FOLLOW_ALONG_COMMENT_MAX_LENGTH}
            rows={3}
            className="resize-none"
            placeholder="Anything to flag? Too fast, felt a twinge, loved it…"
          />
          <p className="text-right text-caption tabular-nums">
            {comment.length}/{FOLLOW_ALONG_COMMENT_MAX_LENGTH}
          </p>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-11" onClick={onSkip} disabled={submitting}>
            Skip
          </Button>
          <Button
            className="h-11 flex-1"
            onClick={() => onSubmit({ feelingRating: feeling, comment })}
            disabled={submitting || (!feeling && !hasComment)}
          >
            {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {canMessageTrainer && hasComment ? "Send to trainer" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
