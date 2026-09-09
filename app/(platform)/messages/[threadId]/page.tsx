import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { markRead } from "@/lib/services/message.service";
import { getThreadItems } from "@/lib/services/inbox.service";
import { markAllVoiceMemosReadForThread } from "@/actions/voice-memo-actions";
import { prisma } from "@/lib/prisma";
import { pusherServer } from "@/lib/pusher";
import { threadChannel } from "@/lib/pusher-channels";
import { MessageThread } from "@/components/messages/message-thread";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getDisplayName } from "@/lib/utils/display-name";

interface Props {
  params: Promise<{ threadId: string }>;
}

export default async function ThreadPage({ params }: Props) {
  const { threadId } = await params;
  const user = await getCurrentUser();

  // Trainers get the full 3-pane Inbox at /messages; this standalone thread
  // route now only serves the client's simpler conversation view.
  if (user.role === "TRAINER") {
    redirect(`/messages?thread=${threadId}`);
  }

  const otherUser = await prisma.user.findUnique({ where: { id: threadId } });
  if (!otherUser || !user.clerkOrgId || otherUser.clerkOrgId !== user.clerkOrgId) notFound();

  // This route only serves clients (trainers are redirected above), so the
  // other participant is the trainer side of the trainer/client voice-memo join.
  const items = await getThreadItems(threadId, user.id, { includeInternal: false });

  // Mark as read in DB and notify the sender via Pusher so they get a real-time read receipt
  await markRead(threadId, user.id);
  await markAllVoiceMemosReadForThread(threadId, user.id);
  pusherServer
    .trigger(threadChannel(threadId, user.id), "messages-read", { readByUserId: user.id })
    .catch((err) => console.error("[pusher] messages-read trigger failed:", err));

  return (
    <div className="flex h-[calc(100dvh-10rem)] flex-col">
      <div className="shrink-0 pb-4">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href="/messages">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to Inbox
          </Link>
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        <MessageThread
          items={items}
          currentUserId={user.id}
          recipientId={threadId}
          recipientName={getDisplayName(otherUser)}
        />
      </div>
    </div>
  );
}
