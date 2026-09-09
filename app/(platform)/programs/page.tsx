import type { PlanStatus } from "@prisma/client";
import { getCurrentUser } from "@/lib/current-user";
import * as programService from "@/lib/services/program.service";
import { computeProgramWeek } from "@/lib/services/dashboard-insights.service";
import { getCollectionsWithCounts } from "@/lib/services/collection.service";
import { ProgramListClient } from "@/components/programs/program-list-client";
import {
  ClientProgramsView,
  type ClientProgramsTab,
} from "@/components/programs/client-programs-view";
import { PageHeader } from "@/components/shared/page-header";
import { getProgramSchedulingType } from "@/lib/utils/program-scheduling";

interface Props {
  searchParams: Promise<{
    search?: string;
    status?: string;
    template?: string;
    tab?: string;
    /**
     * Scheduled vs. Resources. For a trainer it's the pill filter applied
     * client-side in ProgramListClient; for a client it picks the opening tab
     * of ClientProgramsView (the dashboard links in with ?type=resources).
     */
    type?: string;
  }>;
}

// `?status=` is shared with the Assigned tab's summary cards, which also use
// the derived value "STARTING_SOON" — not a real PlanStatus. Only forward the
// param to the query when it actually names one, so a card link can't produce
// an invalid `where` clause.
const PLAN_STATUSES = ["DRAFT", "ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"] as const;

function toPlanStatus(value: string | undefined): PlanStatus | undefined {
  return (PLAN_STATUSES as readonly string[]).includes(value ?? "")
    ? (value as PlanStatus)
    : undefined;
}

export default async function ProgramsPage({ searchParams }: Props) {
  const user = await getCurrentUser();
  const params = await searchParams;

  // Clients get their own card-based view; the trainer path below keeps the
  // dense table, filters and collections that ProgramListClient owns.
  if (user.role !== "TRAINER") {
    return <ClientProgramsPage clientId={user.id} initialTab={toClientTab(params.type)} />;
  }

  const tab =
    params.tab === "programs"
      ? "programs"
      : "templates";

  const [programs, globalPrograms, collections] = await Promise.all([
    programService.getPrograms(user.id, {
      search: params.search,
      // The Assigned tab filters by its own derived status client-side.
      status: tab === "programs" ? undefined : toPlanStatus(params.status),
      // "Assigned" = a client is currently running it; "Library" = not
      // yet given to anyone (drafts and reusable templates alike).
      hasClient: tab === "programs",
    }),
    programService.getGlobalPrograms(user.clerkOrgId ?? undefined, user.id),
    getCollectionsWithCounts(user.id),
  ]);

  const isAssignedTab = tab === "programs";

  // Progress drives the Scheduled rows' progress bar; usage drives the
  // "Used N times / Last used" column that replaces it for Resources.
  const [progressByProgramId, usageByProgramId] = await Promise.all([
    isAssignedTab
      ? programService.getProgramProgressMap(programs.map((p) => p.id))
      : Promise.resolve({}),
    isAssignedTab
      ? programService.getProgramUsageMap(
          programs
            .filter((p) => getProgramSchedulingType(p) === "ON_DEMAND")
            .map((p) => p.id)
        )
      : Promise.resolve({}),
  ]);

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
        title="Programs"
        description="Build programs in your Library, then assign them to clients."
      />
      <ProgramListClient
        programs={programs}
        globalPrograms={globalPrograms}
        updatableIds={[...updatableIds]}
        collections={collections}
        progressByProgramId={progressByProgramId}
        usageByProgramId={usageByProgramId}
      />
    </div>
  );
}

function toClientTab(value: string | undefined): ClientProgramsTab {
  return value === "resources" ? "resources" : "programs";
}

/**
 * Client-role branch of /programs. Split into its own async component so the
 * trainer path above isn't threaded with `role !== "TRAINER"` conditionals —
 * the same page-level role split app/(platform)/dashboard/page.tsx uses.
 */
async function ClientProgramsPage({
  clientId,
  initialTab,
}: {
  clientId: string;
  initialTab: ClientProgramsTab;
}) {
  const assignedPrograms = await programService.getProgramsForClient(clientId);
  const progressByProgramId = await programService.getProgramProgressMap(
    assignedPrograms.map((p) => p.id)
  );

  const now = new Date();
  const programs = assignedPrograms.map((program) => ({
    id: program.id,
    name: program.name,
    description: program.description,
    status: program.status as string,
    schedulingType: program.schedulingType as string | null,
    startDate: program.startDate,
    durationWeeks: program.durationWeeks,
    tags: program.tags,
    activities: program.activities,
    goals: program.goals,
    bodyAreas: program.bodyAreas,
    workouts: program.workouts,
    _count: program._count,
    week: computeProgramWeek(
      {
        id: program.id,
        name: program.name,
        startDate: program.startDate,
        durationWeeks: program.durationWeeks,
      },
      now
    ),
  }));

  const scheduledCount = programs.filter(
    (p) => getProgramSchedulingType(p) === "SCHEDULED"
  ).length;

  return (
    <div>
      <PageHeader
        title="My Programs"
        description={`You have ${scheduledCount} ${
          scheduledCount === 1 ? "program" : "programs"
        } assigned.`}
      />
      <ClientProgramsView
        programs={programs}
        progressByProgramId={progressByProgramId}
        initialTab={initialTab}
      />
    </div>
  );
}
