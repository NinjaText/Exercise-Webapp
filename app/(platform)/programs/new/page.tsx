import { auth } from "@clerk/nextjs/server";
import { requireRole } from "@/lib/current-user";
import { getExercises, getExerciseUsageForTrainer, rankExercisesByUsage } from "@/lib/services/exercise.service";
import { listCollections } from "@/lib/services/collection.service";
import { getOrganizationProfile } from "@/actions/organization-actions";
import { ProgramEditor } from "@/components/programs/program-editor";
import { BreadcrumbRegistrar } from "@/components/layout/breadcrumb-context";
import { PageShell } from "@/components/shared/page-shell";

export default async function NewProgramPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  const { clientId } = await searchParams;
  const [user, { orgId: sessionOrgId }, exercises, organizationProfile] = await Promise.all([
    requireRole("TRAINER"),
    auth(),
    getExercises(),
    getOrganizationProfile().catch(() => null),
  ]);
  const organizationOrgId = sessionOrgId ?? user.clerkOrgId ?? undefined;
  const [usage, collections] = await Promise.all([
    getExerciseUsageForTrainer(user.id),
    listCollections(user.id),
  ]);
  const rankedExercises = rankExercisesByUsage(exercises, usage);

  return (
    <PageShell>
      <BreadcrumbRegistrar crumbs={[{ label: "Programs", href: "/programs" }, { label: "Create Program" }]} />
      <ProgramEditor
        title="New program"
        backHref="/programs"
        exercises={rankedExercises}
        organizationOrganizationId={organizationOrgId}
        exerciseSourcePreference={organizationProfile?.exerciseSourcePreference}
        collections={collections}
        assignClientId={clientId}
      />
    </PageShell>
  );
}
