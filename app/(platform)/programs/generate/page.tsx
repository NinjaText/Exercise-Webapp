import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { GenerateProgramForm } from "@/components/programs/generate-program-form";
import type { ClientSummary } from "@/components/programs/client-details-panel";
import { PageHeader } from "@/components/shared/page-header";
import { PageShell } from "@/components/shared/page-shell";

export const maxDuration = 120; // parallel per-week LLM calls can take up to ~30s; 120s gives headroom for larger programs

export const metadata = {
  title: "Generate AI Program - Unity Health",
  description: "Generate a personalized program using AI",
};

export default async function GenerateProgramPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  const { userId } = await auth();

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

  const { clientId } = await searchParams;

  // Fetch clients for this trainer's organization with the full clinical profile
  // rendered by the form's Client Details side panel.
  const rawClients = user.clerkOrgId
    ? await prisma.user.findMany({
    where: {
      role: 'CLIENT',
      clerkOrgId: user.clerkOrgId,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      clientProfile: {
        select: {
          primaryDiagnosis: true,
          secondaryDiagnoses: true,
          painScore: true,
          limitations: true,
          comorbidities: true,
          functionalChallenges: true,
          activityLevel: true,
          priorInjuries: true,
          surgeryHistory: true,
          occupation: true,
          fitnessGoals: true,
          injuryDate: true,
          availableEquipment: true,
        },
      },
    },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  })
    : []

  const clients: ClientSummary[] = rawClients.map(p => ({
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    primaryDiagnosis: p.clientProfile?.primaryDiagnosis ?? null,
    secondaryDiagnoses: p.clientProfile?.secondaryDiagnoses ?? [],
    painScore: p.clientProfile?.painScore ?? null,
    limitations: p.clientProfile?.limitations ?? null,
    comorbidities: p.clientProfile?.comorbidities ?? null,
    functionalChallenges: p.clientProfile?.functionalChallenges ?? null,
    activityLevel: p.clientProfile?.activityLevel ?? null,
    priorInjuries: p.clientProfile?.priorInjuries ?? [],
    surgeryHistory: p.clientProfile?.surgeryHistory ?? null,
    occupation: p.clientProfile?.occupation ?? null,
    fitnessGoals: p.clientProfile?.fitnessGoals ?? [],
    // Serialised here so the client component never receives a Date instance.
    injuryDate: p.clientProfile?.injuryDate?.toISOString() ?? null,
    availableEquipment: p.clientProfile?.availableEquipment ?? [],
  }))

  return (
    <PageShell width="default">
      <PageHeader
        back={{ label: "Back to Programs", href: "/programs" }}
        breadcrumb={[{ label: "Programs", href: "/programs" }, { label: "Generate Program" }]}
        title="Generate Program"
        description="Use AI to create a personalised program for a client."
      />

      {/* The shell gives room for the two-column layout; the form still
          self-centers narrower (max-w-2xl) when no client panel is shown. */}
      <GenerateProgramForm clients={clients} initialClientId={clientId} />
    </PageShell>
  );
}
