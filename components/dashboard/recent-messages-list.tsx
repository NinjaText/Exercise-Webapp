import Link from "next/link";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { MessageSquare } from "lucide-react";
import { formatRelativeTime } from "@/lib/utils/formatting";
import { getInboxThreads } from "@/lib/services/message.service";

type InboxThread = Awaited<ReturnType<typeof getInboxThreads>>[number];

interface RecentMessagesListProps {
  messages: InboxThread[];
}

export function RecentMessagesList({ messages }: RecentMessagesListProps) {
  if (messages.length === 0) {
    return (
      <EmptyState size="compact" icon={MessageSquare} title="No messages yet" />
    );
  }

  return (
    <div className="space-y-2">
      {messages.map((thread) => (
        <Link
          key={thread.otherUser.id}
          href={`/messages/${thread.otherUser.id}`}
          className="block rounded-lg border border-border p-3 transition-colors outline-none hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="truncate text-label text-foreground">
              {thread.otherUser.firstName} {thread.otherUser.lastName}
            </p>
            {thread.unreadCount > 0 && (
              <Badge className="shrink-0 border-0 bg-primary font-semibold tabular-nums text-primary-foreground">
                {thread.unreadCount}
              </Badge>
            )}
          </div>
          <p className="mt-1 line-clamp-2 text-caption">
            {thread.lastMessage.content}
          </p>
          <p className="mt-1.5 text-caption tabular-nums">
            {formatRelativeTime(thread.lastMessage.createdAt)}
          </p>
        </Link>
      ))}
    </div>
  );
}
