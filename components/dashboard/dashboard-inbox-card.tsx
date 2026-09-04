"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div className="flex items-center gap-2">
          <InboxIcon className="h-4.5 w-4.5 text-primary" />
          <CardTitle className="text-base font-semibold">Inbox</CardTitle>
          {unreadCount > 0 && (
            <Badge className="h-5 min-w-5 justify-center border-0 bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
              {unreadCount}
            </Badge>
          )}
        </div>
        <Link href="/messages" className="text-xs font-medium text-primary hover:underline">
          View all
        </Link>
      </CardHeader>
      <CardContent>
        <div className="mb-3 flex gap-1">
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
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <InboxIcon className="h-10 w-10 text-muted-foreground/30" />
            <p className="mt-3 text-sm font-medium text-muted-foreground">No messages yet</p>
          </div>
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
                    <Badge className="shrink-0 border-0 bg-primary text-[10px] font-semibold text-primary-foreground">
                      {thread.unreadCount}
                    </Badge>
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
      </CardContent>
    </Card>
  );
}
