"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { formatRelativeTime } from "@/lib/utils/formatting";
import { getPusherClient } from "@/lib/pusher-client";
import { inboxChannel } from "@/lib/pusher-channels";


interface Thread {
  otherUser: {
    id: string;
    firstName: string;
    lastName: string;
    imageUrl: string | null;
    role: string;
  };
  lastMessage: { content: string; createdAt: Date; deletedAt?: Date | null };
  unreadCount: number;
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
    const myInbox = pusher.subscribe(inboxChannel(currentUserId)) as any;

    myInbox.bind(
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
            unreadCount: updated[idx].unreadCount + 1,
          };
          return [updated[idx], ...updated.filter((_, i) => i !== idx)];
        });
      },
    );

    // Subscribe to each contact's presence channel for online dots
    const contactIds = initialThreads.map((t) => t.otherUser.id);
    contactIds.forEach((contactId) => {
      const ch = pusher.subscribe(inboxChannel(contactId)) as any;

      ch.bind("pusher:subscription_succeeded", (members: any) => {
        const ids: string[] = [];
        members.each((m: any) => ids.push(m.id));
        if (ids.length > 0) {
          setOnlineUsers((prev) => new Set([...prev, ...ids]));
        }
      });

      ch.bind("pusher:member_added", (member: any) => {
        setOnlineUsers((prev) => new Set([...prev, member.id]));
      });

      ch.bind("pusher:member_removed", (member: any) => {
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
  }, [currentUserId]);

  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
      {threads.map((thread, i) => {
        const hasUnread = thread.unreadCount > 0;
        const fullName = `${thread.otherUser.firstName} ${thread.otherUser.lastName}`;
        const initials = `${thread.otherUser.firstName[0]}${thread.otherUser.lastName[0]}`;
        const isOnline = onlineUsers.has(thread.otherUser.id);

        return (
          <Link key={thread.otherUser.id} href={`/messages/${thread.otherUser.id}`}>
            <div
              className={`group relative flex items-center gap-4 px-5 py-4 transition-all duration-150 hover:bg-muted/40 ${
                hasUnread ? "bg-primary/3" : ""
              } ${i !== 0 ? "border-t border-border/50" : ""}`}
            >

              <div className="relative shrink-0">
                <Avatar className="h-11 w-11 ring-2 ring-white shadow-sm">
                  <AvatarImage src={thread.otherUser.imageUrl || undefined} />
                  <AvatarFallback
                    className="bg-muted text-muted-foreground text-sm font-medium"
                  >
                    {initials}
                  </AvatarFallback>
                </Avatar>
                {hasUnread ? (
                  <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-card bg-primary" />
                ) : isOnline ? (
                  <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card bg-emerald-500" />
                ) : null}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <p
                    className={`truncate text-sm transition-colors group-hover:text-primary ${
                      hasUnread
                        ? "font-semibold text-foreground"
                        : "font-medium text-foreground/80"
                    }`}
                  >
                    {fullName}
                  </p>
                  <span
                    className={`shrink-0 text-xs ${
                      hasUnread ? "font-medium text-primary" : "text-muted-foreground/60"
                    }`}
                  >
                    {formatRelativeTime(thread.lastMessage.createdAt)}
                  </span>
                </div>
                <p
                  className={`mt-0.5 truncate text-sm leading-snug ${
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
