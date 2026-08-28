import { z } from "zod";

/** Max characters of a client note cached onto a reply message for display. */
export const NOTE_EXCERPT_MAX_LENGTH = 300;

/**
 * Optional context attached when a trainer replies to a client's note on a
 * specific exercise. Values are cached onto the Message row at send time.
 */
export const replyContextSchema = z.object({
  sessionExerciseLogId: z.string().min(1),
  exerciseName: z.string().min(1),
  noteExcerpt: z.string().min(1).max(NOTE_EXCERPT_MAX_LENGTH),
});

export type ReplyContextInput = z.infer<typeof replyContextSchema>;

export const sendMessageSchema = z.object({
  recipientId: z.string().min(1, "Recipient is required"),
  content: z.string().min(1, "Message cannot be empty").max(5000),
  planId: z.string().optional(),
  planExerciseId: z.string().optional(),
  replyContext: replyContextSchema.optional(),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const editMessageSchema = z.object({
  messageId: z.string().min(1, "Message is required"),
  content: z.string().min(1, "Message cannot be empty").max(5000),
});

export type EditMessageInput = z.infer<typeof editMessageSchema>;

export const replyToClientNoteSchema = z.object({
  sessionId: z.string().min(1, "Session is required"),
  blockExerciseId: z.string().min(1, "Exercise is required"),
  content: z.string().min(1, "Reply cannot be empty").max(5000),
});

export type ReplyToClientNoteInput = z.infer<typeof replyToClientNoteSchema>;

export const sendBroadcastMessageSchema = z
  .object({
    content: z.string().min(1, "Message cannot be empty").max(5000),
    recipientIds: z.array(z.string().min(1)).optional(),
    sendToAll: z.boolean().optional(),
  })
  .refine((data) => data.sendToAll === true || (data.recipientIds?.length ?? 0) > 0, {
    message: "Select at least one recipient",
    path: ["recipientIds"],
  });

export type SendBroadcastMessageInput = z.infer<typeof sendBroadcastMessageSchema>;
