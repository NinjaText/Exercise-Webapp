"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import {
  Bell,
  CalendarDays,
  ClipboardList,
  CheckCircle,
  AlertCircle,
  FileText,
  MessageSquare,
  CheckCheck,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import {
  markNotificationReadAction,
  markAllNotificationsReadAction,
} from "@/actions/notification-actions";
import type { Notification } from "@prisma/client";
import { cn } from "@/lib/utils";

interface NotificationPanelProps {
  initialNotifications: Notification[];
  initialUnreadCount: number;
}

const TYPE_CONFIG: Record<
  string,
  { icon: React.ElementType; colorClass: string }
> = {
  SESSION_REMINDER: { icon: CalendarDays, colorClass: "text-blue-500" },
  CHECK_IN_DUE: { icon: ClipboardList, colorClass: "text-violet-500" },
  SESSION_COMPLETED: { icon: CheckCircle, colorClass: "text-emerald-500" },
  MISSED_SESSION: { icon: AlertCircle, colorClass: "text-amber-500" },
  NEW_RESPONSE: { icon: FileText, colorClass: "text-indigo-500" },
  NEW_MESSAGE: { icon: MessageSquare, colorClass: "text-primary" },
};

function getTypeConfig(type: string) {
  return (
    TYPE_CONFIG[type] ?? { icon: Bell, colorClass: "text-muted-foreground" }
  );
}

export function NotificationPanel({
  initialNotifications,
  initialUnreadCount,
}: NotificationPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [notifications, setNotifications] =
    useState<Notification[]>(initialNotifications);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [open, setOpen] = useState(false);

  function handleMarkOneRead(notification: Notification) {
    if (!notification.isRead) {
      startTransition(async () => {
        await markNotificationReadAction(notification.id);
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === notification.id ? { ...n, isRead: true } : n
          )
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      });
    }

    if (notification.link) {
      setOpen(false);
      router.push(notification.link);
    }
  }

  function handleMarkAllRead() {
    startTransition(async () => {
      await markAllNotificationsReadAction();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {/* PopoverTrigger from @base-ui/react renders a native button — no asChild needed */}
      <PopoverTrigger
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        aria-label="Open notifications"
      >
        <Bell className="h-4.5 w-4.5 text-muted-foreground" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-80 rounded-xl border border-border p-0 shadow-xl bg-card"
      >
        {/* Panel header */}
        <div className="flex items-center justify-between px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">
            Notifications
          </h3>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              disabled={isPending}
              className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </button>
          )}
        </div>

        <Separator />

        {/* Notification list — plain overflow scroll, not the ScrollArea
            primitive: its Viewport relies on height:100% resolving against
            an ancestor sized only by max-height, which browsers don't treat
            as a definite reference, so content silently overflowed past the
            popover instead of scrolling inside it. */}
        <div className="max-h-105 overflow-x-hidden overflow-y-auto">
          {notifications.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className="p-1">
              {notifications.map((notification, index) => (
                <li key={notification.id}>
                  <NotificationItem
                    notification={notification}
                    onClick={() => handleMarkOneRead(notification)}
                  />
                  {index < notifications.length - 1 && (
                    <Separator className="mx-3" />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function NotificationItem({
  notification,
  onClick,
}: {
  notification: Notification;
  onClick: () => void;
}) {
  const { icon: Icon, colorClass } = getTypeConfig(notification.type);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-3 rounded-lg p-3 text-left transition-colors hover:bg-muted/50",
        !notification.isRead && "bg-primary/5"
      )}
    >
      {/* Type icon */}
      <div className="mt-0.5 shrink-0">
        <Icon className={cn("h-4 w-4", colorClass)} />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground leading-snug">
          {notification.title}
        </p>
        {notification.body && (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground leading-snug">
            {notification.body}
          </p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(notification.createdAt), {
            addSuffix: true,
          })}
        </p>
      </div>

      {/* Unread dot */}
      {!notification.isRead && (
        <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
      )}
    </button>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <CheckCircle className="h-8 w-8 text-emerald-500/70" />
      <p className="text-sm font-medium text-foreground">
        You&apos;re all caught up!
      </p>
      <p className="text-xs text-muted-foreground">
        No new notifications right now.
      </p>
    </div>
  );
}
