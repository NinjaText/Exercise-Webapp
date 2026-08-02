import { auth } from "@clerk/nextjs/server";
import { requireRole } from "@/lib/current-user";
import { getExercises } from "@/lib/services/exercise.service";
import { getOrganizationProfile } from "@/actions/organization-actions";
import { ProgramEditor } from "@/components/programs/program-editor";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";

export default async function NewProgramPage() {
  const [user, { orgId: sessionOrgId }, exercises, organizationProfile] = await Promise.all([
    requireRole("TRAINER"),
    auth(),
    getExercises(),
    getOrganizationProfile().catch(() => null),
  ]);
  const organizationOrgId = sessionOrgId ?? user.clerkOrgId ?? undefined;

  return (
    <div>
      <Button variant="ghost" size="sm" asChild className="mb-2">
        <Link href="/programs">
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to Programs
        </Link>
      </Button>
      <PageHeader
        title="Create Program"
        description="Build a new training program from scratch or start from a template."
      />
      <ProgramEditor
        exercises={exercises}
        organizationOrganizationId={organizationOrgId}
        exerciseSourcePreference={organizationProfile?.exerciseSourcePreference}
      />
    </div>
  );
}
