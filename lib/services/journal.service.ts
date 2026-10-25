import type { JournalEntry } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { JournalVisibility } from "@/lib/reflections/constants";
import { toUtcDay } from "@/lib/reflections/dates";

/**
 * Client journal. Privacy contract: a PRIVATE entry belongs to the client
 * alone. Client paths below are scoped by `clientId`; every trainer path goes
 * through `listSharedEntriesForTrainer`, which filters on SHARED in the query
 * AND again on the rows, so no trainer-facing code can ever receive a
 * private entry.
 */

const CLIENT_PAGE_SIZE = 50;
const TRAINER_PAGE_SIZE = 50;

export interface JournalPromptSnapshot {
  reflectionId: string | null;
  text: string;
  author: string | null;
  kind: string;
}

export async function createJournalEntry(input: {
  clientId: string;
  body: string;
  visibility: JournalVisibility;
  entryDate: Date;
  prompt?: JournalPromptSnapshot | null;
  /** Required for SHARED entries — the trainer the entry is shared with. */
  trainerId?: string | null;
}): Promise<JournalEntry> {
  if (input.visibility === "SHARED" && !input.trainerId) {
    throw new Error("A shared journal entry needs a trainer");
  }
  return prisma.journalEntry.create({
    data: {
      clientId: input.clientId,
      body: input.body,
      visibility: input.visibility,
      entryDate: toUtcDay(input.entryDate),
      trainerId: input.visibility === "SHARED" ? input.trainerId! : null,
      reflectionId: input.prompt?.reflectionId ?? null,
      promptText: input.prompt?.text ?? null,
      promptAuthor: input.prompt?.author ?? null,
      promptKind: input.prompt?.kind ?? null,
      messageId: null,
    },
  });
}

/** Links a SHARED entry to the Message it was delivered as. */
export async function attachMessage(entryId: string, messageId: string) {
  return prisma.journalEntry.update({ where: { id: entryId }, data: { messageId } });
}

/** Rollback for a share whose message failed to send. */
export async function discardEntry(entryId: string) {
  await prisma.journalEntry.delete({ where: { id: entryId } });
}

// ─── Client paths (own entries only) ─────────────────────────────────────────

export async function listEntriesForClient(clientId: string, take = CLIENT_PAGE_SIZE) {
  return prisma.journalEntry.findMany({
    where: { clientId },
    orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
    take,
  });
}

/** The client's latest answer to a reflection prompt on `day`, if any. */
export async function getPromptEntryForDay(clientId: string, day: Date) {
  return prisma.journalEntry.findFirst({
    where: { clientId, entryDate: toUtcDay(day), promptText: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { id: true, visibility: true },
  });
}

/** Edits a PRIVATE entry the client owns. Shared entries were already sent, so they are read-only. */
export async function updatePrivateEntry(clientId: string, id: string, body: string) {
  const result = await prisma.journalEntry.updateMany({
    where: { id, clientId, visibility: "PRIVATE" },
    data: { body },
  });
  return { count: result.count };
}

export async function deletePrivateEntry(clientId: string, id: string) {
  const result = await prisma.journalEntry.deleteMany({ where: { id, clientId, visibility: "PRIVATE" } });
  return { count: result.count };
}

// ─── Trainer path (SHARED only) ──────────────────────────────────────────────

export type SharedJournalEntry = Pick<
  JournalEntry,
  "id" | "clientId" | "promptText" | "promptAuthor" | "promptKind" | "body" | "entryDate" | "messageId" | "createdAt"
> & { visibility: "SHARED" };

/**
 * Entries clients shared with this trainer, newest first, optionally for one
 * client. The only journal read a trainer-facing caller may use.
 */
export async function listSharedEntriesForTrainer(
  trainerId: string,
  options: { clientId?: string; take?: number } = {}
): Promise<SharedJournalEntry[]> {
  const rows = await prisma.journalEntry.findMany({
    where: {
      trainerId,
      visibility: "SHARED",
      ...(options.clientId ? { clientId: options.clientId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: options.take ?? TRAINER_PAGE_SIZE,
    select: {
      id: true,
      clientId: true,
      visibility: true,
      promptText: true,
      promptAuthor: true,
      promptKind: true,
      body: true,
      entryDate: true,
      messageId: true,
      createdAt: true,
    },
  });
  // Belt and braces: never let a non-shared row through, whatever the query returned.
  return rows.filter((row): row is SharedJournalEntry => row.visibility === "SHARED");
}

// ─── Message sync (shared entries) ───────────────────────────────────────────

type SharedMessageRef = {
  id: string;
  senderId: string;
  contextKind?: string | null;
  contextRefId?: string | null;
};

/**
 * The SHARED entry a client's reflection message delivered. Matched by the
 * message's context ref (the entry id) or by the entry's messageId, and
 * always scoped to the sender as the entry's owner.
 */
function sharedEntryWhere(message: SharedMessageRef) {
  return {
    clientId: message.senderId,
    visibility: "SHARED",
    OR: [...(message.contextRefId ? [{ id: message.contextRefId }] : []), { messageId: message.id }],
  };
}

/**
 * The client deleted the message that shared an entry: withdraw it from the
 * trainer (back to PRIVATE, unlinked) while the client keeps their own copy.
 * No-op for any message that isn't a shared reflection.
 */
export async function unshareEntryForDeletedMessage(message: SharedMessageRef) {
  if (message.contextKind !== "REFLECTION") return { count: 0 };
  const result = await prisma.journalEntry.updateMany({
    where: sharedEntryWhere(message),
    data: { visibility: "PRIVATE", trainerId: null, messageId: null },
  });
  return { count: result.count };
}

/** The client edited the message that shared an entry: the entry mirrors the new text. */
export async function syncEntryBodyFromEditedMessage(message: SharedMessageRef & { content: string }) {
  if (message.contextKind !== "REFLECTION") return { count: 0 };
  const result = await prisma.journalEntry.updateMany({
    where: sharedEntryWhere(message),
    data: { body: message.content },
  });
  return { count: result.count };
}
