"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { ChevronRight, MessageSquare } from "lucide-react";

export interface TrainerMessagePreview {
  /** The trainer's user id — doubles as the client thread route segment (/messages/{trainerId}). */
  trainerId: string;
  trainerName: string;
  /** Empty for a voice-only or deleted message; the banner substitutes its own copy. */
  preview: string;
  sentAt: Date;
  unreadCount: number;
}

/**
 * Nudge at the very top of the client dashboard when their trainer has said
 * something they haven't read. Renders nothing at all when there's no unread
 * thread — an empty "no new messages" card would just be noise on a dashboard
 * that's meant to fit in one viewport.
 */
export function TrainerMessageBanner({ message }: { message: TrainerMessagePreview | null }) {
  if (!message) return null;

  const previewText = message.preview.trim() || "Sent you a voice message";

  return (
    <Link
      href={`/messages/${message.trainerId}`}
      className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3.5 transition-colors hover:bg-primary/10"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
        <MessageSquare className="h-4.5 w-4.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-sm font-semibold">New message from your trainer</span>
          {message.unreadCount > 1 && (
            <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
              {message.unreadCount}
            </span>
          )}
        </span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
          {message.trainerName} · {previewText}
        </span>
      </span>
      <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
        {formatDistanceToNow(new Date(message.sentAt), { addSuffix: true })}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
