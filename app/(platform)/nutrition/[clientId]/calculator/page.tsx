import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { getClientIdsForTrainer } from "@/lib/services/client.service";
import { prisma } from "@/lib/prisma";
import { getDisplayName } from "@/lib/utils/display-name";
import { ageFromDateOfBirth } from "@/lib/nutrition/macro-calculator";
import { parseStoredCalculatorInputs } from "@/lib/validators/macro-calculator";
import { MacroCalculator } from "@/components/nutrition/macro-calculator";
import { PageShell } from "@/components/shared/page-shell";
import { PageHeader } from "@/components/shared/page-header";

export default async function MacroCalculatorPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const user = await getCurrentUser();

  if (user.role !== "TRAINER") notFound();

  const clientIds = await getClientIdsForTrainer(user.id);
  if (!clientIds.includes(clientId)) notFound();

  const [client, target] = await Promise.all([
    prisma.user.findUnique({
      where: { id: clientId },
      select: { firstName: true, lastName: true, email: true, dateOfBirth: true },
    }),
    prisma.nutritionTarget.findUnique({
      where: { clientId },
      select: { calories: true, proteinG: true, carbsG: true, fatG: true, calculatorInputs: true },
    }),
  ]);
  if (!client) notFound();

  const clientName = getDisplayName(client);
  const clientHref = `/nutrition/${clientId}`;

  return (
    <PageShell>
      <PageHeader
        breadcrumb={[
          { label: "Nutrition", href: "/nutrition" },
          { label: clientName, href: clientHref },
          { label: "Macro calculator" },
        ]}
        back={{ label: `Back to ${clientName}`, href: clientHref }}
        title="Macro calculator"
        description={`Work out ${clientName}'s daily calories and macros, then save them as their nutrition targets.`}
      />

      <MacroCalculator
        clientId={clientId}
        clientName={clientName}
        defaultAge={ageFromDateOfBirth(client.dateOfBirth)}
        savedInputs={parseStoredCalculatorInputs(target?.calculatorInputs)}
        currentTargets={{
          calories: target?.calories ?? null,
          proteinG: target?.proteinG ?? null,
          carbsG: target?.carbsG ?? null,
          fatG: target?.fatG ?? null,
        }}
      />
    </PageShell>
  );
}
