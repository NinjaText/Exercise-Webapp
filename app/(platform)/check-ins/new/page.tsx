"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { PageShell } from "@/components/shared/page-shell";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { FormField } from "@/components/shared/form-section";
import { StatusBadge } from "@/components/shared/status-badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { createCheckInTemplateAction } from "@/actions/checkin-actions";
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Sparkles,
} from "lucide-react";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

type QuestionType = "TEXT" | "SCALE" | "BOOLEAN" | "MULTIPLE_CHOICE";
type Frequency = "WEEKLY" | "BIWEEKLY" | "MONTHLY";

interface QuestionDraft {
  id: string; // local UI key only
  questionText: string;
  questionType: QuestionType;
  options: string[];
  isRequired: boolean;
}

// ─── Pre-built suggestions ────────────────────────────────────────────────────

interface Suggestion {
  questionText: string;
  questionType: QuestionType;
  options?: string[];
}

const SUGGESTIONS: Suggestion[] = [
  {
    questionText: "How is your overall pain level? (1-10)",
    questionType: "SCALE",
  },
  {
    questionText: "How did you feel during your exercises this week?",
    questionType: "TEXT",
  },
  {
    questionText: "Did you complete all your sessions?",
    questionType: "BOOLEAN",
  },
  {
    questionText: "Are you experiencing any new symptoms?",
    questionType: "BOOLEAN",
  },
  {
    questionText: "How is your sleep quality? (1-10)",
    questionType: "SCALE",
  },
  {
    questionText: "Energy levels this week? (1-10)",
    questionType: "SCALE",
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function questionTypeLabel(type: QuestionType): string {
  const map: Record<QuestionType, string> = {
    TEXT: "Text Answer",
    SCALE: "1-10 Scale",
    BOOLEAN: "Yes / No",
    MULTIPLE_CHOICE: "Multiple Choice",
  };
  return map[type];
}

function emptyQuestion(): QuestionDraft {
  return {
    id: uid(),
    questionText: "",
    questionType: "TEXT",
    options: [],
    isRequired: true,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function NewCheckInTemplatePage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("WEEKLY");
  const [questions, setQuestions] = useState<QuestionDraft[]>([emptyQuestion()]);
  const [saving, setSaving] = useState(false);

  // ── Question mutation helpers ──

  function addQuestion() {
    setQuestions((prev) => [...prev, emptyQuestion()]);
  }

  function removeQuestion(id: string) {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  }

  function updateQuestion(id: string, patch: Partial<QuestionDraft>) {
    setQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, ...patch } : q))
    );
  }

  function moveQuestion(index: number, direction: "up" | "down") {
    const next = [...questions];
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setQuestions(next);
  }

  function addOption(questionId: string) {
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === questionId ? { ...q, options: [...q.options, ""] } : q
      )
    );
  }

  function updateOption(questionId: string, optionIdx: number, value: string) {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== questionId) return q;
        const options = [...q.options];
        options[optionIdx] = value;
        return { ...q, options };
      })
    );
  }

  function removeOption(questionId: string, optionIdx: number) {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== questionId) return q;
        return { ...q, options: q.options.filter((_, i) => i !== optionIdx) };
      })
    );
  }

  function addSuggestion(suggestion: Suggestion) {
    const q: QuestionDraft = {
      id: uid(),
      questionText: suggestion.questionText,
      questionType: suggestion.questionType,
      options: suggestion.options ?? [],
      isRequired: true,
    };
    setQuestions((prev) => [...prev, q]);
  }

  // ── Save ──

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Template name is required");
      return;
    }
    const validQuestions = questions.filter((q) => q.questionText.trim());
    if (validQuestions.length === 0) {
      toast.error("Add at least one question");
      return;
    }

    setSaving(true);
    try {
      const result = await createCheckInTemplateAction({
        name: name.trim(),
        description: description.trim() || undefined,
        frequency,
        questions: validQuestions.map((q, i) => ({
          questionText: q.questionText.trim(),
          questionType: q.questionType,
          options: q.options.filter((o) => o.trim()),
          isRequired: q.isRequired,
          orderIndex: i,
        })),
      });

      if (result.success) {
        toast.success("Template created successfully");
        router.push("/check-ins");
      } else {
        toast.error(result.error);
      }
    } finally {
      setSaving(false);
    }
  }

  // ── Render ──

  return (
    <PageShell width="narrow">
      <PageHeader
        title="New Check-in Template"
        description="Build a reusable questionnaire to send to clients on a schedule."
        back={{ label: "Back to check-ins", href: "/check-ins" }}
        breadcrumb={[{ label: "Check-ins", href: "/check-ins" }, { label: "New template" }]}
      />

      {/* Template info */}
      <SectionCard title="Template Details">
        <div className="flex flex-col gap-4">
          <FormField label="Template Name" htmlFor="name">
            <Input
              id="name"
              placeholder="e.g. Weekly Pain & Recovery Check-in"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </FormField>

          <FormField label="Description (optional)" htmlFor="description">
            <Textarea
              id="description"
              placeholder="Briefly describe the purpose of this check-in..."
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </FormField>

          <FormField label="Frequency" htmlFor="frequency">
            <Select
              value={frequency}
              onValueChange={(v) => setFrequency(v as Frequency)}
            >
              <SelectTrigger id="frequency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="WEEKLY">Weekly</SelectItem>
                <SelectItem value="BIWEEKLY">Bi-weekly</SelectItem>
                <SelectItem value="MONTHLY">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
        </div>
      </SectionCard>

      {/* Quick suggestions */}
      <SectionCard title="Quick Add Suggestions" icon={Sparkles}>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s.questionText}
                type="button"
                onClick={() => addSuggestion(s)}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-caption font-medium text-foreground outline-none transition-colors hover:border-border-strong hover:bg-surface-muted focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none"
              >
                <Plus className="size-3 shrink-0" aria-hidden />
                {s.questionText}
              </button>
            ))}
          </div>
      </SectionCard>

      {/* Questions */}
      <section aria-labelledby="checkin-questions" className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h2 id="checkin-questions" className="text-heading text-foreground">
            Questions{" "}
            <span className="text-body font-normal text-muted-foreground tabular-nums">
              ({questions.filter((q) => q.questionText.trim()).length})
            </span>
          </h2>
          <Button type="button" variant="outline" size="sm" onClick={addQuestion}>
            <Plus />
            Add Question
          </Button>
        </div>

        <div className="flex flex-col gap-3">
          {questions.map((q, idx) => (
            <Card key={q.id} size="sm" className="gap-0 py-0">
              <CardContent className="flex flex-col gap-4 p-4">
                {/* Row: order controls + type badge + delete */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex flex-col pointer-coarse:gap-1">
                    <button
                      type="button"
                      onClick={() => moveQuestion(idx, "up")}
                      disabled={idx === 0}
                      aria-label="Move question up"
                      className="inline-flex size-8 items-center justify-center rounded text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-30 pointer-coarse:size-11"
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveQuestion(idx, "down")}
                      disabled={idx === questions.length - 1}
                      aria-label="Move question down"
                      className="inline-flex size-8 items-center justify-center rounded text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-30 pointer-coarse:size-11"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <span className="w-4 text-center text-caption tabular-nums">
                    {idx + 1}
                  </span>

                  <StatusBadge
                    status={q.questionType}
                    label={questionTypeLabel(q.questionType)}
                    role="neutral"
                    dot={false}
                    size="sm"
                    className="ml-1"
                  />

                  <div className="ml-auto flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Switch
                        id={`required-${q.id}`}
                        checked={q.isRequired}
                        onCheckedChange={(v) =>
                          updateQuestion(q.id, { isRequired: v })
                        }
                      />
                      <Label
                        htmlFor={`required-${q.id}`}
                        className="cursor-pointer text-caption"
                      >
                        Required
                      </Label>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => removeQuestion(q.id)}
                      aria-label="Remove question"
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>

                {/* Question text */}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`question-${q.id}`}>Question</Label>
                  <Input
                    id={`question-${q.id}`}
                    placeholder="Enter your question..."
                    value={q.questionText}
                    onChange={(e) =>
                      updateQuestion(q.id, { questionText: e.target.value })
                    }
                  />
                </div>

                {/* Question type */}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`type-${q.id}`}>Answer Type</Label>
                  <Select
                    value={q.questionType}
                    onValueChange={(v) =>
                      updateQuestion(q.id, {
                        questionType: v as QuestionType,
                        // Clear options if switching away from MC
                        options: v === "MULTIPLE_CHOICE" ? q.options : [],
                      })
                    }
                  >
                    <SelectTrigger id={`type-${q.id}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TEXT">Text Answer</SelectItem>
                      <SelectItem value="SCALE">1-10 Scale</SelectItem>
                      <SelectItem value="BOOLEAN">Yes / No</SelectItem>
                      <SelectItem value="MULTIPLE_CHOICE">
                        Multiple Choice
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Multiple choice options */}
                {q.questionType === "MULTIPLE_CHOICE" && (
                  <div className="flex flex-col gap-1.5">
                    <Label>Options</Label>
                    <div className="flex flex-col gap-2">
                      {q.options.map((opt, oi) => (
                        <div key={oi} className="flex items-center gap-2">
                          <Input
                            aria-label={`Option ${oi + 1}`}
                            placeholder={`Option ${oi + 1}`}
                            value={opt}
                            onChange={(e) =>
                              updateOption(q.id, oi, e.target.value)
                            }
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => removeOption(q.id, oi)}
                            aria-label={`Remove option ${oi + 1}`}
                            className="shrink-0 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => addOption(q.id)}
                        className="w-fit text-muted-foreground hover:text-foreground"
                      >
                        <Plus />
                        Add Option
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        <Button
          type="button"
          variant="outline"
          className="w-full border-dashed"
          onClick={addQuestion}
        >
          <Plus />
          Add Another Question
        </Button>
      </section>

      {/* Footer actions */}
      <div className="flex items-center justify-end gap-2 border-t border-border pt-6">
        <Button variant="outline" asChild>
          <Link href="/check-ins">Cancel</Link>
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Template"}
        </Button>
      </div>
    </PageShell>
  );
}
