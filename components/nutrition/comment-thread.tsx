"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Send, MessageCircle } from "lucide-react";
import { createNutritionCommentAction } from "@/actions/nutrition-actions";

interface Comment {
  id: string;
  body: string;
  createdAt: Date | string;
  author: { id: string; firstName: string; lastName: string; role: "TRAINER" | "CLIENT" };
}

interface CommentThreadProps {
  clientId: string;
  date: Date;
  logId?: string;
  comments: Comment[];
  placeholder?: string;
  /** Skip the internal collapsed "Leave feedback" trigger — use when an ancestor already gates visibility (e.g. an expandable table row). */
  forceExpanded?: boolean;
}

export function CommentThread({
  clientId,
  date,
  logId,
  comments,
  placeholder,
  forceExpanded = false,
}: CommentThreadProps) {
  const [isPending, startTransition] = useTransition();
  const [body, setBody] = useState("");
  const [expanded, setExpanded] = useState(forceExpanded || comments.length > 0);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;

    startTransition(async () => {
      const result = await createNutritionCommentAction({
        clientId,
        date,
        logId,
        body: body.trim(),
      });

      if (result.success) {
        setBody("");
      } else {
        toast.error(result.error ?? "Failed to post comment");
      }
    });
  }

  if (!expanded && !forceExpanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <MessageCircle className="h-3.5 w-3.5" />
        {placeholder ?? "Leave feedback"}
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-lg bg-muted/40 p-3">
      {comments.length > 0 && (
        <div className="space-y-2">
          {comments.map((comment) => (
            <div key={comment.id} className="text-sm">
              <span className="font-semibold">
                {comment.author.firstName} {comment.author.lastName}
              </span>
              <span className="ml-1.5 text-xs text-muted-foreground">
                {comment.author.role === "TRAINER" ? "Coach" : "Client"}
              </span>
              <p className="text-foreground/90">{comment.body}</p>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write a comment…"
          disabled={isPending}
          maxLength={2000}
          className="h-8 flex-1 rounded-md border border-input bg-transparent px-2.5 text-xs shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={isPending || !body.trim()}
          aria-label="Post comment"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground disabled:opacity-50"
        >
          {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
        </button>
      </form>
    </div>
  );
}
