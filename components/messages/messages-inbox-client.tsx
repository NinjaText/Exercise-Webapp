"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { formatRelativeTime } from "@/lib/utils/formatting";
import { getPusherClient } from "@/lib/pusher-client";
import { inboxChannel } from "@/lib/pusher-channels";
import { getDisplayName, getInitials } from "@/lib/utils/display-name";

interface PresenceMember {
  id: string;
}
interface PresenceMembers {
  each: (callback: (member: PresenceMember) => void) => void;
}
interface PusherChannel {
  bind: <T>(event: string, callback: (data: T) => void) => void;
}

interface Thread {
  otherUser: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    imageUrl: string | null;
    role: string;
  };
  lastMessage: { content: string; createdAt: Date; deletedAt?: Date | null };
  unreadCount: number;
  /** The newest item is a workout voice note rather than a chat message. */
  lastItemIsVoiceNote?: boolean;
}

interface MessagesInboxClientProps {
  initialThreads: Thread[];
  currentUserId: string;
}

export function MessagesInboxClient({
  initialThreads,
  currentUserId,
}: MessagesInboxClientProps) {
  const [threads, setThreads] = useState<Thread[]>(initialThreads);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());

  useEffect(() => {
    const pusher = getPusherClient();

    // Subscribe to own inbox channel — receives new-message events
    const myInbox = pusher.subscribe(inboxChannel(currentUserId)) as unknown as PusherChannel;

    myInbox.bind<{ senderId: string; content: string; createdAt: string }>(
      "new-message",
      (data: { senderId: string; content: string; createdAt: string }) => {
        if (data.senderId === currentUserId) return;
        setThreads((prev) => {
          const idx = prev.findIndex((t) => t.otherUser.id === data.senderId);
          if (idx === -1) return prev;
          const updated = [...prev];
          updated[idx] = {
            ...updated[idx],
            lastMessage: { content: data.content, createdAt: new Date(data.createdAt), deletedAt: null },
            lastItemIsVoiceNote: false,
            unreadCount: updated[idx].unreadCount + 1,
          };
          return [updated[idx], ...updated.filter((_, i) => i !== idx)];
        });
      },
    );

    // Subscribe to each contact's presence channel for online dots
    const contactIds = initialThreads.map((t) => t.otherUser.id);
    contactIds.forEach((contactId) => {
      const ch = pusher.subscribe(inboxChannel(contactId)) as unknown as PusherChannel;

      ch.bind<PresenceMembers>("pusher:subscription_succeeded", (members) => {
        const ids: string[] = [];
        members.each((m) => ids.push(m.id));
        if (ids.length > 0) {
          setOnlineUsers((prev) => new Set([...prev, ...ids]));
        }
      });

      ch.bind<PresenceMember>("pusher:member_added", (member) => {
        setOnlineUsers((prev) => new Set([...prev, member.id]));
      });

      ch.bind<PresenceMember>("pusher:member_removed", (member) => {
        setOnlineUsers((prev) => {
          const next = new Set(prev);
          next.delete(member.id);
          return next;
        });
      });
    });

    return () => {
      pusher.unsubscribe(inboxChannel(currentUserId));
      contactIds.forEach((id) => pusher.unsubscribe(inboxChannel(id)));
    };
    // Subscriptions are keyed to the user; the contact list is the initial snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId]);

  return (
    <div className="h-full overflow-y-auto rounded-xl bg-card shadow-xs ring-1 ring-border">
      {threads.map((thread, i) => {
        const hasUnread = thread.unreadCount > 0;
        const fullName = getDisplayName(thread.otherUser);
        const initials = getInitials(thread.otherUser);
        const isOnline = onlineUsers.has(thread.otherUser.id);

        return (
          <Link
            key={thread.otherUser.id}
            href={`/messages/${thread.otherUser.id}`}
            className="block outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <div
              className={`group relative flex items-center gap-3 px-5 py-4 transition-colors hover:bg-surface-muted motion-reduce:transition-none ${
                hasUnread ? "bg-primary/3" : ""
              } ${i !== 0 ? "border-t border-border" : ""}`}
            >

              <div className="relative shrink-0">
                <Avatar className="size-10">
                  <AvatarImage src={thread.otherUser.imageUrl || undefined} />
                  <AvatarFallback
                    className="bg-surface-muted text-caption font-medium text-foreground"
                  >
                    {initials}
                  </AvatarFallback>
                </Avatar>
                {hasUnread ? (
                  <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-card bg-primary" />
                ) : isOnline ? (
                  <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card bg-success" />
                ) : null}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <p
                    className={`truncate text-label ${
                      hasUnread
                        ? "font-semibold text-foreground"
                        : "font-medium text-foreground/80"
                    }`}
                  >
                    {fullName}
                  </p>
                  <span
                    className={`shrink-0 text-caption tabular-nums ${
                      hasUnread ? "font-medium text-primary" : ""
                    }`}
                  >
                    {formatRelativeTime(thread.lastMessage.createdAt)}
                  </span>
                </div>
                <p
                  className={`mt-0.5 truncate text-body ${
                    thread.lastMessage.deletedAt
                      ? "italic text-muted-foreground/70"
                      : hasUnread
                      ? "font-medium text-foreground/80"
                      : "text-muted-foreground"
                  }`}
                >
                  {thread.lastMessage.deletedAt ? "Message deleted" : thread.lastMessage.content}
                </p>
              </div>

              {hasUnread && (
                <Badge className="h-5 min-w-5 shrink-0 justify-center border-0 bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                  {thread.unreadCount > 99 ? "99+" : thread.unreadCount}
                </Badge>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
