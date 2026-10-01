"use client";

import { useMemo, useState } from "react";
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

const TABS: { key: "all" | MessageCategory; label: string }[] = [
  { key: "all", label: "All" },
  { key: "message", label: "Messages" },
  { key: "workout", label: "Workout" },
  { key: "exercise", label: "Exercise" },
];

export function DashboardInboxCard({
  threads,
  className,
}: {
  threads: InboxThread[];
  className?: string;
}) {
  const [tab, setTab] = useState<"all" | MessageCategory>("all");
  const unreadCount = threads.reduce((sum, t) => sum + t.unreadCount, 0);

  const filtered = useMemo(
    () => (tab === "all" ? threads : threads.filter((t) => getMessageCategory(t.lastMessage) === tab)).slice(0, 3),
    [threads, tab]
  );

  return (
    <SectionCard
      title="Inbox"
      icon={InboxIcon}
      count={unreadCount > 0 ? unreadCount : undefined}
      action={{ label: "View all", href: "/messages" }}
      className={className}
    >
      <div className="mb-4 flex flex-wrap gap-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            aria-pressed={tab === t.key}
            className={cn(
              "h-8 rounded-full px-3 text-caption font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
              tab === t.key
                ? "bg-primary text-primary-foreground"
                : "bg-surface-muted text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState size="compact" icon={InboxIcon} title="No messages yet" />
      ) : (
        <div className="space-y-2">
          {filtered.map((thread) => (
            <Link
              key={thread.otherUser.id}
              href={`/messages?thread=${thread.otherUser.id}`}
              className="block rounded-lg border border-border p-3 transition-colors outline-none hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="truncate text-label text-foreground">
                  {thread.otherUser.firstName} {thread.otherUser.lastName}
                </p>
                {thread.unreadCount > 0 && (
                  <StatusBadge
                    status="unread"
                    role="brand"
                    dot={false}
                    size="sm"
                    label={String(thread.unreadCount)}
                  />
                )}
              </div>
              <p className="mt-1 line-clamp-2 text-caption">
                {thread.lastMessage.deletedAt ? "Message deleted" : thread.lastMessage.content}
              </p>
              <p className="mt-1.5 text-caption tabular-nums">
                {formatRelativeTime(thread.lastMessage.createdAt)}
              </p>
            </Link>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
