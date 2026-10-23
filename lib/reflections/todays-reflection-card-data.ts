import "server-only";
import { getTrainerForClient } from "@/lib/services/client.service";
import { getPromptEntryForDay } from "@/lib/services/journal.service";
import { getTodaysReflection } from "@/lib/services/reflection.service";
import { toDateKey } from "@/lib/reflections/dates";
import type { TodaysReflectionCardData } from "@/components/dashboard/todays-reflection-card";

/**
 * Everything the client dashboard's Today's Reflection card needs, resolved
 * in parallel, for one UTC-anchored calendar day. The dashboard renders the
 * server's UTC day first; the card re-requests the client's local day through
 * getTodaysReflectionCardAction when the two differ. Share is offered only when the reflection allows it, the
 * client has messaging and there is a trainer to receive it. Never throws:
 * the dashboard renders without the card on any failure.
 */
export async function getTodaysReflectionCardData(
  client: { id: string },
  options: { messaging: boolean; day: Date }
): Promise<TodaysReflectionCardData | null> {
  try {
    const reflection = await getTodaysReflection(client.id, options.day);
    const [todaysEntry, trainer] = await Promise.all([
      getPromptEntryForDay(client.id, reflection.date),
      options.messaging && reflection.allowShare ? getTrainerForClient(client.id) : Promise.resolve(null),
    ]);

    return {
      dateKey: toDateKey(reflection.date),
      ref: { reflectionId: reflection.reflectionId, libraryId: reflection.libraryId },
      reflection: {
        kind: reflection.kind,
        text: reflection.text,
        author: reflection.author,
        guidance: reflection.guidance,
        imageUrl: reflection.imageUrl,
      },
      canJournal: reflection.allowJournal,
      canShare: Boolean(trainer),
      trainerName: trainer ? `${trainer.firstName} ${trainer.lastName}`.trim() || null : null,
      todaysEntry: todaysEntry
        ? { visibility: todaysEntry.visibility === "SHARED" ? "SHARED" : "PRIVATE" }
        : null,
    };
  } catch (error) {
    console.error("[reflections] today's reflection card failed:", error);
    return null;
  }
}
