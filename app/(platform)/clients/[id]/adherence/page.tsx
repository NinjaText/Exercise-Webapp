import { notFound } from "next/navigation";
import Link from "next/link";
import { requireRole } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { getClientIdsForTrainer } from "@/lib/services/client.service";
import { getClientPastSessions, computeAdherenceStats } from "@/lib/services/session.service";
import { Progress } from "@/components/ui/progress";
import { StatCard } from "@/components/shared/stat-card";
import { SectionCard } from "@/components/shared/section-card";
import { PageHeader } from "@/components/shared/page-header";
import { PageShell } from "@/components/shared/page-shell";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { Target, CheckCircle2, XCircle, Gauge, ClipboardList } from "lucide-react";
import { format } from "date-fns";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ClientAdherencePage({ params }: Props) {
  const { id } = await params;
  const user = await requireRole("TRAINER");
  const clientIds = await getClientIdsForTrainer(user.id);
  if (!clientIds.includes(id)) notFound();

  const client = await prisma.user.findUnique({ where: { id } });
  if (!client) notFound();

  const sessions = await getClientPastSessions(id);
  const { total, completed, missed, skipped, completionRate, avgRPE } =
    computeAdherenceStats(sessions);

  const clientName = `${client.firstName} ${client.lastName}`;

  return (
    <PageShell>
      <PageHeader
        title="Sessions"
        description={clientName}
        back={{ label: "Back to client", href: `/clients/${id}` }}
        breadcrumb={[
          { label: "Clients", href: "/clients" },
          { label: clientName, href: `/clients/${id}` },
          { label: "Sessions" },
        ]}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Completion rate"
          value={`${completionRate}%`}
          icon={Target}
          role={completionRate >= 70 ? "success" : completionRate >= 40 ? "warning" : "danger"}
        />
        <StatCard label="Completed" value={completed} icon={CheckCircle2} role="success" />
        <StatCard
          label="Missed / skipped"
          value={missed + skipped}
          icon={XCircle}
          role={missed + skipped > 0 ? "warning" : "neutral"}
        />
        <StatCard label="Avg RPE" value={avgRPE != null ? `${avgRPE}/10` : "—"} icon={Gauge} />
      </div>

      <SectionCard title="Overall completion" icon={Target}>
        <Progress value={completionRate} className="h-2" />
        <p className="mt-3 text-body text-muted-foreground tabular-nums">
          {completed} of {total} sessions completed
        </p>
      </SectionCard>

      <SectionCard
        title="Session history"
        icon={ClipboardList}
        count={sessions.length}
        description="Select a session to review it."
      >
        {sessions.length === 0 ? (
          <EmptyState
            size="compact"
            icon={ClipboardList}
            title="No sessions yet"
            description="Sessions will appear here once this client has scheduled or completed workouts."
          />
        ) : (
          <div className="space-y-2">
            {sessions.map((session) => (
              <Link
                key={session.id}
                href={`/clients/${id}/sessions/${session.id}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 transition-colors outline-none hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
              >
                <div className="min-w-0">
                  <p className="truncate text-label text-foreground">{session.workout.name}</p>
                  <p className="text-caption">
                    {format(new Date(session.scheduledDate), "MMM d, yyyy")}
                    {session.workout.program?.name && <span> · {session.workout.program.name}</span>}
                  </p>
                  {session.originalScheduledDate && (
                    <p className="mt-0.5 text-caption">
                      Rescheduled from {format(new Date(session.originalScheduledDate), "MMM d, yyyy")}
                      {session.rescheduledBy && ` by ${session.rescheduledBy}`}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {session.overallRPE != null && (
                    <span className="text-caption tabular-nums">RPE {session.overallRPE}/10</span>
                  )}
                  {session.scheduleVariance && (
                    <StatusBadge status={session.scheduleVariance} size="sm" dot={false} />
                  )}
                  <StatusBadge status={session.status} size="sm" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </SectionCard>
    </PageShell>
  );
}
