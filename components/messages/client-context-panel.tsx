import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PlanStatusBadge } from "@/components/workout/plan-status-badge";
import { formatRelativeTime } from "@/lib/utils/formatting";
import { getMessageCategory, MESSAGE_CATEGORY_LABEL } from "@/lib/utils/message-category";
import { getDisplayName } from "@/lib/utils/display-name";
import { MessageSquare, Dumbbell, TrendingUp } from "lucide-react";
import type { InboxThreadData } from "@/lib/services/inbox.service";

interface ClientContextPanelProps {
  client: { id: string; firstName: string; lastName: string; email: string };
  data: InboxThreadData;
}

export function ClientContextPanel({ client, data }: ClientContextPanelProps) {
  const { program, stats, lastCheckIn, messages } = data;
  const lastMessage = messages[messages.length - 1];
  const category = lastMessage ? getMessageCategory(lastMessage) : "message";

  const sectionTitle = "mb-3 text-caption font-medium uppercase tracking-wide";

  return (
    <div className="flex h-full flex-col divide-y divide-border overflow-y-auto bg-surface-muted/40">
      {lastMessage && category !== "message" && (
        <section className="p-4">
          <h3 className={sectionTitle}>Context</h3>
          <div className="flex items-start gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface ring-1 ring-border">
              <Dumbbell className="size-4 text-muted-foreground" aria-hidden />
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="text-label text-foreground">
                {MESSAGE_CATEGORY_LABEL[category]}
                {lastMessage.replyToExerciseName ? `: ${lastMessage.replyToExerciseName}` : ""}
              </p>
              {program && (
                <Link href={`/programs/${program.id}`} className="w-fit rounded-sm text-caption text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">
                  View Program
                </Link>
              )}
            </div>
          </div>
        </section>
      )}

      <section className="p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-caption font-medium uppercase tracking-wide">Client Overview</h3>
          <Link href={`/clients/${client.id}`} className="rounded-sm text-caption text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">
            View profile
          </Link>
        </div>
        <p className="mb-3 text-heading text-foreground">{getDisplayName(client)}</p>
        <dl className="flex flex-col gap-2.5 text-body">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Program</dt>
            <dd className="max-w-[60%] truncate text-right font-medium text-foreground">
              {program?.name ?? "None assigned"}
            </dd>
          </div>
          {program && (
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Status</dt>
              <dd><PlanStatusBadge status={program.status} /></dd>
            </div>
          )}
          {stats && (
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Workouts completed</dt>
              <dd className="font-medium tabular-nums text-foreground">
                {stats.completed} / {stats.total} ({stats.percent}%)
              </dd>
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Last Check-in</dt>
            <dd className="font-medium text-foreground">
              {lastCheckIn ? formatRelativeTime(lastCheckIn) : "No sessions yet"}
            </dd>
          </div>
        </dl>
      </section>

      <section className="p-4">
        <h3 className={sectionTitle}>Quick Actions</h3>
        <div className="-mx-2 flex flex-col gap-0.5 pointer-coarse:gap-3">
          <Button variant="ghost" size="sm" className="w-full justify-start" asChild>
            <Link href={`/clients/${client.id}`}>
              <MessageSquare /> Client Profile
            </Link>
          </Button>
          {program && (
            <Button variant="ghost" size="sm" className="w-full justify-start" asChild>
              <Link href={`/programs/${program.id}`}>
                <Dumbbell /> Adjust Program
              </Link>
            </Button>
          )}
          <Button variant="ghost" size="sm" className="w-full justify-start" asChild>
            <Link href={`/clients/${client.id}/progress`}>
              <TrendingUp /> View Progress
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
