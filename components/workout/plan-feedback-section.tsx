"use client";

import { useState } from "react";
import { FeedbackForm } from "@/components/feedback/feedback-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MessageCircle, CheckCircle } from "lucide-react";
import { formatFeedbackRating } from "@/lib/utils/formatting";

interface ExerciseWithFeedback {
  planExerciseId: string;
  exerciseName: string;
  existingRating?: string;
}

interface PlanFeedbackSectionProps {
  exercises: ExerciseWithFeedback[];
}

export function PlanFeedbackSection({ exercises }: PlanFeedbackSectionProps) {
  const [activeForm, setActiveForm] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<Set<string>>(new Set());

  const allDone = exercises.every(
    (e) => e.existingRating || submitted.has(e.planExerciseId)
  );

  if (allDone) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-success-soft p-4 text-success-foreground">
        <CheckCircle className="h-5 w-5" />
        <p className="text-sm font-medium">All feedback submitted. Thank you!</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {exercises.map((ex) => {
        const isSubmitted = submitted.has(ex.planExerciseId);

        if (ex.existingRating || isSubmitted) {
          return (
            <div
              key={ex.planExerciseId}
              className="flex items-center justify-between rounded-lg border border-success-border bg-success-soft px-4 py-3"
            >
              <p className="text-sm font-medium text-muted-foreground">
                {ex.exerciseName}
              </p>
              <Badge variant="secondary" className="bg-success-soft text-success-foreground">
                <CheckCircle className="mr-1 h-3 w-3" />
                {formatFeedbackRating(ex.existingRating ?? "FELT_GOOD")}
              </Badge>
            </div>
          );
        }

        if (activeForm === ex.planExerciseId) {
          return (
            <FeedbackForm
              key={ex.planExerciseId}
              planExerciseId={ex.planExerciseId}
              exerciseName={ex.exerciseName}
              onSuccess={() => {
                setSubmitted((prev) => new Set(prev).add(ex.planExerciseId));
                setActiveForm(null);
              }}
            />
          );
        }

        return (
          <div
            key={ex.planExerciseId}
            className="flex items-center justify-between rounded-lg border px-4 py-3"
          >
            <p className="text-sm font-medium text-muted-foreground">
              {ex.exerciseName}
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setActiveForm(ex.planExerciseId)}
            >
              <MessageCircle className="mr-1 h-3 w-3" />
              Leave Feedback
            </Button>
          </div>
        );
      })}
    </div>
  );
}
