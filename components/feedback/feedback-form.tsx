"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FEEDBACK_RATINGS } from "@/lib/utils/constants";
import { submitFeedbackAction } from "@/actions/feedback-actions";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface FeedbackFormProps {
  planExerciseId: string;
  exerciseName: string;
  onSuccess?: () => void;
}

export function FeedbackForm({ planExerciseId, exerciseName, onSuccess }: FeedbackFormProps) {
  const [loading, setLoading] = useState(false);
  const [rating, setRating] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!rating) {
      toast.error("Please select a rating");
      return;
    }

    setLoading(true);
    const formData = new FormData(e.currentTarget);

    const result = await submitFeedbackAction({
      planExerciseId,
      rating,
      comment: (formData.get("comment") as string) || undefined,
    });

    setLoading(false);

    if (result.success) {
      toast.success("Feedback submitted");
      onSuccess?.();
    } else {
      toast.error(result.error);
    }
  }

  const ratingColors: Record<string, string> = {
    FELT_GOOD: "border-green-300 bg-green-50 text-green-700",
    MILD_DISCOMFORT: "border-amber-300 bg-amber-50 text-amber-700",
    PAINFUL: "border-red-300 bg-red-50 text-red-700",
    UNSURE_HOW_TO_PERFORM: "border-blue-300 bg-blue-50 text-blue-700",
  };

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Feedback: {exerciseName}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>How did this exercise feel? *</Label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {FEEDBACK_RATINGS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setRating(r.value)}
                  className={`rounded-lg border-2 p-3 text-sm font-medium transition-colors ${
                    rating === r.value
                      ? ratingColors[r.value]
                      : "border-border hover:border-border/80"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="comment">Additional Comments</Label>
            <Textarea id="comment" name="comment" rows={2} placeholder="Any additional details..." />
          </div>

          <Button type="submit" disabled={loading} className="w-full">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit Feedback
          </Button>
        </CardContent>
      </Card>
    </form>
  );
}
