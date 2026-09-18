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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { createCheckInTemplateAction } from "@/actions/checkin-actions";
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Sparkles,
  ArrowLeft,
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
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/check-ins">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            New Check-in Template
          </h2>
          <p className="text-muted-foreground text-sm">
            Build a reusable questionnaire to send to clients on a schedule.
          </p>
        </div>
      </div>

      {/* Template info */}
      <Card className="ring-1 ring-border shadow-none">
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Template Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Template Name</Label>
            <Input
              id="name"
              placeholder="e.g. Weekly Pain & Recovery Check-in"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              placeholder="Briefly describe the purpose of this check-in..."
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="frequency">Frequency</Label>
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
          </div>
        </CardContent>
      </Card>

      {/* Quick suggestions */}
      <Card className="ring-1 ring-border shadow-none">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-brand" />
            Quick Add Suggestions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s.questionText}
                type="button"
                onClick={() => addSuggestion(s)}
                className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted hover:border-border"
              >
                <Plus className="h-3 w-3 shrink-0" />
                {s.questionText}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Questions */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">
            Questions{" "}
            <span className="font-normal text-muted-foreground text-sm">
              ({questions.filter((q) => q.questionText.trim()).length})
            </span>
          </h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addQuestion}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Question
          </Button>
        </div>

        <div className="space-y-3">
          {questions.map((q, idx) => (
            <Card
              key={q.id}
              className="ring-1 ring-border shadow-none"
            >
              <CardContent className="p-4 space-y-4">
                {/* Row: order controls + type badge + delete */}
                <div className="flex items-center gap-2">
                  <div className="flex flex-col gap-0.5">
                    <button
                      type="button"
                      onClick={() => moveQuestion(idx, "up")}
                      disabled={idx === 0}
                      className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveQuestion(idx, "down")}
                      disabled={idx === questions.length - 1}
                      className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <span className="text-xs text-muted-foreground w-4 text-center">
                    {idx + 1}
                  </span>

                  <Badge
                    variant="outline"
                    className="border-border/60 text-[10px] text-muted-foreground ml-1"
                  >
                    {questionTypeLabel(q.questionType)}
                  </Badge>

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
                        className="text-xs text-muted-foreground cursor-pointer"
                      >
                        Required
                      </Label>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeQuestion(q.id)}
                      className="rounded p-1 text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Question text */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    Question
                  </Label>
                  <Input
                    placeholder="Enter your question..."
                    value={q.questionText}
                    onChange={(e) =>
                      updateQuestion(q.id, { questionText: e.target.value })
                    }
                  />
                </div>

                {/* Question type */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    Answer Type
                  </Label>
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
                    <SelectTrigger>
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
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">
                      Options
                    </Label>
                    <div className="space-y-2">
                      {q.options.map((opt, oi) => (
                        <div key={oi} className="flex items-center gap-2">
                          <Input
                            placeholder={`Option ${oi + 1}`}
                            value={opt}
                            onChange={(e) =>
                              updateOption(q.id, oi, e.target.value)
                            }
                          />
                          <button
                            type="button"
                            onClick={() => removeOption(q.id, oi)}
                            className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => addOption(q.id)}
                        className="gap-2 text-muted-foreground hover:text-foreground"
                      >
                        <Plus className="h-3.5 w-3.5" />
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
          className="w-full gap-2 border-dashed"
          onClick={addQuestion}
        >
          <Plus className="h-4 w-4" />
          Add Another Question
        </Button>
      </div>

      {/* Footer actions */}
      <div className="flex items-center justify-end gap-3 pb-8">
        <Button variant="outline" asChild>
          <Link href="/check-ins">Cancel</Link>
        </Button>
        <Button
          onClick={handleSave}
          disabled={saving}
          className="gap-2"
        >
          {saving ? "Saving..." : "Save Template"}
        </Button>
      </div>
    </div>
  );
}
