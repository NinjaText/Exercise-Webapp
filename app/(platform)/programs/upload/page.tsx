import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getClientsForTrainer } from "@/lib/services/client.service";
import { getExercisesForPicker } from "@/lib/services/exercise.service";
import { getOrganizationProfile } from "@/actions/organization-actions";
import { ProgramBriefUpload } from "@/components/programs/program-brief-upload";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";

export const metadata = {
  title: "Upload Program Brief - Unity Health",
  description: "Upload a program brief file and generate a professional AI program",
};

export default async function ProgramBriefUploadPage() {
  const { userId, orgId: sessionOrgId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { id: true, role: true, clerkOrgId: true },
  });

  if (!user || user.role !== "TRAINER") {
    redirect("/dashboard");
  }

  const organizationOrgId = sessionOrgId ?? user.clerkOrgId ?? undefined;

  const [clients, exercises, organizationProfile] = await Promise.all([
    getClientsForTrainer(user.id),
    getExercisesForPicker(organizationOrgId),
    getOrganizationProfile().catch(() => null),
  ]);

  return (
    <div>
      <Button variant="ghost" size="sm" asChild className="mb-2">
        <Link href="/programs">
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to Programs
        </Link>
      </Button>
      <PageHeader
        title="Upload Program Brief"
        description="Upload a structured brief and let AI generate a full program for review."
      />
      <div className="max-w-3xl mx-auto">
        <ProgramBriefUpload
          clients={clients}
          exercises={exercises}
          organizationOrganizationId={organizationOrgId}
          exerciseSourcePreference={organizationProfile?.exerciseSourcePreference}
        />
      </div>
    </div>
  );
}
