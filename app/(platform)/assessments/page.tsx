import Link from "next/link";
import { getCurrentUser } from "@/lib/current-user";
import { getAssessments } from "@/lib/services/outcome.service";
import { getClientIdsForTrainer } from "@/lib/services/client.service";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, BarChart3, TrendingUp } from "lucide-react";
import { formatDate } from "@/lib/utils/formatting";
import { PageHeader } from "@/components/shared/page-header";
import { PageShell } from "@/components/shared/page-shell";
import { EmptyState } from "@/components/shared/empty-state";
import { DataList, type Column } from "@/components/shared/data-list";

function formatAssessmentType(type: string) {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** A row from either query below: the service's assessment record, plus the
 *  client's name when a trainer lists across their clients. */
type AssessmentRow = Omit<Awaited<ReturnType<typeof getAssessments>>[number], "assessedByUser"> & {
  client?: { firstName: string; lastName: string } | null;
};

function buildColumns(showClient: boolean): Column<AssessmentRow>[] {
  return [
    {
      key: "type",
      header: "Assessment",
      render: (a) => (
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-foreground">
            <TrendingUp className="size-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="truncate text-label text-foreground">{formatAssessmentType(a.assessmentType)}</p>
            {a.notes && <p className="max-w-md truncate text-caption">{a.notes}</p>}
          </div>
        </div>
      ),
    },
    ...(showClient
      ? [
          {
            key: "client",
            header: "Client",
            render: (a: AssessmentRow) =>
              a.client ? `${a.client.firstName} ${a.client.lastName}` : "—",
          },
        ]
      : []),
    {
      key: "value",
      header: "Value",
      align: "right",
      render: (a) => (
        <span className="font-medium text-foreground">
          {a.value}
          {a.unit && <span className="ml-1 font-normal text-muted-foreground">{a.unit}</span>}
        </span>
      ),
    },
    {
      key: "date",
      header: "Recorded",
      align: "right",
      className: "text-muted-foreground",
      render: (a) => formatDate(a.createdAt),
    },
  ];
}

export default async function AssessmentsPage() {
  const user = await getCurrentUser();

  let assessments: AssessmentRow[];
  if (user.role === "TRAINER") {
    const clientIds = await getClientIdsForTrainer(user.id);
    assessments = await prisma.assessment.findMany({
      where: { clientId: { in: clientIds } },
      include: {
        client: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  } else {
    assessments = await getAssessments(user.id);
  }

  return (
    <PageShell>
      <PageHeader
        title="Assessments"
        description={
          assessments.length > 0
            ? `${assessments.length} measurement${assessments.length !== 1 ? "s" : ""} recorded`
            : "Track measurements and outcomes over time"
        }
        primaryAction={
          <Button asChild>
            <Link href="/assessments/new">
              <Plus className="size-4" />
              New Assessment
            </Link>
          </Button>
        }
      />

      {assessments.length === 0 ? (
        <Card>
          <EmptyState
            icon={BarChart3}
            title="No assessments yet"
            description="Record measurements over time to track client progress and outcomes."
            actionLabel="Record First Assessment"
            actionHref="/assessments/new"
          />
        </Card>
      ) : (
        <DataList
          columns={buildColumns(user.role === "TRAINER")}
          data={assessments}
          keyExtractor={(a) => a.id}
        />
      )}
    </PageShell>
  );
}
