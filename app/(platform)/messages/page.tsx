import Link from "next/link";
import { getCurrentUser } from "@/lib/current-user";
import { markRead } from "@/lib/services/message.service";
import {
  getInboxThreadData,
  getInboxThreadsWithVoiceNotes,
} from "@/lib/services/inbox.service";
import { markAllVoiceMemosReadForThread } from "@/actions/voice-memo-actions";
import { getClientsForTrainer, getTrainersForClient } from "@/lib/services/client.service";
import { pusherServer } from "@/lib/pusher";
import { threadChannel } from "@/lib/pusher-channels";
import { NewMessageDialog } from "@/components/messages/new-message-dialog";
import { BroadcastMessageDialog } from "@/components/messages/broadcast-message-dialog";
import { MessagesInboxClient } from "@/components/messages/messages-inbox-client";
import { InboxList } from "@/components/messages/inbox-list";
import { ClientContextPanel } from "@/components/messages/client-context-panel";
import { ClientContextSheet } from "@/components/messages/client-context-sheet";
import { MarkAllReadButton } from "@/components/messages/mark-all-read-button";
import { MessageThread } from "@/components/messages/message-thread";
import { PageHeader } from "@/components/shared/page-header";
import { PageShell } from "@/components/shared/page-shell";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { MessageSquare, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { getDisplayName } from "@/lib/utils/display-name";

interface MessagesSearchParams {
  thread?: string;
  /** `filter=unread` narrows the trainer's thread list to conversations with unread items. */
  filter?: string;
}

interface Props {
  searchParams: Promise<MessagesSearchParams>;
}

export default async function MessagesPage({ searchParams }: Props) {
  const user = await getCurrentUser();

  if (user.role === "TRAINER") {
    return <TrainerInbox trainerId={user.id} searchParams={searchParams} />;
  }

  const threads = await getInboxThreadsWithVoiceNotes(user.id);
  const contacts = await getTrainersForClient(user.id);

  return (
    <PageShell width="full" className="h-[calc(100dvh-4rem-2rem)] sm:h-[calc(100dvh-4rem-3rem)]">
      <PageHeader
        title="Inbox"
        description={
          threads.length > 0
            ? `${threads.length} conversation${threads.length !== 1 ? "s" : ""}`
            : "Your conversations"
        }
        primaryAction={<NewMessageDialog contacts={contacts} />}
      />

      {threads.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="No messages yet"
          description="Start a conversation by clicking New Message above."
        />
      ) : (
        <div className="min-h-0 flex-1">
          <MessagesInboxClient initialThreads={threads} currentUserId={user.id} />
        </div>
      )}
    </PageShell>
  );
}

async function TrainerInbox({
  trainerId,
  searchParams,
}: {
  trainerId: string;
  searchParams: Promise<MessagesSearchParams>;
}) {
  const [allThreads, contacts, { thread: threadParam, filter }] = await Promise.all([
    getInboxThreadsWithVoiceNotes(trainerId, { includeInternal: true }),
    getClientsForTrainer(trainerId),
    searchParams,
  ]);

  // The unread filter is applied AFTER the voice-note enrichment above, so an
  // unread workout voice note keeps its thread in the filtered list.
  const unreadOnly = filter === "unread";
  const threads = unreadOnly ? allThreads.filter((t) => t.unreadCount > 0) : allThreads;

  const selectedThread =
    (threadParam && threads.find((t) => t.otherUser.id === threadParam)) || threads[0] || null;
  const selectedId = selectedThread?.otherUser.id ?? null;
  // `selectedId` always falls back to the first thread (for a sane desktop
  // default), so the mobile list/thread toggle below must key off whether a
  // thread was explicitly requested via ?thread= — otherwise "Back to Inbox"
  // could never show the list again once a thread had been opened.
  const isExplicitSelection = Boolean(threadParam);

  let threadData = null;
  if (selectedId) {
    if (selectedThread!.unreadCount > 0) {
      // The thread's unread badge covers both chat messages and workout voice
      // notes, so opening it has to clear both sources.
      await Promise.all([
        markRead(selectedId, trainerId),
        markAllVoiceMemosReadForThread(trainerId, selectedId),
      ]);
      pusherServer
        .trigger(threadChannel(selectedId, trainerId), "messages-read", { readByUserId: trainerId })
        .catch((err) => console.error("[pusher] messages-read trigger failed:", err));
      // Reflect the read state we just wrote — `threads` was fetched before
      // markRead above, so the selected thread's count would otherwise still
      // show its pre-read value in the header and list for this render.
      selectedThread!.unreadCount = 0;
    }
    threadData = await getInboxThreadData(trainerId, selectedId);
  }

  // Counted across every thread, not just the filtered view, so the header
  // badge keeps meaning the same thing whether or not the filter is on.
  const unreadCount = allThreads.reduce((sum, t) => sum + t.unreadCount, 0);

  return (
    <PageShell width="full" className="h-[calc(100dvh-4rem-2rem)] sm:h-[calc(100dvh-4rem-3rem)]">
      <PageHeader
        title="Inbox"
        description="All messages, workout comments, and exercise feedback"
        primaryAction={<NewMessageDialog contacts={contacts} />}
        secondaryActions={
          <>
            <MarkAllReadButton />
            <BroadcastMessageDialog contacts={contacts} />
          </>
        }
        meta={
          unreadCount > 0 || unreadOnly ? (
            <>
              {unreadCount > 0 && (
                <StatusBadge
                  status="unread"
                  role="brand"
                  dot={false}
                  size="sm"
                  label={`${unreadCount} unread`}
                />
              )}
              {unreadOnly && (
                <Link href="/messages" scroll={false}>
                  <StatusBadge
                    status="unread-only"
                    role="neutral"
                    dot={false}
                    size="sm"
                    label="Unread only ×"
                  />
                </Link>
              )}
            </>
          ) : undefined
        }
      />

      {threads.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <EmptyState
            icon={MessageSquare}
            title={unreadOnly ? "No unread messages" : "No messages yet"}
            description={
              unreadOnly
                ? "You're all caught up."
                : "Start a conversation by clicking New Message above."
            }
            action={
              unreadOnly ? (
                <Link href="/messages" scroll={false} className="text-sm font-medium text-primary hover:underline">
                  View all conversations
                </Link>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden rounded-xl bg-card ring-1 ring-border shadow-none md:grid-cols-[320px_1fr] xl:grid-cols-[320px_1fr_280px]">
          <div className={cn("min-h-0 border-r border-border", isExplicitSelection ? "hidden md:block" : "block")}>
            <InboxList threads={threads} currentUserId={trainerId} selectedId={selectedId} />
          </div>

          <div className={cn("min-h-0", isExplicitSelection ? "flex flex-col" : "hidden md:flex md:flex-col")}>
            {selectedThread && threadData ? (
              <>
                <Link
                  href="/messages"
                  scroll={false}
                  className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground md:hidden"
                >
                  <ArrowLeft className="h-4 w-4" /> Back to Inbox
                </Link>
                <div className="min-h-0 flex-1">
                  <MessageThread
                    key={selectedId}
                    items={threadData.items}
                    currentUserId={trainerId}
                    recipientId={selectedThread.otherUser.id}
                    recipientName={getDisplayName(selectedThread.otherUser)}
                    allowInternalNotes
                    headerRight={<ClientContextSheet client={selectedThread.otherUser} data={threadData} />}
                  />
                </div>
              </>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Select a conversation
              </div>
            )}
          </div>

          {selectedThread && threadData && (
            <div className="hidden min-h-0 border-l border-border xl:block">
              <ClientContextPanel client={selectedThread.otherUser} data={threadData} />
            </div>
          )}
        </div>
      )}
    </PageShell>
  );
}
