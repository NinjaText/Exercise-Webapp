"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatRelativeTime } from "@/lib/utils/formatting";
import { getPusherClient } from "@/lib/pusher-client";
import { inboxChannel } from "@/lib/pusher-channels";
import { getMessageCategory, MESSAGE_CATEGORY_LABEL } from "@/lib/utils/message-category";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

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
    imageUrl: string | null;
    role: string;
  };
  lastMessage: {
    content: string;
    createdAt: Date;
    deletedAt?: Date | null;
    replyToExerciseName?: string | null;
    planId?: string | null;
    isInternal?: boolean | null;
  };
  unreadCount: number;
}

export function InboxList({
  threads: initialThreads,
  currentUserId,
  selectedId,
}: {
  threads: Thread[];
  currentUserId: string;
  selectedId: string | null;
}) {
  const [threads, setThreads] = useState<Thread[]>(initialThreads);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  useEffect(() => {
    setThreads(initialThreads);
  }, [initialThreads]);

  useEffect(() => {
    const pusher = getPusherClient();
    const myInbox = pusher.subscribe(inboxChannel(currentUserId)) as unknown as PusherChannel;

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
            lastMessage: { ...updated[idx].lastMessage, content: data.content, createdAt: new Date(data.createdAt), deletedAt: null },
            unreadCount: updated[idx].otherUser.id === selectedId ? updated[idx].unreadCount : updated[idx].unreadCount + 1,
          };
          return [updated[idx], ...updated.filter((_, i) => i !== idx)];
        });
      },
    );

    const contactIds = initialThreads.map((t) => t.otherUser.id);
    contactIds.forEach((contactId) => {
      const ch = pusher.subscribe(inboxChannel(contactId)) as unknown as PusherChannel;
      ch.bind<PresenceMembers>("pusher:subscription_succeeded", (members) => {
        const ids: string[] = [];
        members.each((m) => ids.push(m.id));
        if (ids.length > 0) setOnlineUsers((prev) => new Set([...prev, ...ids]));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter((t) => {
      const name = `${t.otherUser.firstName} ${t.otherUser.lastName}`.toLowerCase();
      return name.includes(q) || t.lastMessage.content.toLowerCase().includes(q);
    });
  }, [threads, search]);

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search messages..."
            className="pl-9"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">No conversations found.</p>
        ) : (
          filtered.map((thread, i) => {
            const hasUnread = thread.unreadCount > 0;
            const isSelected = thread.otherUser.id === selectedId;
            const fullName = `${thread.otherUser.firstName} ${thread.otherUser.lastName}`;
            const initials = `${thread.otherUser.firstName[0]}${thread.otherUser.lastName[0]}`;
            const isOnline = onlineUsers.has(thread.otherUser.id);
            const category = getMessageCategory(thread.lastMessage);

            return (
              <Link key={thread.otherUser.id} href={`/messages?thread=${thread.otherUser.id}`} scroll={false}>
                <div
                  className={cn(
                    "group relative flex items-start gap-3 px-4 py-3 transition-colors",
                    isSelected ? "bg-primary/5" : hasUnread ? "bg-primary/3 hover:bg-muted/40" : "hover:bg-muted/40",
                    i !== 0 && "border-t border-border/50",
                  )}
                >
                  <div className="relative shrink-0">
                    <Avatar className="h-10 w-10 ring-2 ring-white shadow-sm">
                      <AvatarImage src={thread.otherUser.imageUrl || undefined} />
                      <AvatarFallback className="bg-muted text-xs font-medium text-muted-foreground">
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
                    <div className="flex items-baseline justify-between gap-2">
                      <p className={cn("truncate text-sm", hasUnread ? "font-semibold text-foreground" : "font-medium text-foreground/80")}>
                        {fullName}
                      </p>
                      <span className={cn("shrink-0 text-xs", hasUnread ? "font-medium text-primary" : "text-muted-foreground/60")}>
                        {formatRelativeTime(thread.lastMessage.createdAt)}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      {category !== "message" && (
                        <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[10px] font-medium">
                          {MESSAGE_CATEGORY_LABEL[category]}
                        </Badge>
                      )}
                      <p className={cn("truncate text-sm leading-snug", thread.lastMessage.deletedAt ? "italic text-muted-foreground/70" : hasUnread ? "font-medium text-foreground/80" : "text-muted-foreground")}>
                        {thread.lastMessage.deletedAt ? "Message deleted" : thread.lastMessage.content}
                      </p>
                    </div>
                  </div>

                  {hasUnread && (
                    <Badge className="h-5 min-w-5 shrink-0 justify-center border-0 bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                      {thread.unreadCount > 99 ? "99+" : thread.unreadCount}
                    </Badge>
                  )}
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
