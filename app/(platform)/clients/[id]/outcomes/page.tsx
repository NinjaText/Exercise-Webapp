import { notFound } from "next/navigation";
import { requireRole } from "@/lib/current-user";
import { getAssessments } from "@/lib/services/outcome.service";
import { getClientIdsForTrainer } from "@/lib/services/client.service";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { PageShell } from "@/components/shared/page-shell";
import { SectionCard } from "@/components/shared/section-card";
import { EmptyState } from "@/components/shared/empty-state";
import { ClipboardList } from "lucide-react";
import { formatDate } from "@/lib/utils/formatting";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ClientOutcomesPage({ params }: Props) {
  const { id } = await params;
  const user = await requireRole("TRAINER");
  const clientIds = await getClientIdsForTrainer(user.id);
  if (!clientIds.includes(id)) notFound();

  const client = await prisma.user.findUnique({ where: { id } });
  if (!client) notFound();

  const assessments = await getAssessments(id);

  // Group by type
  const grouped = assessments.reduce<Record<string, typeof assessments>>((acc, a) => {
    const key = a.assessmentType;
    if (!acc[key]) acc[key] = [];
    acc[key].push(a);
    return acc;
  }, {});

  const clientName = `${client.firstName} ${client.lastName}`;

  return (
    <PageShell>
      <PageHeader
        title="Outcomes"
        description={clientName}
        back={{ label: "Back to client", href: `/clients/${id}` }}
        breadcrumb={[
          { label: "Clients", href: "/clients" },
          { label: clientName, href: `/clients/${id}` },
          { label: "Outcomes" },
        ]}
      />

      {assessments.length === 0 ? (
        <Card>
          <EmptyState
            icon={ClipboardList}
            title="No assessments yet"
            description="Recorded outcome measures and assessments for this client will appear here."
          />
        </Card>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          {Object.entries(grouped).map(([type, items]) => (
            <SectionCard
              key={type}
              title={type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
              icon={ClipboardList}
              count={items.length}
            >
              <ul className="divide-y divide-border">
                {items.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="text-label text-foreground tabular-nums">
                        {a.value} {a.unit}
                      </p>
                      {a.notes && <p className="text-caption">{a.notes}</p>}
                    </div>
                    <p className="shrink-0 text-caption tabular-nums">{formatDate(a.createdAt)}</p>
                  </li>
                ))}
              </ul>
            </SectionCard>
          ))}
        </div>
      )}
    </PageShell>
  );
}
