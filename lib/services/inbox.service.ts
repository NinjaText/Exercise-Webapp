import { prisma } from "@/lib/prisma";
import * as messageService from "@/lib/services/message.service";
import * as programService from "@/lib/services/program.service";

/**
 * Everything the trainer Inbox needs to render one selected conversation:
 * the thread itself plus a snapshot of the client's current program so the
 * context panel doesn't need a second round trip. Shared by the Inbox page
 * (initial load) and the thread-switch server action (subsequent loads) so
 * both stay in sync.
 */
export async function getInboxThreadData(trainerId: string, clientId: string) {
  const [messages, [currentProgram]] = await Promise.all([
    messageService.getThread(trainerId, clientId, { includeInternal: true }),
    programService.getProgramsForClient(clientId),
  ]);

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
    program: currentProgram ? { id: currentProgram.id, name: currentProgram.name, status: currentProgram.status } : null,
    stats,
    lastCheckIn,
  };
}

export type InboxThreadData = Awaited<ReturnType<typeof getInboxThreadData>>;
