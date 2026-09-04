import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PlanStatusBadge } from "@/components/workout/plan-status-badge";
import { formatRelativeTime } from "@/lib/utils/formatting";
import { getMessageCategory, MESSAGE_CATEGORY_LABEL } from "@/lib/utils/message-category";
import { MessageSquare, Dumbbell, TrendingUp } from "lucide-react";
import type { InboxThreadData } from "@/lib/services/inbox.service";

interface ClientContextPanelProps {
  client: { id: string; firstName: string; lastName: string };
  data: InboxThreadData;
}

export function ClientContextPanel({ client, data }: ClientContextPanelProps) {
  const { program, stats, lastCheckIn, messages } = data;
  const lastMessage = messages[messages.length - 1];
  const category = lastMessage ? getMessageCategory(lastMessage) : "message";

  return (
    <div className="h-full space-y-4 overflow-y-auto p-4">
      {lastMessage && category !== "message" && (
        <section className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Context</h3>
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
              <Dumbbell className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                {MESSAGE_CATEGORY_LABEL[category]}
                {lastMessage.replyToExerciseName ? `: ${lastMessage.replyToExerciseName}` : ""}
              </p>
              {program && (
                <Link href={`/programs/${program.id}`} className="text-xs text-primary hover:underline">
                  View Program
                </Link>
              )}
            </div>
          </div>
        </section>
      )}

      <section className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Client Overview</h3>
          <Link href={`/clients/${client.id}`} className="text-xs text-primary hover:underline">
            View profile
          </Link>
        </div>
        <p className="mb-3 text-sm font-semibold text-foreground">
          {client.firstName} {client.lastName}
        </p>
        <dl className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Program</dt>
            <dd className="max-w-[60%] truncate text-right font-medium text-foreground">
              {program?.name ?? "None assigned"}
            </dd>
          </div>
          {program && (
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Status</dt>
              <dd><PlanStatusBadge status={program.status} /></dd>
            </div>
          )}
          {stats && (
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Workouts Completed</dt>
              <dd className="font-medium text-foreground">
                {stats.completed} / {stats.total} ({stats.percent}%)
              </dd>
            </div>
          )}
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Last Check-in</dt>
            <dd className="font-medium text-foreground">
              {lastCheckIn ? formatRelativeTime(lastCheckIn) : "No sessions yet"}
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quick Actions</h3>
        <div className="space-y-1">
          <Link href={`/clients/${client.id}`}>
            <Button variant="ghost" size="sm" className="w-full justify-start gap-2 px-2">
              <MessageSquare className="h-4 w-4" /> Client Profile
            </Button>
          </Link>
          {program && (
            <Link href={`/programs/${program.id}`}>
              <Button variant="ghost" size="sm" className="w-full justify-start gap-2 px-2">
                <Dumbbell className="h-4 w-4" /> Adjust Program
              </Button>
            </Link>
          )}
          <Link href={`/clients/${client.id}/progress`}>
            <Button variant="ghost" size="sm" className="w-full justify-start gap-2 px-2">
              <TrendingUp className="h-4 w-4" /> View Progress
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
