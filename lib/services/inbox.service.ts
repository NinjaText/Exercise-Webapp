import { prisma } from "@/lib/prisma";
import * as messageService from "@/lib/services/message.service";
import * as programService from "@/lib/services/program.service";
import {
  VOICE_NOTE_PREVIEW,
  type ThreadItem,
  type ThreadMessage,
  type ThreadVoiceNoteItem,
} from "@/lib/types/thread-item";

/**
 * A `VoiceMemo` carries no participant ids of its own — it is reachable only
 * through `Workout → Program.{trainerId, clientId}`. Every query below shares
 * this join so "the memos belonging to this trainer/client conversation" has a
 * single definition.
 */
function memosForPair(trainerId: string, clientId: string) {
  return { workout: { program: { trainerId, clientId } } } as const;
}

/** Author/workout context the thread UI needs alongside the raw memo row. */
const VOICE_MEMO_THREAD_INCLUDE = {
  workout: {
    select: {
      name: true,
      // The workout the memo hangs off can have been run several times; the
      // newest session is the one the trainer wants to open.
      sessions: {
        select: { id: true },
        take: 1,
        orderBy: { scheduledDate: "desc" },
      },
      program: {
        select: {
          trainer: { select: { firstName: true, lastName: true, imageUrl: true } },
          client: { select: { firstName: true, lastName: true, imageUrl: true } },
        },
      },
    },
  },
} as const;

type VoiceMemoWithContext = {
  id: string;
  workoutId: string;
  authorId: string;
  authorRole: "TRAINER" | "CLIENT";
  r2Url: string;
  durationSec: number;
  isRead: boolean;
  createdAt: Date;
  workout: {
    name: string;
    sessions: { id: string }[];
    program: {
      trainer: { firstName: string; lastName: string; imageUrl: string | null } | null;
      client: { firstName: string; lastName: string; imageUrl: string | null } | null;
    };
  };
};

function toVoiceNoteItem(memo: VoiceMemoWithContext): ThreadVoiceNoteItem {
  const { program } = memo.workout;
  const author = memo.authorRole === "TRAINER" ? program.trainer : program.client;

  return {
    kind: "voice_note",
    id: memo.id,
    createdAt: memo.createdAt,
    workoutId: memo.workoutId,
    workoutName: memo.workout.name,
    sessionId: memo.workout.sessions[0]?.id ?? null,
    authorId: memo.authorId,
    authorRole: memo.authorRole,
    audioUrl: memo.r2Url,
    durationSec: memo.durationSec,
    isRead: memo.isRead,
    author: author ?? null,
  };
}

async function getThreadVoiceNotes(
  trainerId: string,
  clientId: string,
): Promise<ThreadVoiceNoteItem[]> {
  const memos = await prisma.voiceMemo.findMany({
    where: memosForPair(trainerId, clientId),
    include: VOICE_MEMO_THREAD_INCLUDE,
    orderBy: { createdAt: "asc" },
  });

  return (memos as VoiceMemoWithContext[]).map(toVoiceNoteItem);
}

function mergeThreadItems(
  messages: ThreadMessage[],
  voiceNotes: ThreadVoiceNoteItem[],
): ThreadItem[] {
  const items: ThreadItem[] = [
    ...messages.map((message) => ({ kind: "message" as const, ...message })),
    ...voiceNotes,
  ];

  return items.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

/**
 * One conversation as chat messages and workout voice notes interleaved in
 * chronological order — the single data source the thread view renders from.
 */
export async function getThreadItems(
  trainerId: string,
  clientId: string,
  opts?: { includeInternal?: boolean },
): Promise<ThreadItem[]> {
  const [messages, voiceNotes] = await Promise.all([
    messageService.getThread(trainerId, clientId, opts),
    getThreadVoiceNotes(trainerId, clientId),
  ]);

  return mergeThreadItems(messages, voiceNotes);
}

/**
 * Everything the trainer Inbox needs to render one selected conversation:
 * the thread itself plus a snapshot of the client's current program so the
 * context panel doesn't need a second round trip. Shared by the Inbox page
 * (initial load) and the thread-switch server action (subsequent loads) so
 * both stay in sync.
 */
export async function getInboxThreadData(trainerId: string, clientId: string) {
  const [messages, voiceNotes, [currentProgram]] = await Promise.all([
    messageService.getThread(trainerId, clientId, { includeInternal: true }),
    getThreadVoiceNotes(trainerId, clientId),
    programService.getProgramsForClient(clientId),
  ]);

  const items = mergeThreadItems(messages, voiceNotes);

  let stats: { completed: number; total: number; percent: number } | null = null;
  let lastCheckIn: Date | null = null;

  if (currentProgram) {
    const sessions = await prisma.workoutSessionV2.findMany({
      where: { workout: { programId: currentProgram.id } },
      select: { status: true, completedAt: true, scheduledDate: true },
    });

    const completedSessions = sessions.filter((s) => s.status === "COMPLETED");
    stats = {
      completed: completedSessions.length,
      total: sessions.length,
      percent: sessions.length > 0 ? Math.round((completedSessions.length / sessions.length) * 100) : 0,
    };

    lastCheckIn = completedSessions.reduce<Date | null>((latest, s) => {
      const at = s.completedAt ?? s.scheduledDate;
      return !latest || at > latest ? at : latest;
    }, null);
  }

  return {
    messages,
    items,
    program: currentProgram ? { id: currentProgram.id, name: currentProgram.name, status: currentProgram.status } : null,
    stats,
    lastCheckIn,
  };
}

export type InboxThreadData = Awaited<ReturnType<typeof getInboxThreadData>>;

/**
 * A conversation row in the Inbox list. Deliberately a plain shape rather than
 * the raw Prisma `Message`, because a thread's newest activity can now be a
 * voice memo — which has no `Message` row to borrow a preview from.
 */
export interface InboxThreadPreview {
  otherUser: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    imageUrl: string | null;
    role: string;
  };
  lastMessage: {
    content: string;
    createdAt: Date;
    deletedAt: Date | null;
    replyToExerciseName: string | null;
    planId: string | null;
    isInternal: boolean | null;
  };
  unreadCount: number;
  /** The newest item in this thread is a workout voice note, not a chat message. */
  lastItemIsVoiceNote: boolean;
}

/** Latest memo plus unread tally for one counterpart in the current user's threads. */
interface VoiceNoteSummary {
  latest: { createdAt: Date; workoutName: string };
  unreadCount: number;
  otherUser: InboxThreadPreview["otherUser"];
}

/**
 * Groups every voice memo visible to `userId` by the person on the other side
 * of the conversation. A memo is "unread" only for the participant who did not
 * record it.
 */
async function getVoiceNoteSummariesByCounterpart(
  userId: string,
): Promise<Map<string, VoiceNoteSummary>> {
  const memos = await prisma.voiceMemo.findMany({
    where: {
      workout: {
        program: {
          trainerId: { not: null },
          clientId: { not: null },
          OR: [{ trainerId: userId }, { clientId: userId }],
        },
      },
    },
    include: {
      workout: {
        select: {
          name: true,
          program: {
            select: {
              trainerId: true,
              clientId: true,
              trainer: {
                select: { id: true, firstName: true, lastName: true, email: true, imageUrl: true, role: true },
              },
              client: {
                select: { id: true, firstName: true, lastName: true, email: true, imageUrl: true, role: true },
              },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const summaries = new Map<string, VoiceNoteSummary>();

  for (const memo of memos) {
    const { program } = memo.workout;
    const isTrainerSide = program.trainerId === userId;
    const otherUser = isTrainerSide ? program.client : program.trainer;
    if (!otherUser) continue;

    const existing = summaries.get(otherUser.id);
    const isUnread = !memo.isRead && memo.authorId !== userId;

    if (existing) {
      // `memos` is sorted newest-first, so the first row wins as `latest`.
      existing.unreadCount += isUnread ? 1 : 0;
      continue;
    }

    summaries.set(otherUser.id, {
      latest: { createdAt: memo.createdAt, workoutName: memo.workout.name },
      unreadCount: isUnread ? 1 : 0,
      otherUser: {
        id: otherUser.id,
        firstName: otherUser.firstName,
        lastName: otherUser.lastName,
        email: otherUser.email,
        imageUrl: otherUser.imageUrl,
        role: otherUser.role,
      },
    });
  }

  return summaries;
}

function voiceNotePreview(
  latest: VoiceNoteSummary["latest"],
): InboxThreadPreview["lastMessage"] {
  return {
    content: `${VOICE_NOTE_PREVIEW} · ${latest.workoutName}`,
    createdAt: latest.createdAt,
    deletedAt: null,
    replyToExerciseName: null,
    planId: null,
    isInternal: false,
  };
}

/**
 * The Inbox list, with workout voice memos folded in: a memo newer than a
 * thread's last message takes over the preview line, its unread count rolls
 * into the thread's badge, and a client whose only activity is a voice memo
 * still gets a row (they would otherwise be invisible in the Inbox).
 */
export async function getInboxThreadsWithVoiceNotes(
  userId: string,
  opts?: { includeInternal?: boolean },
): Promise<InboxThreadPreview[]> {
  const [messageThreads, voiceSummaries] = await Promise.all([
    messageService.getInboxThreads(userId, opts),
    getVoiceNoteSummariesByCounterpart(userId),
  ]);

  const threads: InboxThreadPreview[] = messageThreads.map((thread) => ({
    otherUser: thread.otherUser,
    lastMessage: {
      content: thread.lastMessage.content,
      createdAt: thread.lastMessage.createdAt,
      deletedAt: thread.lastMessage.deletedAt,
      replyToExerciseName: thread.lastMessage.replyToExerciseName,
      planId: thread.lastMessage.planId,
      isInternal: thread.lastMessage.isInternal,
    },
    unreadCount: thread.unreadCount,
    lastItemIsVoiceNote: false,
  }));

  const byUserId = new Map(threads.map((t) => [t.otherUser.id, t]));

  for (const [otherUserId, summary] of voiceSummaries) {
    const existing = byUserId.get(otherUserId);

    if (!existing) {
      threads.push({
        otherUser: summary.otherUser,
        lastMessage: voiceNotePreview(summary.latest),
        unreadCount: summary.unreadCount,
        lastItemIsVoiceNote: true,
      });
      continue;
    }

    existing.unreadCount += summary.unreadCount;
    if (summary.latest.createdAt > existing.lastMessage.createdAt) {
      existing.lastMessage = voiceNotePreview(summary.latest);
      existing.lastItemIsVoiceNote = true;
    }
  }

  return threads.sort(
    (a, b) => b.lastMessage.createdAt.getTime() - a.lastMessage.createdAt.getTime(),
  );
}

/**
 * Unread workout voice memos addressed to this user across every conversation.
 * Folded into the single unread-messages badge in the platform nav.
 */
export async function getUnreadVoiceNoteCount(
  userId: string,
  role: "TRAINER" | "CLIENT",
): Promise<number> {
  return prisma.voiceMemo.count({
    where: {
      isRead: false,
      authorId: { not: userId },
      workout: {
        program:
          role === "TRAINER"
            ? { trainerId: userId, clientId: { not: null } }
            : { clientId: userId, trainerId: { not: null } },
      },
    },
  });
}
