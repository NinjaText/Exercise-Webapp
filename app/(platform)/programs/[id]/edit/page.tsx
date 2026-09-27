import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { requireRole } from "@/lib/current-user";
import * as programService from "@/lib/services/program.service";
import { getExercises, getExerciseUsageForTrainer, rankExercisesByUsage } from "@/lib/services/exercise.service";
import { listCollections } from "@/lib/services/collection.service";
import { getOrganizationProfile } from "@/actions/organization-actions";
import { ProgramEditor } from "@/components/programs/program-editor";
import { PageHeader } from "@/components/shared/page-header";
import { PageShell } from "@/components/shared/page-shell";
import { DesktopOnlyNotice } from "@/components/shared/desktop-only-notice";
import { ProgramStructureReadonly } from "@/components/programs/program-structure-readonly";
import { getProgramSchedulingType } from "@/lib/utils/program-scheduling";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditProgramPage({ params }: Props) {
  const { id } = await params;

  const [user, { orgId: sessionOrgId }, program, exercises, organizationProfile] = await Promise.all([
    requireRole("TRAINER"),
    auth(),
    programService.getProgramById(id),
    getExercises(),
    getOrganizationProfile().catch(() => null),
  ]);
  const organizationOrgId = sessionOrgId ?? user.clerkOrgId ?? undefined;

  if (!program || program.trainerId !== user.id) notFound();

  const [usage, collections] = await Promise.all([
    getExerciseUsageForTrainer(user.id),
    listCollections(user.id),
  ]);
  const rankedExercises = rankExercisesByUsage(exercises, usage);

  return (
    <PageShell>
      <PageHeader
        back={{ label: "Back to program", href: `/programs/${id}` }}
        breadcrumb={[
          { label: "Programs", href: "/programs" },
          { label: program.name, href: `/programs/${id}` },
          { label: "Edit" },
        ]}
        title="Edit Program"
        description={`Modify “${program.name}”`}
      />
      <DesktopOnlyNotice />
      {program.workouts.length > 0 && (
        <div className="sm:hidden">
          <ProgramStructureReadonly
            workouts={program.workouts as unknown as Record<string, unknown>[]}
            isResource={getProgramSchedulingType(program) === "ON_DEMAND"}
          />
        </div>
      )}
      <div className="hidden sm:block">
        <ProgramEditor
          program={program as unknown as Record<string, unknown>}
          exercises={rankedExercises}
          organizationOrganizationId={organizationOrgId}
          exerciseSourcePreference={organizationProfile?.exerciseSourcePreference}
          collections={collections}
        />
      </div>
    </PageShell>
  );
}
