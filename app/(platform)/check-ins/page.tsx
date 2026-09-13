import Link from "next/link";
import { getCurrentUser } from "@/lib/current-user";
import * as checkinService from "@/lib/services/checkin.service";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

  return (
    <div className="space-y-8">
      {/* ── Templates section ── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Templates</h3>
          <Button
            size="sm"
            className="gap-2 bg-linear-to-r from-blue-500 to-indigo-500 border-0 text-white shadow-md shadow-blue-500/20 hover:from-blue-600 hover:to-indigo-600"
            asChild
          >
            <Link href="/check-ins/new">
              <Plus className="h-4 w-4" />
              New Template
            </Link>
          </Button>
        </div>

        {templates.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-12 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
              <ClipboardList className="h-7 w-7 text-muted-foreground/50" />
            </div>
            <h3 className="mt-4 text-base font-semibold">No templates yet</h3>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
              Create a check-in template to start collecting weekly updates from
              your clients.
            </p>
            <Button
              size="sm"
              className="mt-4 gap-2 bg-linear-to-r from-blue-500 to-indigo-500 border-0 text-white shadow-md shadow-blue-500/20 hover:from-blue-600 hover:to-indigo-600"
              asChild
            >
              <Link href="/check-ins/new">
                <Plus className="h-4 w-4" />
                Create First Template
              </Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((t) => (
              <Card
                key={t.id}
                className="group border-0 shadow-sm ring-1 ring-border/50 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:ring-border"
              >
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold leading-tight">
                        {t.name}
                      </p>
                      {t.description && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {t.description}
                        </p>
                      )}
                    </div>
                    <Badge
                      variant="outline"
                      className="shrink-0 border-border/60 text-[10px] text-muted-foreground"
                    >
                      {frequencyLabel(t.frequency)}
                    </Badge>
                  </div>

                  <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
                    <span>{t.questionCount} questions</span>
                    <span>{t.assignmentCount} assigned</span>
                    <span>{t.responseCount} responses</span>
                  </div>

                  <div className="mt-4 flex items-center gap-2">
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
      <section className="space-y-4">
        <h3 className="text-lg font-semibold">Recent Responses</h3>

        {responses.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-12 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
              <MessageSquare className="h-7 w-7 text-muted-foreground/50" />
            </div>
            <h3 className="mt-4 text-base font-semibold">
              No responses yet
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Client responses will appear here once they complete their
              check-ins.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {responses.map((r) => {
              const isUnreviewed = !r.isReviewed;
              return (
                <Card
                  key={r.id}
                  className={`group relative border-0 shadow-sm ring-1 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:ring-border ${
                    isUnreviewed
                      ? "ring-amber-400/60 bg-amber-50/30 dark:bg-amber-950/10"
                      : "ring-border/50"
                  }`}
                >
                  <CardContent className="flex items-center gap-4 px-5 py-4">
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                        isUnreviewed
                          ? "bg-amber-100 dark:bg-amber-900/30"
                          : "bg-muted"
                      }`}
                    >
                      {isUnreviewed ? (
                        <AlertCircle className="h-4.5 w-4.5 text-amber-500" />
                      ) : (
                        <CheckCircle2 className="h-4.5 w-4.5 text-emerald-500" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="font-semibold leading-tight">
                        {r.client.firstName} {r.client.lastName}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {r.assignment.template.name} &middot;{" "}
                        {formatDateTime(r.submittedAt)}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {isUnreviewed && (
                        <Badge
                          variant="outline"
                          className="border-amber-400/60 text-[10px] text-amber-600 dark:text-amber-400"
                        >
                          Needs Review
                        </Badge>
                      )}
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/check-ins/${r.id}`}>
                          <Eye className="h-4 w-4" />
                          Review
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Client view ────────────────────────────────────────────────────────────

async function ClientView({ clientId }: { clientId: string }) {
  const [pending, allAssignments] = await Promise.all([
    checkinService.getPendingCheckInsForClient(clientId),
    checkinService.getCheckInAssignmentsForClient(clientId),
  ]);

  const pendingIds = new Set(pending.map((p) => p.id));

  return (
    <div className="space-y-8">
      {/* ── Pending check-ins ── */}
      <section className="space-y-4">
        <h3 className="text-lg font-semibold">
          Due Check-ins
          {pending.length > 0 && (
            <Badge className="ml-2 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-0 text-xs">
              {pending.length}
            </Badge>
          )}
        </h3>

        {pending.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-12 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
              <CheckCircle2 className="h-7 w-7 text-emerald-500/60" />
            </div>
            <h3 className="mt-4 text-base font-semibold">
              All caught up!
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              No check-ins are due right now. Great work staying on track.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {pending.map((assignment) => (
              <Card
                key={assignment.id}
                className="group border-0 shadow-sm ring-1 ring-amber-400/60 bg-amber-50/30 dark:bg-amber-950/10 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
              >
                <CardContent className="flex items-center gap-4 px-5 py-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/30">
                    <ClipboardList className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold leading-tight">
                      {assignment.template.name}
                    </p>
                    <div className="mt-0.5 flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className="border-border/60 text-[10px] text-muted-foreground"
                      >
                        {frequencyLabel(assignment.template.frequency)}
                      </Badge>
                      <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                        <Clock className="h-3 w-3" />
                        Due {formatDate(assignment.nextDueDate)}
                      </span>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="shrink-0 gap-2 bg-linear-to-r from-blue-500 to-indigo-500 border-0 text-white shadow-md shadow-blue-500/20 hover:from-blue-600 hover:to-indigo-600"
                    asChild
                  >
                    <Link href={`/check-ins/${assignment.id}/respond`}>
                      Complete Check-in
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* ── All assignments (upcoming) ── */}
      {allAssignments.length > 0 && (
        <section className="space-y-4">
          <h3 className="text-lg font-semibold">All Check-ins</h3>
          <div className="space-y-2">
            {allAssignments
              .filter((a) => !pendingIds.has(a.id))
              .map((assignment) => {
                const lastResponse = assignment.responses[0];
                return (
                  <Card
                    key={assignment.id}
                    className="group border-0 shadow-sm ring-1 ring-border/50 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:ring-border"
                  >
                    <CardContent className="flex items-center gap-4 px-5 py-4">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted">
                        <ClipboardList className="h-4.5 w-4.5 text-muted-foreground/60" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold leading-tight">
                          {assignment.template.name}
                        </p>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                          <span>
                            {frequencyLabel(assignment.template.frequency)}
                          </span>
                          {lastResponse && (
                            <span>
                              &middot; Last submitted{" "}
                              {formatDate(lastResponse.submittedAt)}
                            </span>
                          )}
                          <span>
                            &middot; Next due{" "}
                            {formatDate(assignment.nextDueDate)}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
          </div>
        </section>
      )}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function CheckInsPage() {
  const user = await getCurrentUser();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold tracking-tight">Check-ins</h2>
          <p className="text-muted-foreground">
            {user.role === "TRAINER"
              ? "Manage weekly check-in templates and review client responses."
              : "Complete your scheduled check-ins and track your progress."}
          </p>
        </div>
        {user.role === "TRAINER" && (
          <Button
            className="gap-2 bg-linear-to-r from-blue-500 to-indigo-500 border-0 text-white shadow-md shadow-blue-500/20 hover:from-blue-600 hover:to-indigo-600"
            asChild
          >
            <Link href="/check-ins/new">
              <Plus className="h-4 w-4" />
              New Template
            </Link>
          </Button>
        )}
      </div>

      {user.role === "TRAINER" ? (
        <TrainerView trainerId={user.id} />
      ) : (
        <ClientView clientId={user.id} />
      )}
    </div>
  );
}
