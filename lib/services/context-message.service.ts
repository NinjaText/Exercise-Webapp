import { format } from "date-fns";
import * as messageService from "@/lib/services/message.service";
import { notifyUser, NOTIFICATION_TYPES } from "@/lib/services/notification.service";
import { broadcastNewMessage } from "@/actions/message-actions";
import { appBaseUrl } from "@/lib/utils/app-url";
import type { MessageContextInput } from "@/lib/validators/message";

const PREVIEW_MAX_LENGTH = 200;

/**
 * Deliver a client-originated message that carries structured context (a
 * shared reflection, a follow-along workout check-in) to the client's trainer:
 * persist it, push it over Pusher, and notify the trainer (in-app + email).
 *
 * Callers own authorization — resolve the trainer with getTrainerForClient and
 * check the client's messaging capability before calling this. The message is
 * an ordinary Message row, so the trainer replies from the normal thread.
 */
export async function sendContextMessageToTrainer(input: {
  client: { id: string; firstName: string; lastName: string };
  trainerId: string;
  content: string;
  context: MessageContextInput;
}) {
  const { client, trainerId, content, context } = input;

  const message = await messageService.sendMessage({
    senderId: client.id,
    recipientId: trainerId,
    content,
    context,
  });

  broadcastNewMessage(message);

  const senderName = `${client.firstName} ${client.lastName}`;
  await notifyUser({
    userId: trainerId,
    type: NOTIFICATION_TYPES.NEW_MESSAGE,
    title: "New message",
    body: `${senderName} shared ${context.kind === "REFLECTION" ? "a reflection" : "workout feedback"} with you.`,
    link: "/messages",
    metadata: { messageId: message.id, senderId: client.id, contextKind: context.kind },
    email: {
      senderName,
      sentAt: format(new Date(), "MMMM d 'at' h:mm a"),
      preview: content.length > PREVIEW_MAX_LENGTH ? `${content.slice(0, PREVIEW_MAX_LENGTH)}…` : content,
      messagesLink: `${appBaseUrl()}/messages`,
    },
  });

  return message;
}
