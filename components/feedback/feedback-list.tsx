"use client";

import { useState } from "react";
import { toast } from "sonner";
import { respondToFeedbackAction as respondToFeedback } from "@/actions/feedback-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatFeedbackRating } from "@/lib/utils/formatting";
import { formatRelative } from "@/lib/utils/dates";
import { Loader2, MessageSquare } from "lucide-react";

interface FeedbackItem {
  id: string;
  rating: string;
  comment: string | null;
  trainerResponse: string | null;
  createdAt: Date;
  exerciseName: string;
  clientName?: string;
}

interface FeedbackListProps {
  items: FeedbackItem[];
  isTrainer: boolean;
  /** Overrides the empty-state copy — the default reads oddly in a "pending only" context. */
  emptyMessage?: string;
}

const ratingColors: Record<string, string> = {
  FELT_GOOD: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  MILD_DISCOMFORT: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  PAINFUL: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  UNSURE_HOW_TO_PERFORM: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
};

export function FeedbackList({
  items,
  isTrainer,
  emptyMessage = "No feedback submitted yet",
}: FeedbackListProps) {
  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  const [responseText, setResponseText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleRespond = async (feedbackId: string) => {
    if (!responseText.trim()) return;
    setIsSubmitting(true);

    const result = await respondToFeedback({
      feedbackId,
      trainerResponse: responseText,
    });

    if (result.success) {
      toast.success("Response sent");
      setRespondingTo(null);
      setResponseText("");
    } else {
      toast.error(result.error ?? "Failed to send response");
    }
    setIsSubmitting(false);
  };

  if (items.length === 0) {
    return (
      <p className="text-muted-foreground text-sm text-center py-8">{emptyMessage}</p>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.id} className="p-4 rounded-md border space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-medium text-sm">{item.exerciseName}</p>
              {item.clientName && (
                <p className="text-muted-foreground text-xs">{item.clientName}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Badge className={`text-xs ${ratingColors[item.rating] ?? ""}`}>
                {formatFeedbackRating(item.rating)}
              </Badge>
              <span className="text-muted-foreground text-xs">
                {formatRelative(item.createdAt)}
              </span>
            </div>
          </div>

          {item.comment && (
            <p className="text-sm text-muted-foreground">{item.comment}</p>
          )}

          {item.trainerResponse && (
            <div className="bg-muted rounded p-2 text-sm">
              <p className="text-xs font-medium mb-1">Trainer Response:</p>
              <p>{item.trainerResponse}</p>
            </div>
          )}

          {isTrainer && !item.trainerResponse && (
            <div>
              {respondingTo === item.id ? (
                <div className="space-y-2">
                  <Textarea
                    placeholder="Write your response..."
                    rows={2}
                    value={responseText}
                    onChange={(e) => setResponseText(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleRespond(item.id)}
                      disabled={isSubmitting}
                    >
                      {isSubmitting && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                      Send
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setRespondingTo(null);
                        setResponseText("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setRespondingTo(item.id)}
                >
                  <MessageSquare className="mr-1 h-3 w-3" />
                  Respond
                </Button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
