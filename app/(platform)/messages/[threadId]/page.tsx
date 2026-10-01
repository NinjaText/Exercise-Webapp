import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { markRead } from "@/lib/services/message.service";
import { getThreadItems } from "@/lib/services/inbox.service";
import { markAllVoiceMemosReadForThread } from "@/actions/voice-memo-actions";
import { prisma } from "@/lib/prisma";
import { pusherServer } from "@/lib/pusher";
import { threadChannel } from "@/lib/pusher-channels";
import { MessageThread } from "@/components/messages/message-thread";
import { PageShell } from "@/components/shared/page-shell";
import { PageHeader } from "@/components/shared/page-header";
import { MESSAGES_PANE_SURFACE, MESSAGES_VIEWPORT_HEIGHT } from "@/components/messages/layout-classes";
import { cn } from "@/lib/utils";
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

  const recipientName = getDisplayName(otherUser);

  return (
    <PageShell className={MESSAGES_VIEWPORT_HEIGHT}>
      <PageHeader
        title="Conversation"
        back={{ label: "Back to inbox", href: "/messages" }}
        breadcrumb={[{ label: "Inbox", href: "/messages" }, { label: recipientName }]}
      />
      <div className={cn("min-h-0 flex-1", MESSAGES_PANE_SURFACE)}>
        <MessageThread
          items={items}
          currentUserId={user.id}
          recipientId={threadId}
          recipientName={recipientName}
        />
      </div>
    </PageShell>
  );
}
