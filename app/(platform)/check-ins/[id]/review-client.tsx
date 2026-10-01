"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { PageShell } from "@/components/shared/page-shell";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { toast } from "sonner";
import { addCoachNotesAction, markReviewedAction } from "@/actions/checkin-actions";
import { CheckCircle2, Save, User } from "lucide-react";
import { formatDateTime } from "@/lib/utils/formatting";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Question {
  id: string;
  orderIndex: number;
  questionText: string;
  questionType: string;
}

interface ResponseData {
  id: string;
  submittedAt: string;
  isReviewed: boolean;
  reviewedAt: string | null;
  coachNotes: string;
  clientName: string;
  templateName: string;
  frequency: string;
}

interface Props {
  response: ResponseData;
  questions: Question[];
  answers: Record<string, unknown>;
}

// ─── Answer renderer ──────────────────────────────────────────────────────────

function AnswerDisplay({
  questionType,
  answer,
}: {
  questionType: string;
  answer: unknown;
}) {
  if (answer === undefined || answer === null) {
    return (
      <span className="text-body italic text-muted-foreground">No answer</span>
    );
  }

  if (questionType === "SCALE") {
    const val = Number(answer);
    const pct = ((val - 1) / 9) * 100;
    const color =
      val <= 3 ? "bg-success" : val <= 6 ? "bg-warning" : "bg-danger";

    return (
      <div className="flex items-center gap-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-heading tabular-nums text-primary-foreground">
          {val}
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all ${color}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-caption">out of 10</p>
        </div>
      </div>
    );
  }

  if (questionType === "BOOLEAN") {
    const boolVal = answer === true || answer === "true";
    return (
      <Badge
        className={`text-sm font-semibold border-0 ${
          boolVal
            ? "bg-success-soft text-success-foreground"
            : "bg-danger-soft text-danger-foreground"
        }`}
      >
        {boolVal ? "Yes" : "No"}
      </Badge>
    );
  }

  // TEXT or MULTIPLE_CHOICE
  return (
    <p className="whitespace-pre-wrap text-body text-foreground">
      {String(answer)}
    </p>
  );
}

function frequencyLabel(frequency: string): string {
  const map: Record<string, string> = {
    WEEKLY: "Weekly Check-in",
    BIWEEKLY: "Bi-weekly Check-in",
    MONTHLY: "Monthly Check-in",
  };
  return map[frequency] ?? "Check-in";
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ReviewClient({ response, questions, answers }: Props) {
  const router = useRouter();
  const [notes, setNotes] = useState(response.coachNotes);
  const [savingNotes, setSavingNotes] = useState(false);
  const [markingReviewed, setMarkingReviewed] = useState(false);
  const [isReviewed, setIsReviewed] = useState(response.isReviewed);

  async function handleSaveNotes() {
    if (!notes.trim()) {
      toast.error("Notes cannot be empty");
      return;
    }
    setSavingNotes(true);
    try {
      const result = await addCoachNotesAction(response.id, notes);
      if (result.success) {
        toast.success("Coach notes saved");
        setIsReviewed(true);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } finally {
      setSavingNotes(false);
    }
  }

  async function handleMarkReviewed() {
    setMarkingReviewed(true);
    try {
      const result = await markReviewedAction(response.id);
      if (result.success) {
        toast.success("Marked as reviewed");
        setIsReviewed(true);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } finally {
      setMarkingReviewed(false);
    }
  }

  return (
    <PageShell width="narrow">
      <PageHeader
        title={response.templateName}
        back={{ label: "Back to check-ins", href: "/check-ins" }}
        breadcrumb={[{ label: "Check-ins", href: "/check-ins" }, { label: response.clientName }]}
        meta={
          <>
            <StatusBadge status={response.frequency} label={frequencyLabel(response.frequency)} role="info" dot={false} />
            {isReviewed ? (
              <StatusBadge status="reviewed" label="Reviewed" role="success" />
            ) : (
              <StatusBadge status="needs-review" label="Needs Review" role="warning" />
            )}
            <span className="flex items-center gap-1.5">
              <User className="size-3.5" aria-hidden />
              {response.clientName}
            </span>
            <span>Submitted {formatDateTime(response.submittedAt)}</span>
          </>
        }
      />

      {/* Answers */}
      <SectionCard title="Answers" count={questions.length} contentClassName="px-0 pb-0">
        <ol className="divide-y divide-border border-t border-border">
          {questions.map((q, idx) => (
            <li key={q.id} className="flex flex-col gap-2 px-5 py-4">
              <p className="flex items-start gap-2 text-label text-muted-foreground">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-muted text-caption font-semibold tabular-nums text-foreground ring-1 ring-border">
                  {idx + 1}
                </span>
                {q.questionText}
              </p>
              <div className="pl-7">
                <AnswerDisplay questionType={q.questionType} answer={answers[q.id]} />
              </div>
            </li>
          ))}
        </ol>
      </SectionCard>

      {/* Coach notes */}
      <SectionCard title="Coach Notes">
        <div className="flex flex-col gap-4">
          <Textarea
            aria-label="Coach notes"
            placeholder="Add your notes, observations, or recommendations for the client..."
            rows={5}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <div className="flex flex-wrap items-center justify-end gap-2">
            {!isReviewed && (
              <Button variant="outline" onClick={handleMarkReviewed} disabled={markingReviewed}>
                <CheckCircle2 />
                {markingReviewed ? "Saving..." : "Mark as Reviewed"}
              </Button>
            )}
            <Button onClick={handleSaveNotes} disabled={savingNotes}>
              <Save />
              {savingNotes ? "Saving..." : "Save Notes"}
            </Button>
          </div>
        </div>
      </SectionCard>
    </PageShell>
  );
}
