import { auth } from "@clerk/nextjs/server";
import { requireRole } from "@/lib/current-user";
import { getExercises, getExerciseUsageForTrainer, rankExercisesByUsage } from "@/lib/services/exercise.service";
import { listCollections } from "@/lib/services/collection.service";
import { getOrganizationProfile } from "@/actions/organization-actions";
import { ProgramEditor } from "@/components/programs/program-editor";
import { PageHeader } from "@/components/shared/page-header";
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
      <PageHeader
        back={{ label: "Back to Programs", href: "/programs" }}
        breadcrumb={[{ label: "Programs", href: "/programs" }, { label: "Create Program" }]}
        title="Create Program"
        description="Build a new training program from scratch or start from a template."
      />
      <ProgramEditor
        exercises={rankedExercises}
        organizationOrganizationId={organizationOrgId}
        exerciseSourcePreference={organizationProfile?.exerciseSourcePreference}
        collections={collections}
        assignClientId={clientId}
      />
    </PageShell>
  );
}
