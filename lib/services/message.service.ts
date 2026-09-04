import { prisma } from "@/lib/prisma";
import { NOTE_EXCERPT_MAX_LENGTH, type ReplyContextInput } from "@/lib/validators/message";

/**
 * Blank out the content of soft-deleted messages before it leaves the server.
 *
 * Deleted rows keep their original `content` in the database (so thread
 * ordering and read-receipt history stay auditable), which means every read
 * path has to mask it — otherwise the "deleted" text would still be sitting in
 * the payload sent to the browser. Callers decide what placeholder copy to
 * render off the `deletedAt` flag.
 */
function maskIfDeleted<T extends { content: string; deletedAt: Date | null }>(message: T): T {
  return message.deletedAt ? { ...message, content: "" } : message;
}

export async function sendMessage(data: {
  senderId: string;
  recipientId: string;
  content: string;
  planId?: string;
  planExerciseId?: string;
  replyContext?: ReplyContextInput;
  isInternal?: boolean;
}) {
  const { replyContext, ...messageData } = data;

  return prisma.message.create({
    data: {
      ...messageData,
      ...(replyContext && {
        replyToSessionExerciseLogId: replyContext.sessionExerciseLogId,
        replyToExerciseName: replyContext.exerciseName,
        replyToNoteExcerpt: replyContext.noteExcerpt.slice(0, NOTE_EXCERPT_MAX_LENGTH),
      }),
    },
    include: { sender: true, recipient: true },
  });
}

/**
 * Update a message's content. Only the original sender may edit, and a
 * soft-deleted message can no longer be edited.
 */
export async function editMessage(messageId: string, senderId: string, newContent: string) {
  const existing = await prisma.message.findUnique({ where: { id: messageId } });

  if (!existing || existing.senderId !== senderId) {
    throw new Error("Message not found or access denied");
  }
  if (existing.deletedAt) {
    throw new Error("Cannot edit a deleted message");
  }

  return prisma.message.update({
    where: { id: messageId },
    data: { content: newContent, editedAt: new Date() },
    include: { sender: true, recipient: true },
  });
}

/**
 * Soft-delete a message. The row and its `content` are preserved so thread
 * ordering and read-receipt history remain intact; reads mask the content.
 */
export async function deleteMessage(messageId: string, senderId: string) {
  const existing = await prisma.message.findUnique({ where: { id: messageId } });

  if (!existing || existing.senderId !== senderId) {
    throw new Error("Message not found or access denied");
  }
  if (existing.deletedAt) return existing;

  return prisma.message.update({
    where: { id: messageId },
    data: { deletedAt: new Date() },
  });
}

export async function sendVoiceMessage(data: {
  senderId: string;
  recipientId: string;
  audioUrl: string;
  audioDurationSec: number;
}) {
  return prisma.message.create({
    data: { ...data, content: "" },
    include: { sender: true, recipient: true },
  });
}

export async function getThread(
  userId1: string,
  userId2: string,
  opts?: { includeInternal?: boolean },
) {
  const messages = await prisma.message.findMany({
    where: {
      OR: [
        { senderId: userId1, recipientId: userId2 },
        { senderId: userId2, recipientId: userId1 },
      ],
      ...(opts?.includeInternal ? {} : { isInternal: false }),
    },
    include: { sender: true, recipient: true },
    orderBy: { createdAt: "asc" },
  });

  return messages.map(maskIfDeleted);
}

export async function markRead(senderId: string, recipientId: string) {
  return prisma.message.updateMany({
    where: {
      senderId,
      recipientId,
      isRead: false,
    },
    data: { isRead: true, readAt: new Date() },
  });
}

/** Marks every unread message across every thread addressed to this user as read. */
export async function markAllRead(recipientId: string) {
  return prisma.message.updateMany({
    where: { recipientId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
}

export async function getUnreadCount(userId: string) {
  return prisma.message.count({
    where: { recipientId: userId, isRead: false },
  });
}

export async function getInboxThreads(userId: string, opts?: { includeInternal?: boolean }) {
  const internalFilter = opts?.includeInternal ? {} : { isInternal: false };

  // Fetch all messages and unread counts in parallel — 2 queries total, not N+1
  const [rawMessages, unreadGroups] = await Promise.all([
    prisma.message.findMany({
      where: { OR: [{ senderId: userId }, { recipientId: userId }], ...internalFilter },
      include: { sender: true, recipient: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.message.groupBy({
      by: ["senderId"],
      where: { recipientId: userId, isRead: false, ...internalFilter },
      _count: { id: true },
    }),
  ]);

  // Deleted messages still anchor a thread's position, but their content must
  // never surface in the inbox preview.
  const messages = rawMessages.map(maskIfDeleted);

  // Build a quick lookup: senderId → unread count
  const unreadBySender = new Map(
    unreadGroups.map((g) => [g.senderId, g._count.id])
  );

  const threadMap = new Map<
    string,
    {
      otherUser: { id: string; firstName: string; lastName: string; imageUrl: string | null; role: string };
      lastMessage: typeof messages[0];
      unreadCount: number;
    }
  >();

  for (const msg of messages) {
    const otherUserId = msg.senderId === userId ? msg.recipientId : msg.senderId;
    const otherUser = msg.senderId === userId ? msg.recipient : msg.sender;

    if (!threadMap.has(otherUserId)) {
      threadMap.set(otherUserId, {
        otherUser: {
          id: otherUser.id,
          firstName: otherUser.firstName,
          lastName: otherUser.lastName,
          imageUrl: otherUser.imageUrl,
          role: otherUser.role,
        },
        lastMessage: msg,
        unreadCount: unreadBySender.get(otherUserId) ?? 0,
      });
    }
  }

  return Array.from(threadMap.values()).sort(
    (a, b) => b.lastMessage.createdAt.getTime() - a.lastMessage.createdAt.getTime()
  );
}
