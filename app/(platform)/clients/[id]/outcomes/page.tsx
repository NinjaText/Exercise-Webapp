import { notFound } from "next/navigation";
import Link from "next/link";
import { requireRole } from "@/lib/current-user";
import { getAssessments } from "@/lib/services/outcome.service";
import { getClientIdsForTrainer } from "@/lib/services/client.service";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ArrowLeft, ClipboardList } from "lucide-react";
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

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href={`/clients/${id}`}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Link>
        </Button>
        <PageHeader
          title="Outcomes"
          description={`${client.firstName} ${client.lastName}`}
          className="pb-0"
        />
      </div>

      {assessments.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={ClipboardList}
              title="No assessments yet"
              description="Recorded outcome measures and assessments for this client will appear here."
            />
          </CardContent>
        </Card>
      ) : (
        Object.entries(grouped).map(([type, items]) => (
          <Card key={type}>
            <CardHeader>
              <CardTitle className="text-base capitalize">{type.replace(/_/g, " ")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {items.map((a) => (
                  <div key={a.id} className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                    <div>
                      <p className="text-sm font-medium">
                        {a.value} {a.unit}
                      </p>
                      {a.notes && <p className="text-xs text-muted-foreground">{a.notes}</p>}
                    </div>
                    <p className="text-xs text-muted-foreground/60">{formatDate(a.createdAt)}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
