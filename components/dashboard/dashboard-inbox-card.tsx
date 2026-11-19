"use client";

import Link from "next/link";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Inbox as InboxIcon } from "lucide-react";
import { formatRelativeTime } from "@/lib/utils/formatting";
import { getMessageCategory, type MessageCategory } from "@/lib/utils/message-category";
import { cn } from "@/lib/utils";
import type { getInboxThreads } from "@/lib/services/message.service";

type InboxThread = Awaited<ReturnType<typeof getInboxThreads>>[number];

const CATEGORY_LABEL: Record<MessageCategory, string | null> = {
  message: null,
  workout: "Workout",
  exercise: "Exercise",
  reflection: "Reflection",
  voice_note: "Voice note",
};

/**
 * The latest few conversations, newest first. Filtering lives in the full
 * Inbox ("View all"); a dashboard card only needs to say who's waiting.
 */
export function DashboardInboxCard({
  threads,
  className,
}: {
  threads: InboxThread[];
  className?: string;
}) {
  const unreadCount = threads.reduce((sum, t) => sum + t.unreadCount, 0);
  const latest = threads.slice(0, 4);

  return (
    <SectionCard
      title="Inbox"
      icon={InboxIcon}
      count={unreadCount > 0 ? unreadCount : undefined}
      action={{ label: "View all", href: "/messages" }}
      className={className}
      contentClassName="px-0 pb-2"
    >
      {latest.length === 0 ? (
        <EmptyState size="compact" icon={InboxIcon} title="No messages yet" />
      ) : (
        <ul className="divide-y divide-border">
          {latest.map((thread) => {
            const name = `${thread.otherUser.firstName} ${thread.otherUser.lastName}`.trim();
            const category = CATEGORY_LABEL[getMessageCategory(thread.lastMessage)];
            const unread = thread.unreadCount > 0;
            return (
              <li key={thread.otherUser.id}>
                <Link
                  href={`/messages?thread=${thread.otherUser.id}`}
                  className="flex items-start gap-3 px-5 py-3 transition-colors outline-none hover:bg-surface-muted focus-visible:bg-surface-muted motion-reduce:transition-none"
                >
                  <span
                    aria-hidden
                    className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-caption font-medium text-muted-foreground uppercase"
                  >
                    {(thread.otherUser.firstName?.[0] ?? "") + (thread.otherUser.lastName?.[0] ?? "")}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={cn("truncate text-label", unread ? "text-foreground" : "text-foreground/90")}>
                        {name || "Client"}
                      </span>
                      <span className="shrink-0 text-caption text-muted-foreground tabular-nums">
                        {formatRelativeTime(thread.lastMessage.createdAt)}
                      </span>
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5">
                      {category && (
                        <span className="shrink-0 rounded bg-muted px-1.5 text-caption font-medium text-muted-foreground">
                          {category}
                        </span>
                      )}
                      <span className={cn("truncate text-caption", unread ? "font-medium text-foreground" : "text-muted-foreground")}>
                        {thread.lastMessage.deletedAt ? "Message deleted" : thread.lastMessage.content || "Voice note"}
                      </span>
                      {unread && (
                        <StatusBadge
                          status="unread"
                          role="brand"
                          dot={false}
                          size="sm"
                          label={String(thread.unreadCount)}
                          className="ml-auto shrink-0"
                        />
                      )}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
