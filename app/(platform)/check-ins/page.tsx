import Link from "next/link";
import { getCurrentUser } from "@/lib/current-user";
import * as checkinService from "@/lib/services/checkin.service";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/shared/page-shell";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  ClipboardList,
  Plus,
  CheckCircle2,
  Clock,
  MessageSquare,
  Eye,
  AlertCircle,
} from "lucide-react";
import { formatDate, formatDateTime } from "@/lib/utils/formatting";
import { AssignCheckInDialog } from "@/components/check-ins/assign-checkin-dialog";
import { getClientsForTrainer } from "@/lib/services/client.service";

// ─── Frequency label helper ──────────────────────────────────────────────────

function frequencyLabel(frequency: string): string {
  const map: Record<string, string> = {
    WEEKLY: "Weekly",
    BIWEEKLY: "Bi-weekly",
    MONTHLY: "Monthly",
  };
  return map[frequency] ?? frequency;
}

/** A row inside an edge-to-edge SectionCard list. */
const LIST_ROW = "flex items-center gap-4 px-5 py-4";

// ─── Trainer view ──────────────────────────────────────────────────────────

async function TrainerView({ trainerId }: { trainerId: string }) {
  const [templates, responses, clients] = await Promise.all([
    checkinService.getTemplatesForTrainer(trainerId),
    checkinService.getResponsesForTrainer(trainerId),
    getClientsForTrainer(trainerId),
  ]);

  const clientList = clients.map((p) => ({
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
  }));

  const unreviewed = responses.filter((r) => !r.isReviewed).length;

  return (
    <>
      {/* ── Templates section ── */}
      <section aria-labelledby="checkin-templates" className="flex flex-col gap-4">
        <h2 id="checkin-templates" className="text-heading text-foreground">
          Templates
        </h2>

        {templates.length === 0 ? (
          <Card className="py-0">
            <EmptyState
              icon={ClipboardList}
              title="No templates yet"
              description="Create a check-in template to start collecting weekly updates from your clients."
              actionLabel="Create First Template"
              actionHref="/check-ins/new"
            />
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {templates.map((t) => (
              <Card key={t.id} className="gap-0 py-0">
                <CardContent className="flex h-full flex-col gap-4 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-heading text-foreground">{t.name}</p>
                      {t.description && (
                        <p className="mt-1 line-clamp-2 text-body text-muted-foreground">
                          {t.description}
                        </p>
                      )}
                    </div>
                    <StatusBadge
                      status={t.frequency}
                      label={frequencyLabel(t.frequency)}
                      role="neutral"
                      dot={false}
                      size="sm"
                    />
                  </div>

                  <dl className="mt-auto grid grid-cols-3 gap-2 rounded-lg bg-surface-muted px-3 py-2.5">
                    {[
                      ["Questions", t.questionCount],
                      ["Assigned", t.assignmentCount],
                      ["Responses", t.responseCount],
                    ].map(([label, value]) => (
                      <div key={label} className="flex flex-col">
                        <dt className="text-caption">{label}</dt>
                        <dd className="text-label tabular-nums text-foreground">{value}</dd>
                      </div>
                    ))}
                  </dl>

                  <div className="flex items-center gap-2">
                    <AssignCheckInDialog
                      templateId={t.id}
                      templateName={t.name}
                      clients={clientList}
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* ── Recent responses section ── */}
      <SectionCard
        title="Recent Responses"
        icon={MessageSquare}
        count={responses.length > 0 ? responses.length : undefined}
        description={unreviewed > 0 ? `${unreviewed} waiting for your review` : undefined}
        contentClassName="px-0 pb-0"
      >
        {responses.length === 0 ? (
          <EmptyState
            size="compact"
            icon={MessageSquare}
            title="No responses yet"
            description="Client responses will appear here once they complete their check-ins."
          />
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {responses.map((r) => {
              const isUnreviewed = !r.isReviewed;
              return (
                <li key={r.id} className={LIST_ROW}>
                  <div
                    className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${
                      isUnreviewed ? "bg-warning-soft text-warning-foreground" : "bg-success-soft text-success-foreground"
                    }`}
                  >
                    {isUnreviewed ? (
                      <AlertCircle className="size-4" aria-hidden />
                    ) : (
                      <CheckCircle2 className="size-4" aria-hidden />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-label text-foreground">
                      {r.client.firstName} {r.client.lastName}
                    </p>
                    <p className="mt-0.5 truncate text-caption">
                      {r.assignment.template.name} &middot; {formatDateTime(r.submittedAt)}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {isUnreviewed && (
                      <StatusBadge
                        status="needs-review"
                        label="Needs Review"
                        role="warning"
                        size="sm"
                        className="hidden sm:inline-flex"
                      />
                    )}
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/check-ins/${r.id}`}>
                        <Eye />
                        Review
                      </Link>
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
    </>
  );
}

// ─── Client view ────────────────────────────────────────────────────────────

async function ClientView({ clientId }: { clientId: string }) {
  const [pending, allAssignments] = await Promise.all([
    checkinService.getPendingCheckInsForClient(clientId),
    checkinService.getCheckInAssignmentsForClient(clientId),
  ]);

  const pendingIds = new Set(pending.map((p) => p.id));
  const upcoming = allAssignments.filter((a) => !pendingIds.has(a.id));

  return (
    <>
      {/* ── Pending check-ins ── */}
      <SectionCard
        title="Due Check-ins"
        icon={Clock}
        count={pending.length > 0 ? pending.length : undefined}
        contentClassName="px-0 pb-0"
      >
        {pending.length === 0 ? (
          <EmptyState
            size="compact"
            icon={CheckCircle2}
            title="All caught up!"
            description="No check-ins are due right now. Great work staying on track."
          />
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {pending.map((assignment) => (
              <li key={assignment.id} className={`${LIST_ROW} flex-wrap sm:flex-nowrap`}>
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-warning-soft text-warning-foreground">
                  <ClipboardList className="size-4" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-label text-foreground">{assignment.template.name}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <StatusBadge
                      status={assignment.template.frequency}
                      label={frequencyLabel(assignment.template.frequency)}
                      role="neutral"
                      dot={false}
                      size="sm"
                    />
                    <span className="flex items-center gap-1 text-caption text-warning-foreground">
                      <Clock className="size-3" aria-hidden />
                      Due {formatDate(assignment.nextDueDate)}
                    </span>
                  </div>
                </div>
                <Button size="sm" className="w-full shrink-0 sm:w-auto" asChild>
                  <Link href={`/check-ins/${assignment.id}/respond`}>Complete Check-in</Link>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {/* ── All assignments (upcoming) ── */}
      {allAssignments.length > 0 && (
        <SectionCard title="All Check-ins" icon={ClipboardList} contentClassName="px-0 pb-0">
          {upcoming.length === 0 ? (
            <p className="border-t border-border px-5 py-4 text-body text-muted-foreground">
              Every check-in you have is due now.
            </p>
          ) : (
            <ul className="divide-y divide-border border-t border-border">
              {upcoming.map((assignment) => {
                const lastResponse = assignment.responses[0];
                return (
                  <li key={assignment.id} className={LIST_ROW}>
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-muted-foreground">
                      <ClipboardList className="size-4" aria-hidden />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-label text-foreground">{assignment.template.name}</p>
                      <p className="mt-0.5 text-caption">
                        {frequencyLabel(assignment.template.frequency)}
                        {lastResponse && <> &middot; Last submitted {formatDate(lastResponse.submittedAt)}</>}
                        {" "}&middot; Next due {formatDate(assignment.nextDueDate)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
      )}
    </>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function CheckInsPage() {
  const user = await getCurrentUser();
  const isTrainer = user.role === "TRAINER";

  return (
    <PageShell>
      <PageHeader
        title="Check-ins"
        description={
          isTrainer
            ? "Manage weekly check-in templates and review client responses."
            : "Complete your scheduled check-ins and track your progress."
        }
        primaryAction={
          isTrainer ? (
            <Button asChild>
              <Link href="/check-ins/new">
                <Plus />
                New Template
              </Link>
            </Button>
          ) : undefined
        }
      />

      {isTrainer ? <TrainerView trainerId={user.id} /> : <ClientView clientId={user.id} />}
    </PageShell>
  );
}
