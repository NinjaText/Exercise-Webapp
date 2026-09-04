import type { PlanStatus } from "@prisma/client";
import { getCurrentUser } from "@/lib/current-user";
import * as programService from "@/lib/services/program.service";
import { getCollectionsWithCounts } from "@/lib/services/collection.service";
import { ProgramListClient } from "@/components/programs/program-list-client";
import { PageHeader } from "@/components/shared/page-header";

interface Props {
  searchParams: Promise<{
    search?: string;
    status?: string;
    template?: string;
    tab?: string;
  }>;
}

export default async function ProgramsPage({ searchParams }: Props) {
  const user = await getCurrentUser();
  const params = await searchParams;

  const tab =
    params.tab === "programs"
      ? "programs"
      : "templates";

  const [programs, globalPrograms] = await Promise.all([
    user.role === "TRAINER"
      ? programService.getPrograms(user.id, {
          search: params.search,
          status: params.status as PlanStatus | undefined,
          // "Assigned" = a client is currently running it; "Library" = not
          // yet given to anyone (drafts and reusable templates alike).
          hasClient: tab === "programs",
        })
      : programService.getProgramsForClient(user.id),
    user.role === "TRAINER" ? programService.getGlobalPrograms(user.clerkOrgId ?? undefined, user.id) : Promise.resolve([]),
  ]);

  const collections =
    user.role === "TRAINER" ? await getCollectionsWithCounts(user.id) : [];

  const progressByProgramId =
    user.role === "TRAINER" && tab === "programs"
      ? await programService.getProgramProgressMap(programs.map((p) => p.id))
      : {};

  // For each organization program that came from a global master, check if master has been updated
  const updatableIds = new Set<string>(
    programs
      .filter((p) => {
        if (!p.sourceTemplateId) return false;
        const master = globalPrograms.find((g) => g.id === p.sourceTemplateId);
        if (!master?.globalUpdatedAt) return false;
        return new Date(master.globalUpdatedAt) > new Date(p.createdAt);
      })
      .map((p) => p.id)
  );

  return (
    <div>
      <PageHeader
        title={user.role === "TRAINER" ? "Programs" : "My Programs"}
        description={
          user.role === "TRAINER"
            ? "Build programs in your Library, then assign them to clients."
            : `You have ${programs.length} programs assigned.`
        }
      />
      <ProgramListClient
        programs={programs}
        globalPrograms={globalPrograms}
        updatableIds={[...updatableIds]}
        collections={collections}
        progressByProgramId={progressByProgramId}
        role={user.role}
      />
    </div>
  );
}
