"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import {
  sendMessageSchema,
  sendBroadcastMessageSchema,
  editMessageSchema,
  replyToClientNoteSchema,
  NOTE_EXCERPT_MAX_LENGTH,
} from "@/lib/validators/message";
import * as messageService from "@/lib/services/message.service";
import { getClientIdsForTrainer } from "@/lib/services/client.service";
import { pusherServer } from "@/lib/pusher";
import { threadChannel, inboxChannel } from "@/lib/pusher-channels";

type DeliveredMessage = Awaited<ReturnType<typeof messageService.sendMessage>>;

export async function broadcastNewMessage(message: DeliveredMessage) {
  // Internal notes must never reach the client — the thread/inbox Pusher
  // channels below are shared with the client's own browser session, so an
  // internal note is appended optimistically on the sender's side instead
  // (see message-thread.tsx) rather than broadcast here.
  if (message.isInternal) return;

  const payload = {
    id: message.id,
    senderId: message.senderId,
    recipientId: message.recipientId,
    content: message.content,
    audioUrl: message.audioUrl,
    audioDurationSec: message.audioDurationSec,
    createdAt: message.createdAt.toISOString(),
    editedAt: message.editedAt?.toISOString() ?? null,
    deletedAt: message.deletedAt?.toISOString() ?? null,
    replyToExerciseName: message.replyToExerciseName,
    replyToNoteExcerpt: message.replyToNoteExcerpt,
    sender: {
      firstName: message.sender.firstName,
      lastName: message.sender.lastName,
      imageUrl: message.sender.imageUrl,
    },
  };

  Promise.all([
    pusherServer.trigger(threadChannel(message.senderId, message.recipientId), "new-message", payload),
    pusherServer.trigger(inboxChannel(message.recipientId), "new-message", payload),
  ]).catch((err) => console.error("[pusher] trigger failed:", err));
}

/**
 * Minimal shape needed to push an edit/delete to connected clients. Kept
 * narrower than DeliveredMessage so both service functions can feed it.
 */
type UpdatedMessage = {
  id: string;
  senderId: string;
  recipientId: string;
  content: string;
  editedAt: Date | null;
  deletedAt: Date | null;
};

export async function broadcastMessageUpdate(message: UpdatedMessage) {
  const payload = {
    id: message.id,
    senderId: message.senderId,
    recipientId: message.recipientId,
    // A soft-deleted message keeps its content in the database for audit, but
    // it must never reach a connected client.
    content: message.deletedAt ? "" : message.content,
    editedAt: message.editedAt?.toISOString() ?? null,
    deletedAt: message.deletedAt?.toISOString() ?? null,
  };

  Promise.all([
    pusherServer.trigger(
      threadChannel(message.senderId, message.recipientId),
      "message-updated",
      payload,
    ),
    pusherServer.trigger(inboxChannel(message.recipientId), "message-updated", payload),
  ]).catch((err) => console.error("[pusher] trigger failed:", err));
}

export async function sendMessageAction(input: {
  recipientId: string;
  content: string;
  planId?: string;
  planExerciseId?: string;
  replyContext?: {
    sessionExerciseLogId: string;
    exerciseName: string;
    noteExcerpt: string;
  };
  isInternal?: boolean;
}) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };

  const parsed = sendMessageSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }

  // Only trainers may leave internal notes — a client-originated request
  // setting this flag is silently downgraded to a normal message.
  if (parsed.data.isInternal && dbUser.role !== "TRAINER") {
    parsed.data.isInternal = false;
  }

  try {
    const message = await messageService.sendMessage({
      senderId: dbUser.id,
      ...parsed.data,
    });

    broadcastNewMessage(message);

    revalidatePath("/messages");
    return { success: true as const, data: message };
  } catch (error) {
    console.error("Failed to send message:", error);
    return { success: false as const, error: "Failed to send message" };
  }
}

export async function editMessageAction(messageId: string, newContent: string) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };

  const parsed = editMessageSchema.safeParse({ messageId, content: newContent });
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }

  try {
    const message = await messageService.editMessage(
      parsed.data.messageId,
      dbUser.id,
      parsed.data.content,
    );

    broadcastMessageUpdate(message);

    revalidatePath("/messages");
    revalidatePath(`/messages/${message.recipientId}`);
    return { success: true as const, data: { content: message.content, editedAt: message.editedAt } };
  } catch (error) {
    console.error("Failed to edit message:", error);
    return { success: false as const, error: "Failed to edit message" };
  }
}

export async function deleteMessageAction(messageId: string) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };

  if (!messageId) return { success: false as const, error: "Message is required" };

  try {
    const message = await messageService.deleteMessage(messageId, dbUser.id);

    broadcastMessageUpdate(message);

    revalidatePath("/messages");
    revalidatePath(`/messages/${message.recipientId}`);
    return { success: true as const, data: { deletedAt: message.deletedAt } };
  } catch (error) {
    console.error("Failed to delete message:", error);
    return { success: false as const, error: "Failed to delete message" };
  }
}

/**
 * Trainer replies to a client's note left on one exercise of a logged session.
 * The reply lands in the normal Messages thread carrying a denormalized quote
 * of the note so the client sees what is being answered.
 */
export async function replyToClientNoteAction(
  sessionId: string,
  blockExerciseId: string,
  content: string,
) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };

  const parsed = replyToClientNoteSchema.safeParse({ sessionId, blockExerciseId, content });
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }

  try {
    const [log, blockExercise] = await Promise.all([
      prisma.sessionExerciseLog.findFirst({
        where: {
          sessionId: parsed.data.sessionId,
          blockExerciseId: parsed.data.blockExerciseId,
        },
        select: {
          id: true,
          clientNote: true,
          session: {
            select: {
              clientId: true,
              workout: { select: { program: { select: { trainerId: true } } } },
            },
          },
        },
      }),
      prisma.blockExerciseV2.findUnique({
        where: { id: parsed.data.blockExerciseId },
        select: { exercise: { select: { name: true } } },
      }),
    ]);

    if (!log) return { success: false as const, error: "Exercise log not found" };

    // Only the trainer who owns the program behind this session may reply.
    if (log.session.workout.program.trainerId !== dbUser.id) {
      return { success: false as const, error: "Not authorized to reply to this note" };
    }

    if (!log.clientNote) {
      return { success: false as const, error: "There is no client note to reply to" };
    }

    const message = await messageService.sendMessage({
      senderId: dbUser.id,
      recipientId: log.session.clientId,
      content: parsed.data.content,
      replyContext: {
        sessionExerciseLogId: log.id,
        exerciseName: blockExercise?.exercise.name ?? "Exercise",
        noteExcerpt: log.clientNote.slice(0, NOTE_EXCERPT_MAX_LENGTH),
      },
    });

    broadcastNewMessage(message);

    revalidatePath("/messages");
    revalidatePath(`/messages/${log.session.clientId}`);
    return { success: true as const, data: message };
  } catch (error) {
    console.error("Failed to reply to client note:", error);
    return { success: false as const, error: "Failed to send reply" };
  }
}

export async function markMessagesReadAction(senderId: string) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };

  try {
    await messageService.markRead(senderId, dbUser.id);

    pusherServer
      .trigger(threadChannel(senderId, dbUser.id), "messages-read", { readByUserId: dbUser.id })
      .catch((err) => console.error("[pusher] trigger failed:", err));

    revalidatePath("/messages");
    return { success: true as const };
  } catch (error) {
    console.error("Failed to mark messages read:", error);
    return { success: false as const, error: "Failed to mark as read" };
  }
}

export async function sendBroadcastMessageAction(input: {
  content: string;
  recipientIds?: string[];
  sendToAll?: boolean;
}) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };
  if (dbUser.role !== "TRAINER") {
    return { success: false as const, error: "Only trainers can broadcast messages" };
  }

  const parsed = sendBroadcastMessageSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }

  try {
    const rosterIds = await getClientIdsForTrainer(dbUser.id);
    const rosterSet = new Set(rosterIds);

    const recipientIds = parsed.data.sendToAll
      ? rosterIds
      : (parsed.data.recipientIds ?? []).filter((id) => rosterSet.has(id));

    if (recipientIds.length === 0) {
      return { success: false as const, error: "No valid recipients" };
    }

    let sentCount = 0;
    for (const recipientId of recipientIds) {
      try {
        const message = await messageService.sendMessage({
          senderId: dbUser.id,
          recipientId,
          content: parsed.data.content,
        });
        broadcastNewMessage(message);
        sentCount += 1;
      } catch (error) {
        console.error(`Failed to send broadcast to ${recipientId}:`, error);
      }
    }

    if (sentCount === 0) {
      return { success: false as const, error: "Failed to send broadcast" };
    }

    revalidatePath("/messages");
    return { success: true as const, sentCount };
  } catch (error) {
    console.error("Failed to send broadcast:", error);
    return { success: false as const, error: "Failed to send broadcast" };
  }
}
