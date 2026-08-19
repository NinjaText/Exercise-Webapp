import { notFound } from "next/navigation";
import Link from "next/link";
import { requireRole } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { getClientIdsForTrainer } from "@/lib/services/client.service";
import { getClientPastSessions, computeAdherenceStats } from "@/lib/services/session.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { StatCard } from "@/components/shared/stat-card";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ArrowLeft, Target, CheckCircle2, XCircle, Gauge, ClipboardList } from "lucide-react";
import { format } from "date-fns";

interface Props {
  params: Promise<{ id: string }>;
}

const statusColors: Record<string, string> = {
  COMPLETED:   "bg-success/10 text-success",
  IN_PROGRESS: "bg-amber-100 text-amber-700",
  SCHEDULED:   "bg-blue-100 text-blue-700",
  MISSED:      "bg-red-100 text-red-700",
  SKIPPED:     "bg-muted text-muted-foreground",
};

const varianceColors: Record<string, string> = {
  ON_TIME: "bg-success/10 text-success",
  EARLY:   "bg-blue-100 text-blue-700",
  DELAYED: "bg-amber-100 text-amber-700",
};

const varianceLabels: Record<string, string> = {
  ON_TIME: "On Time",
  EARLY:   "Early",
  DELAYED: "Delayed",
};

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
          title="Sessions"
          description={`${client.firstName} ${client.lastName}`}
          className="pb-0"
        />
      </div>

      {/* Stats */}
      <div className="grid gap-6 sm:grid-cols-4">
        <StatCard label="Completion Rate" value={`${completionRate}%`} icon={Target} />
        <StatCard label="Completed" value={completed} icon={CheckCircle2} />
        <StatCard label="Missed / Skipped" value={missed + skipped} icon={XCircle} />
        <StatCard
          label="Avg RPE"
          value={avgRPE != null ? `${avgRPE}/10` : "—"}
          icon={Gauge}
        />
      </div>

      {/* Completion bar */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Overall Completion</CardTitle>
        </CardHeader>
        <CardContent>
          <Progress value={completionRate} className="h-3" />
          <p className="mt-2 text-sm text-muted-foreground">
            {completed} of {total} sessions completed
          </p>
        </CardContent>
      </Card>

      {/* Session history */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sessions — click any row to review</CardTitle>
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <EmptyState
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
                  className="flex items-center justify-between rounded-lg border border-border p-3 transition-colors hover:bg-muted/50"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">
                      {session.workout.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(session.scheduledDate), "MMM d, yyyy")}
                      {session.workout.program?.name && (
                        <span className="ml-2 opacity-60">· {session.workout.program.name}</span>
                      )}
                    </p>
                    {session.originalScheduledDate && (
                      <p className="text-xs text-muted-foreground/70 mt-0.5">
                        Rescheduled from {format(new Date(session.originalScheduledDate), "MMM d, yyyy")}
                        {session.rescheduledBy && ` by ${session.rescheduledBy}`}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    {session.overallRPE != null && (
                      <span className="text-xs text-muted-foreground">RPE {session.overallRPE}/10</span>
                    )}
                    {session.scheduleVariance && (
                      <Badge
                        className={`border-0 text-xs font-medium ${varianceColors[session.scheduleVariance] ?? "bg-muted text-muted-foreground"}`}
                      >
                        {varianceLabels[session.scheduleVariance] ?? session.scheduleVariance}
                      </Badge>
                    )}
                    <Badge
                      className={`border-0 text-xs font-medium ${statusColors[session.status] ?? "bg-muted text-muted-foreground"}`}
                    >
                      {session.status.charAt(0) + session.status.slice(1).toLowerCase()}
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
