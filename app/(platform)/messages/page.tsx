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
import { MessageSquare, ArrowLeft, X } from "lucide-react";
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
    <div className="space-y-6">
      <PageHeader
        title="Inbox"
        description={
          threads.length > 0
            ? `${threads.length} conversation${threads.length !== 1 ? "s" : ""}`
            : "Your conversations"
        }
        action={<NewMessageDialog contacts={contacts} />}
      />

      {threads.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center sm:p-16">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
            <MessageSquare className="h-8 w-8 text-muted-foreground/50" />
          </div>
          <h3 className="mt-5 text-lg font-semibold">No messages yet</h3>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            Start a conversation by clicking <strong>New Message</strong> above.
          </p>
        </div>
      ) : (
        <MessagesInboxClient initialThreads={threads} currentUserId={user.id} />
      )}
    </div>
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
    <div className="flex h-[calc(100dvh-7rem)] flex-col">
      <div className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight sm:text-3xl">Inbox</h1>
            {unreadCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground">
                {unreadCount}
              </span>
            )}
          </div>
          <p className="mt-1 hidden text-sm text-muted-foreground sm:block">All messages, workout comments, and exercise feedback</p>
          {unreadOnly && (
            <Link
              href="/messages"
              scroll={false}
              className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
            >
              Unread only
              <X className="h-3 w-3" />
            </Link>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <MarkAllReadButton />
          <BroadcastMessageDialog contacts={contacts} />
          <NewMessageDialog contacts={contacts} />
        </div>
      </div>

      {threads.length === 0 ? (
        <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-border p-8 text-center sm:p-16">
          <div>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
              <MessageSquare className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <h3 className="mt-5 text-lg font-semibold">
              {unreadOnly ? "No unread messages" : "No messages yet"}
            </h3>
            {unreadOnly ? (
              <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
                You&apos;re all caught up.{" "}
                <Link href="/messages" scroll={false} className="font-medium text-primary hover:underline">
                  View all conversations
                </Link>
                .
              </p>
            ) : (
              <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
                Start a conversation by clicking <strong>New Message</strong> above.
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden rounded-xl border border-border bg-card shadow-sm md:grid-cols-[280px_1fr] xl:grid-cols-[300px_1fr_300px]">
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
    </div>
  );
}
