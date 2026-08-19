import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { getThread, markRead } from "@/lib/services/message.service";
import { prisma } from "@/lib/prisma";
import { pusherServer } from "@/lib/pusher";
import { threadChannel } from "@/lib/pusher-channels";
import { MessageThread } from "@/components/messages/message-thread";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface Props {
  params: Promise<{ threadId: string }>;
}

export default async function ThreadPage({ params }: Props) {
  const { threadId } = await params;
  const user = await getCurrentUser();

  const otherUser = await prisma.user.findUnique({ where: { id: threadId } });
  if (!otherUser || !user.clerkOrgId || otherUser.clerkOrgId !== user.clerkOrgId) notFound();

  const messages = await getThread(user.id, threadId);

  // Mark as read in DB and notify the sender via Pusher so they get a real-time read receipt
  await markRead(threadId, user.id);
  pusherServer
    .trigger(threadChannel(threadId, user.id), "messages-read", { readByUserId: user.id })
    .catch((err) => console.error("[pusher] messages-read trigger failed:", err));

  return (
    <div className="flex h-[calc(100dvh-10rem)] flex-col">
      <div className="shrink-0 pb-4">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href="/messages">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to Messages
          </Link>
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        <MessageThread
          messages={messages}
          currentUserId={user.id}
          recipientId={threadId}
          recipientName={`${otherUser.firstName} ${otherUser.lastName}`}
        />
      </div>
    </div>
  );
}
