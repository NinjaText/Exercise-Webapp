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
        back={{ label: "Back to Program", href: `/programs/${id}` }}
        breadcrumb={[
          { label: "Programs", href: "/programs" },
          { label: program.name, href: `/programs/${id}` },
          { label: "Edit" },
        ]}
        title="Edit Program"
        description={`Modify “${program.name}”`}
      />
      <ProgramEditor
        program={program as unknown as Record<string, unknown>}
        exercises={rankedExercises}
        organizationOrganizationId={organizationOrgId}
        exerciseSourcePreference={organizationProfile?.exerciseSourcePreference}
        collections={collections}
      />
    </PageShell>
  );
}
