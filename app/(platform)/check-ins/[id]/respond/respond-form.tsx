"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PageShell } from "@/components/shared/page-shell";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { submitCheckInResponseAction } from "@/actions/checkin-actions";
import { Send } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Question {
  id: string;
  orderIndex: number;
  questionText: string;
  questionType: string;
  options: string[];
  isRequired: boolean;
}

interface Props {
  assignment: {
    id: string;
    templateName: string;
    frequency: string;
  };
  questions: Question[];
}

// ─── Scale button row ─────────────────────────────────────────────────────────

function ScaleSelector({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-pressed={value === n}
          className={cn(
            "size-10 rounded-lg border text-label tabular-nums outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none",
            value === n
              ? "border-transparent bg-primary text-primary-foreground shadow-none"
              : "border-input bg-surface text-foreground hover:border-border-strong hover:bg-surface-muted"
          )}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

// ─── Boolean toggle ───────────────────────────────────────────────────────────

function BooleanSelector({
  value,
  onChange,
}: {
  value: boolean | null;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex gap-3">
      {[
        { label: "Yes", val: true },
        { label: "No", val: false },
      ].map(({ label, val }) => (
        <button
          key={label}
          type="button"
          onClick={() => onChange(val)}
          aria-pressed={value === val}
          className={cn(
            "h-10 min-w-20 rounded-lg border px-5 text-label outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none",
            value === val
              ? "border-transparent bg-primary text-primary-foreground shadow-none"
              : "border-input bg-surface text-foreground hover:border-border-strong hover:bg-surface-muted"
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ─── Multiple choice ──────────────────────────────────────────────────────────

function MultipleChoiceSelector({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string | null;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          aria-pressed={value === opt}
          className={cn(
            "min-h-10 rounded-lg border px-4 py-2 text-label outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none",
            value === opt
              ? "border-transparent bg-primary text-primary-foreground shadow-none"
              : "border-input bg-surface text-foreground hover:border-border-strong hover:bg-surface-muted"
          )}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

// ─── Main form component ──────────────────────────────────────────────────────

export function RespondForm({ assignment, questions }: Props) {
  const router = useRouter();

  // answers keyed by question id
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);

  function setAnswer(questionId: string, value: unknown) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }

  function frequencyLabel(frequency: string): string {
    const map: Record<string, string> = {
      WEEKLY: "Weekly Check-in",
      BIWEEKLY: "Bi-weekly Check-in",
      MONTHLY: "Monthly Check-in",
    };
    return map[frequency] ?? "Check-in";
  }

  function validateAnswers(): boolean {
    for (const q of questions) {
      if (!q.isRequired) continue;
      const answer = answers[q.id];
      if (answer === undefined || answer === null || answer === "") {
        toast.error(`Please answer: "${q.questionText}"`);
        return false;
      }
    }
    return true;
  }

  async function handleSubmit() {
    if (!validateAnswers()) return;

    setSubmitting(true);
    try {
      const result = await submitCheckInResponseAction(
        assignment.id,
        answers
      );
      if (result.success) {
        toast.success("Check-in submitted successfully!");
        router.push("/check-ins");
      } else {
        toast.error(result.error);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PageShell width="narrow">
      <PageHeader
        title={assignment.templateName}
        description="Answer each question as honestly as you can."
        back={{ label: "Back to check-ins", href: "/check-ins" }}
        breadcrumb={[{ label: "Check-ins", href: "/check-ins" }, { label: assignment.templateName }]}
        meta={
          <StatusBadge
            status={assignment.frequency}
            label={frequencyLabel(assignment.frequency)}
            role="info"
            dot={false}
          />
        }
      />

      {/* Questions */}
      <div className="flex flex-col gap-4">
        {questions.map((q, idx) => (
          <Card key={q.id}>
            <CardHeader>
              <CardTitle className="flex items-start gap-2 text-heading">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-muted text-caption font-semibold tabular-nums text-foreground ring-1 ring-border">
                  {idx + 1}
                </span>
                <span>{q.questionText}</span>
                {q.isRequired && (
                  <span className="ml-auto shrink-0 text-body font-normal text-danger-foreground">
                    *<span className="sr-only">Required</span>
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {q.questionType === "TEXT" && (
                <Textarea
                  aria-label={q.questionText}
                  placeholder="Type your answer here..."
                  rows={3}
                  value={(answers[q.id] as string) ?? ""}
                  onChange={(e) => setAnswer(q.id, e.target.value)}
                />
              )}

              {q.questionType === "SCALE" && (
                <div className="flex flex-col gap-2">
                  <ScaleSelector
                    value={(answers[q.id] as number | null) ?? null}
                    onChange={(v) => setAnswer(q.id, v)}
                  />
                  {answers[q.id] !== undefined && (
                    <p className="text-body text-muted-foreground">
                      Selected:{" "}
                      <span className="font-semibold text-foreground">
                        {String(answers[q.id])} / 10
                      </span>
                    </p>
                  )}
                </div>
              )}

              {q.questionType === "BOOLEAN" && (
                <BooleanSelector
                  value={
                    answers[q.id] !== undefined
                      ? (answers[q.id] as boolean)
                      : null
                  }
                  onChange={(v) => setAnswer(q.id, v)}
                />
              )}

              {q.questionType === "MULTIPLE_CHOICE" && (
                <MultipleChoiceSelector
                  options={q.options}
                  value={(answers[q.id] as string | null) ?? null}
                  onChange={(v) => setAnswer(q.id, v)}
                />
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Submit */}
      <div className="flex items-center justify-end gap-2 border-t border-border pt-6">
        <Button variant="outline" asChild>
          <Link href="/check-ins">Cancel</Link>
        </Button>
        <Button onClick={handleSubmit} disabled={submitting}>
          <Send />
          {submitting ? "Submitting..." : "Submit Check-in"}
        </Button>
      </div>
    </PageShell>
  );
}
