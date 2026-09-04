import Link from "next/link";
import { getCurrentUser } from "@/lib/current-user";
import { getInboxThreads, markRead } from "@/lib/services/message.service";
import { getInboxThreadData } from "@/lib/services/inbox.service";
import { getClientsForTrainer, getTrainersForClient } from "@/lib/services/client.service";
import { pusherServer } from "@/lib/pusher";
import { threadChannel } from "@/lib/pusher-channels";
import { NewMessageDialog } from "@/components/messages/new-message-dialog";
import { BroadcastMessageDialog } from "@/components/messages/broadcast-message-dialog";
import { MessagesInboxClient } from "@/components/messages/messages-inbox-client";
import { InboxList } from "@/components/messages/inbox-list";
import { ClientContextPanel } from "@/components/messages/client-context-panel";
import { MarkAllReadButton } from "@/components/messages/mark-all-read-button";
import { MessageThread } from "@/components/messages/message-thread";
import { PageHeader } from "@/components/shared/page-header";
import { MessageSquare } from "lucide-react";

interface Props {
  searchParams: Promise<{ thread?: string }>;
}

export default async function MessagesPage({ searchParams }: Props) {
  const user = await getCurrentUser();

  if (user.role === "TRAINER") {
    return <TrainerInbox trainerId={user.id} searchParams={searchParams} />;
  }

  const threads = await getInboxThreads(user.id);
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
        <div className="rounded-xl border border-dashed border-border p-16 text-center">
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
  searchParams: Promise<{ thread?: string }>;
}) {
  const [threads, contacts, { thread: threadParam }] = await Promise.all([
    getInboxThreads(trainerId, { includeInternal: true }),
    getClientsForTrainer(trainerId),
    searchParams,
  ]);

  const selectedThread =
    (threadParam && threads.find((t) => t.otherUser.id === threadParam)) || threads[0] || null;
  const selectedId = selectedThread?.otherUser.id ?? null;

  let threadData = null;
  if (selectedId) {
    if (selectedThread!.unreadCount > 0) {
      await markRead(selectedId, trainerId);
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

  const unreadCount = threads.reduce((sum, t) => sum + t.unreadCount, 0);

  return (
    <div className="flex h-[calc(100dvh-7rem)] flex-col">
      <div className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Inbox</h1>
            {unreadCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground">
                {unreadCount}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">All messages, workout comments, and exercise feedback</p>
        </div>
        <div className="flex items-center gap-4">
          <MarkAllReadButton />
          <Link href="/voice-messages" className="text-sm font-medium text-muted-foreground hover:text-foreground">
            Voice Messages
          </Link>
          <BroadcastMessageDialog contacts={contacts} />
          <NewMessageDialog contacts={contacts} />
        </div>
      </div>

      {threads.length === 0 ? (
        <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-border p-16 text-center">
          <div>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
              <MessageSquare className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <h3 className="mt-5 text-lg font-semibold">No messages yet</h3>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
              Start a conversation by clicking <strong>New Message</strong> above.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[300px_1fr] overflow-hidden rounded-xl border border-border bg-card shadow-sm xl:grid-cols-[300px_1fr_300px]">
          <div className="min-h-0 border-r border-border">
            <InboxList threads={threads} currentUserId={trainerId} selectedId={selectedId} />
          </div>

          <div className="min-h-0">
            {selectedThread && threadData ? (
              <MessageThread
                key={selectedId}
                messages={threadData.messages}
                currentUserId={trainerId}
                recipientId={selectedThread.otherUser.id}
                recipientName={`${selectedThread.otherUser.firstName} ${selectedThread.otherUser.lastName}`}
                allowInternalNotes
              />
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
