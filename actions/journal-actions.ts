"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { activeCallerOnly } from "@/lib/auth/active-user";
import { getCapabilitiesForUser } from "@/lib/org-capabilities.server";
import { MESSAGING_UNAVAILABLE } from "@/lib/org-capabilities";
import { getTrainerForClient } from "@/lib/services/client.service";
import { logUserAudit, AUDIT_ACTIONS } from "@/lib/services/audit-log.service";
import { sendContextMessageToTrainer } from "@/lib/services/context-message.service";
import * as journalService from "@/lib/services/journal.service";
import { findReflectionForDay } from "@/lib/services/reflection.service";
import { getTodaysReflectionCardData } from "@/lib/reflections/todays-reflection-card-data";
import { resolveClientDayKey } from "@/lib/reflections/dates";
import type { TodaysReflectionCardData } from "@/components/dashboard/todays-reflection-card";
import { CONTEXT_EXCERPT_MAX_LENGTH } from "@/lib/validators/message";
import {
  freeJournalEntrySchema,
  journalEntryIdSchema,
  todaysReflectionCardSchema,
  todaysReflectionEntrySchema,
  updateJournalEntrySchema,
} from "@/lib/validators/reflection";

// ─── Types ───────────────────────────────────────────────────────────────────

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };

async function getClient() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  const user = await activeCallerOnly(await prisma.user.findUnique({ where: { clerkId } }));
  return user?.role === "CLIENT" ? user : null;
}

function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? "Invalid input";
}

function revalidateJournalViews() {
  revalidatePath("/journal");
  revalidatePath("/dashboard");
}

// ─── Today's reflection ──────────────────────────────────────────────────────

/** The client's local day key, accepted within ±1 day of the server's UTC date. */
function clientDay(dateKey: string): Date | null {
  return resolveClientDayKey(dateKey, new Date());
}

/**
 * Card data for the client's local calendar day. The dashboard renders the
 * server's UTC day; the card calls this when the browser's day differs.
 */
export async function getTodaysReflectionCardAction(
  input: unknown
): Promise<ActionResult<TodaysReflectionCardData>> {
  const parsed = todaysReflectionCardSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid input" };

  const user = await getClient();
  if (!user) return { success: false, error: "Unauthorized" };

  const day = clientDay(parsed.data.dateKey);
  if (!day) return { success: false, error: "Invalid date" };

  const caps = await getCapabilitiesForUser(user);
  const data = await getTodaysReflectionCardData(user, { messaging: caps.messaging, day });
  if (!data) return { success: false, error: "Couldn't load today's reflection" };
  return { success: true, data };
}

/**
 * Saves the client's answer to the reflection their card showed. The card
 * sends the reflection reference and local day it rendered; the server checks
 * it is one of this client's reflections for that day and snapshots THAT row,
 * so the prompt can't be forged and allowJournal / allowShare come from the
 * server copy.
 *
 * PRIVATE → a journal entry only the client sees.
 * SHARED  → the entry plus a REFLECTION-context message to the trainer, who
 *           replies from the normal thread. If the message can't be sent the
 *           entry is removed again, so "shared" always means "delivered"; once
 *           it has been delivered, later bookkeeping failures are only logged
 *           (a retry would send the trainer a duplicate).
 */
export async function saveTodaysReflectionEntryAction(
  input: unknown
): Promise<ActionResult<{ id: string; visibility: "PRIVATE" | "SHARED" }>> {
  const parsed = todaysReflectionEntrySchema.safeParse(input);
  if (!parsed.success) return { success: false, error: firstIssue(parsed.error) };

  const user = await getClient();
  if (!user) return { success: false, error: "Unauthorized" };

  const { body, visibility, dateKey, reflectionId, libraryId } = parsed.data;
  const day = clientDay(dateKey);
  if (!day) return { success: false, error: "Invalid date" };

  let entryId: string;
  let trainerId: string;
  let messageId: string;
  let answered: Awaited<ReturnType<typeof findReflectionForDay>>;

  try {
    answered = await findReflectionForDay(user.id, day, { reflectionId, libraryId });
    if (!answered) return { success: false, error: "This reflection is no longer available — refresh to see today's." };
    const prompt = {
      reflectionId: answered.reflectionId,
      text: answered.text,
      author: answered.author,
      kind: answered.kind,
    };

    if (visibility === "PRIVATE") {
      if (!answered.allowJournal) return { success: false, error: "Journaling is turned off for today's reflection" };
      const entry = await journalService.createJournalEntry({
        clientId: user.id,
        body,
        visibility: "PRIVATE",
        entryDate: day,
        prompt,
      });
      revalidateJournalViews();
      return { success: true, data: { id: entry.id, visibility: "PRIVATE" } };
    }

    if (!answered.allowShare) return { success: false, error: "Sharing is turned off for today's reflection" };
    const caps = await getCapabilitiesForUser(user);
    if (!caps.messaging) return { success: false, error: MESSAGING_UNAVAILABLE };
    const trainer = await getTrainerForClient(user.id);
    if (!trainer) return { success: false, error: "You don't have a trainer to share with yet" };
    trainerId = trainer.id;

    const entry = await journalService.createJournalEntry({
      clientId: user.id,
      body,
      visibility: "SHARED",
      entryDate: day,
      prompt,
      trainerId,
    });
    entryId = entry.id;

    try {
      const message = await sendContextMessageToTrainer({
        client: user,
        trainerId,
        content: body,
        context: {
          kind: "REFLECTION",
          refId: entryId,
          title: "Today's reflection",
          excerpt: answered.text.slice(0, CONTEXT_EXCERPT_MAX_LENGTH),
        },
      });
      messageId = message.id;
    } catch (error) {
      await journalService.discardEntry(entryId).catch((cleanupError) => {
        console.error("[journal] failed to discard unsent shared entry:", cleanupError);
      });
      throw error;
    }
  } catch (error) {
    console.error("[journal] save reflection entry error:", error);
    return { success: false, error: "Couldn't save your reflection. Please try again." };
  }

  // Delivered: from here on nothing may turn into a client-visible failure.
  try {
    await journalService.attachMessage(entryId, messageId);
  } catch (error) {
    console.error("[journal] shared entry delivered but message link failed:", { entryId, messageId, error });
  }
  await logUserAudit(user, () => ({
    action: AUDIT_ACTIONS.REFLECTION_SHARED,
    targetType: "JournalEntry",
    targetId: entryId,
    metadata: { trainerId, messageId, reflectionId: answered?.reflectionId ?? null },
  }));
  try {
    revalidateJournalViews();
    revalidatePath("/messages");
  } catch (error) {
    console.error("[journal] revalidate after share failed:", error);
  }
  return { success: true, data: { id: entryId, visibility: "SHARED" } };
}

// ─── Free-form journal ───────────────────────────────────────────────────────

export async function createJournalEntryAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = freeJournalEntrySchema.safeParse(input);
  if (!parsed.success) return { success: false, error: firstIssue(parsed.error) };

  const user = await getClient();
  if (!user) return { success: false, error: "Unauthorized" };

  try {
    const entry = await journalService.createJournalEntry({
      clientId: user.id,
      body: parsed.data.body,
      visibility: "PRIVATE",
      // The client's local day when sent (and valid); the server's UTC day otherwise.
      entryDate: (parsed.data.dateKey && clientDay(parsed.data.dateKey)) || new Date(),
    });
    revalidateJournalViews();
    return { success: true, data: { id: entry.id } };
  } catch (error) {
    console.error("[journal] create entry error:", error);
    return { success: false, error: "Couldn't save your entry. Please try again." };
  }
}

/** Edits one of the client's PRIVATE entries; shared entries were already sent and stay read-only. */
export async function updateJournalEntryAction(input: unknown): Promise<ActionResult> {
  const parsed = updateJournalEntrySchema.safeParse(input);
  if (!parsed.success) return { success: false, error: firstIssue(parsed.error) };

  const user = await getClient();
  if (!user) return { success: false, error: "Unauthorized" };

  try {
    const { count } = await journalService.updatePrivateEntry(user.id, parsed.data.id, parsed.data.body);
    if (count === 0) return { success: false, error: "Entry not found" };
    revalidateJournalViews();
    return { success: true, data: undefined };
  } catch (error) {
    console.error("[journal] update entry error:", error);
    return { success: false, error: "Couldn't update your entry. Please try again." };
  }
}

export async function deleteJournalEntryAction(input: unknown): Promise<ActionResult> {
  const parsed = journalEntryIdSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid input" };

  const user = await getClient();
  if (!user) return { success: false, error: "Unauthorized" };

  try {
    const { count } = await journalService.deletePrivateEntry(user.id, parsed.data.id);
    if (count === 0) return { success: false, error: "Entry not found" };
    revalidateJournalViews();
    return { success: true, data: undefined };
  } catch (error) {
    console.error("[journal] delete entry error:", error);
    return { success: false, error: "Couldn't delete your entry. Please try again." };
  }
}
