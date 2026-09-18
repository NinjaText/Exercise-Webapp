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

export function DashboardInboxCard({ threads }: { threads: InboxThread[] }) {
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
    >
      <div className="mb-3 flex flex-wrap gap-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
              tab === t.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState size="compact" icon={InboxIcon} title="No messages yet" />
      ) : (
        <div className="space-y-3">
          {filtered.map((thread) => (
            <Link
              key={thread.otherUser.id}
              href={`/messages?thread=${thread.otherUser.id}`}
              className="block rounded-xl border border-border/60 p-3 transition-colors hover:bg-muted/30"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="truncate text-sm font-medium">
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
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground/80">
                {thread.lastMessage.deletedAt ? "Message deleted" : thread.lastMessage.content}
              </p>
              <p className="mt-1.5 text-[10px] text-muted-foreground/50">
                {formatRelativeTime(thread.lastMessage.createdAt)}
              </p>
            </Link>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
