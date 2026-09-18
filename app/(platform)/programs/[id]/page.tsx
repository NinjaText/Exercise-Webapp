import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import * as programService from "@/lib/services/program.service";
import { getClientsForTrainer } from "@/lib/services/client.service";
import { PageShell } from "@/components/shared/page-shell";
import { ProgramDetailView } from "@/components/programs/program-detail-view";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ assign?: string; workoutId?: string; clientId?: string }>;
}

export default async function ProgramDetailPage({
  params,
  searchParams,
}: Props) {
  const user = await getCurrentUser();
  const { id } = await params;
  const { assign, workoutId, clientId } = await searchParams;

  const program = await programService.getProgramById(id);
  if (!program) notFound();

  // Authorization: trainer who created it OR assigned client
  if (program.trainerId !== user.id && program.clientId !== user.id) {
    notFound();
  }

  // Load clients for assignment dialog (trainer only)
  let clients: { id: string; firstName: string; lastName: string }[] = [];
  if (user.role === "TRAINER") {
    const linkedClients = await getClientsForTrainer(user.id);
    clients = linkedClients.map((p) => ({
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
    }));
  }

  // Load sessions for workouts in this specific program (template + assigned)
  const workoutIds = (program.workouts ?? []).map((w) => w.id);
  let sessions: Record<string, unknown>[] = [];
  if (workoutIds.length > 0) {
    sessions = (await prisma.workoutSessionV2.findMany({
      where: { workoutId: { in: workoutIds } },
      include: {
        workout: {
          include: {
            program: { select: { id: true, name: true } },
            blocks: {
              include: {
                exercises: {
                  include: {
                    exercise: true,
                    sets: { orderBy: { orderIndex: "asc" } },
                  },
                  orderBy: { orderIndex: "asc" },
                },
              },
              orderBy: { orderIndex: "asc" },
            },
          },
        },
        exerciseLogs: {
          include: { setLogs: { orderBy: { setIndex: "asc" } } },
          orderBy: { orderIndex: "asc" },
        },
        feedback: true,
      },
      orderBy: { scheduledDate: "asc" },
    })) as unknown as Record<string, unknown>[];
  }

  return (
    <PageShell>
      <ProgramDetailView
        program={program as unknown as Record<string, unknown>}
        isTrainer={user.role === "TRAINER"}
        clients={clients}
        sessions={sessions as Record<string, unknown>[]}
        showAssignDialog={assign === "true"}
        initialAssignClientId={clientId}
        initialWorkoutId={workoutId}
      />
    </PageShell>
  );
}
