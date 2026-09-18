import { notFound, redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import * as programService from "@/lib/services/program.service";
import { getClientsForTrainer } from "@/lib/services/client.service";
import { ProgramDetailView } from "@/components/programs/program-detail-view";
import { assignAdminProgramAction } from "@/actions/admin-program-actions";
import { PageShell } from "@/components/shared/page-shell";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AdminProgramDetailPage({ params }: Props) {
  await requireSuperAdmin();
  const { id } = await params;

  const program = await programService.getProgramById(id);
  if (!program) notFound();
  if (program.isGlobal) redirect(`/admin/global-programs/${id}/edit`);

  let clients: { id: string; firstName: string; lastName: string }[] = [];
  if (program.trainerId) {
    const linkedClients = await getClientsForTrainer(program.trainerId);
    clients = linkedClients.map((p) => ({
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
    }));
  }

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

  const trainerData = program.trainer as { firstName?: string; lastName?: string } | null;
  const trainerName = trainerData
    ? `${trainerData.firstName ?? ""} ${trainerData.lastName ?? ""}`.trim()
    : "Unknown trainer";

  return (
    <PageShell>
      <ProgramDetailView
        program={program as unknown as Record<string, unknown>}
        isTrainer={false}
        clients={clients}
        sessions={sessions}
        adminMode
        editHref={`/admin/programs/${id}/edit`}
        assignAction={assignAdminProgramAction}
        trainerName={trainerName}
      />
    </PageShell>
  );
}
