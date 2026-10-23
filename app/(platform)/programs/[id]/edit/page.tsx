import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { requireRole } from "@/lib/current-user";
import * as programService from "@/lib/services/program.service";
import { getExercises, getExerciseUsageForTrainer, rankExercisesByUsage } from "@/lib/services/exercise.service";
import { listCollections } from "@/lib/services/collection.service";
import { getOrganizationProfile } from "@/actions/organization-actions";
import { ProgramEditor } from "@/components/programs/program-editor";
import { BreadcrumbRegistrar } from "@/components/layout/breadcrumb-context";
import { PageShell } from "@/components/shared/page-shell";
import { FollowAlongEditor } from "@/components/programs/follow-along/follow-along-editor";
import { isFollowAlongProgram } from "@/lib/utils/follow-along";

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

  // Follow-along programs are a list of video days, not exercise blocks —
  // the block builder would show every day as an empty workout.
  if (isFollowAlongProgram(program)) {
    return (
      <PageShell>
        <BreadcrumbRegistrar
          crumbs={[
            { label: "Programs", href: "/programs" },
            { label: program.name, href: `/programs/${id}` },
            { label: "Edit" },
          ]}
        />
        <FollowAlongEditor
          program={{
            id: program.id,
            name: program.name,
            description: program.description,
            clientId: program.clientId,
            startDate: program.startDate,
            durationWeeks: program.durationWeeks,
            workouts: program.workouts.map((w) => ({
              id: w.id,
              name: w.name,
              description: w.description,
              weekIndex: w.weekIndex,
              dayIndex: w.dayIndex,
              videoUrl: w.videoUrl,
              videoDurationSec: w.videoDurationSec,
            })),
          }}
        />
      </PageShell>
    );
  }

  const [usage, collections] = await Promise.all([
    getExerciseUsageForTrainer(user.id),
    listCollections(user.id),
  ]);
  const rankedExercises = rankExercisesByUsage(exercises, usage);

  return (
    <PageShell>
      <BreadcrumbRegistrar
        crumbs={[
          { label: "Programs", href: "/programs" },
          { label: program.name, href: `/programs/${id}` },
          { label: "Edit" },
        ]}
      />
      <ProgramEditor
        title="Edit program"
        backHref={`/programs/${id}`}
        program={program as unknown as Record<string, unknown>}
        exercises={rankedExercises}
        organizationOrganizationId={organizationOrgId}
        exerciseSourcePreference={organizationProfile?.exerciseSourcePreference}
        collections={collections}
      />
    </PageShell>
  );
}
