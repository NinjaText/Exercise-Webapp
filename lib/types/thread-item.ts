/**
 * A conversation between a trainer and a client is no longer just `Message`
 * rows: workout-linked `VoiceMemo` recordings (a note left against a specific
 * workout, not a chat message) are interleaved into the same thread so the
 * trainer has one place to look instead of a separate "Voice Messages" page.
 *
 * These two sources have nothing in common at the database level — a memo
 * relates to its participants only through `Workout → Program.{trainerId,
 * clientId}` — so they are unified here as a discriminated union on `kind`
 * rather than being forced into one Prisma model.
 */

/**
 * The subset of a `Message` row the thread UI actually renders. Kept
 * structurally compatible with Prisma's `Message` (plus its `sender`) so a
 * query result can be spread straight into a `ThreadItem`.
 */
export interface ThreadMessage {
  id: string;
  senderId: string;
  content: string;
  audioUrl?: string | null;
  audioDurationSec?: number | null;
  createdAt: Date;
  isRead?: boolean;
  readAt?: Date | string | null;
  editedAt?: Date | string | null;
  deletedAt?: Date | string | null;
  replyToExerciseName?: string | null;
  replyToNoteExcerpt?: string | null;
  isInternal?: boolean | null;
  sender: { firstName: string; lastName: string; imageUrl: string | null };
}

export type ThreadMessageItem = { kind: "message" } & ThreadMessage;

/** A `VoiceMemo` recorded against a workout, surfaced inside the thread. */
export interface ThreadVoiceNoteItem {
  kind: "voice_note";
  id: string;
  createdAt: Date;
  workoutId: string;
  workoutName: string;
  /**
   * Most recent session for the memo's workout, used to deep-link the trainer
   * to the actual logged session. Null when the workout has never been run.
   */
  sessionId: string | null;
  authorId: string;
  authorRole: "TRAINER" | "CLIENT";
  audioUrl: string;
  durationSec: number;
  isRead: boolean;
  author: { firstName: string; lastName: string; imageUrl: string | null } | null;
}

export type ThreadItem = ThreadMessageItem | ThreadVoiceNoteItem;

/** Preview copy shown in the Inbox list when a voice note is a thread's newest activity. */
export const VOICE_NOTE_PREVIEW = "🎤 Session voice note";
