"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { submitCheckInResponseAction } from "@/actions/checkin-actions";
import { ArrowLeft, Send } from "lucide-react";
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
          className={cn(
            "h-10 w-10 rounded-lg border text-sm font-semibold transition-all",
            value === n
              ? "border-transparent bg-primary text-primary-foreground shadow-none"
              : "border-border bg-muted/40 text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground"
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
          className={cn(
            "min-w-[80px] rounded-lg border px-5 py-2.5 text-sm font-semibold transition-all",
            value === val
              ? "border-transparent bg-primary text-primary-foreground shadow-none"
              : "border-border bg-muted/40 text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground"
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
          className={cn(
            "rounded-lg border px-4 py-2 text-sm font-medium transition-all",
            value === opt
              ? "border-transparent bg-primary text-primary-foreground shadow-none"
              : "border-border bg-muted/40 text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground"
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
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/check-ins">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight">
              {assignment.templateName}
            </h2>
            <Badge className="bg-info-soft text-info-foreground border-0 text-xs">
              {frequencyLabel(assignment.frequency)}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Answer each question as honestly as you can.
          </p>
        </div>
      </div>

      {/* Questions */}
      <div className="space-y-4">
        {questions.map((q, idx) => (
          <Card
            key={q.id}
            className="ring-1 ring-border shadow-none"
          >
            <CardHeader className="pb-3">
              <CardTitle className="flex items-start gap-2 text-base font-semibold leading-snug">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                  {idx + 1}
                </span>
                <span>{q.questionText}</span>
                {q.isRequired && (
                  <span className="ml-auto text-sm font-normal text-destructive shrink-0">
                    *
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {q.questionType === "TEXT" && (
                <Textarea
                  placeholder="Type your answer here..."
                  rows={3}
                  value={(answers[q.id] as string) ?? ""}
                  onChange={(e) => setAnswer(q.id, e.target.value)}
                />
              )}

              {q.questionType === "SCALE" && (
                <div className="space-y-2">
                  <ScaleSelector
                    value={(answers[q.id] as number | null) ?? null}
                    onChange={(v) => setAnswer(q.id, v)}
                  />
                  {answers[q.id] !== undefined && (
                    <p className="text-sm text-muted-foreground">
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
      <div className="flex items-center justify-end gap-3 pb-8">
        <Button variant="outline" asChild>
          <Link href="/check-ins">Cancel</Link>
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={submitting}
          className="gap-2"
        >
          <Send className="h-4 w-4" />
          {submitting ? "Submitting..." : "Submit Check-in"}
        </Button>
      </div>
    </div>
  );
}
