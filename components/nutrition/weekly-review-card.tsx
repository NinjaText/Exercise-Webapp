"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Sparkles, Loader2, RefreshCw } from "lucide-react";
import { generateWeeklyReviewAction } from "@/actions/nutrition-actions";
import type { WeeklyNutritionReview } from "@/lib/services/nutrition-ai.service";
import { Button } from "@/components/ui/button";

interface WeeklyReviewCardProps {
  clientId: string;
  referenceDate: Date;
  initialReview?: WeeklyNutritionReview | null;
  title?: string;
}

export function WeeklyReviewCard({ clientId, referenceDate, initialReview, title }: WeeklyReviewCardProps) {
  const [isPending, startTransition] = useTransition();
  const [review, setReview] = useState<WeeklyNutritionReview | null>(initialReview ?? null);

  function generate(force: boolean) {
    startTransition(async () => {
      const result = await generateWeeklyReviewAction({ clientId, referenceDate, force });
      if (result.success) {
        setReview(result.data);
      } else {
        toast.error(result.error ?? "Failed to generate weekly review");
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-primary" />
          {title ?? "Weekly Nutrition Review"}
        </h3>
        {review && (
          <button
            type="button"
            onClick={() => generate(true)}
            disabled={isPending}
            aria-label="Regenerate weekly review"
            className="text-muted-foreground hover:text-foreground"
          >
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>

      {review ? (
        <div className="space-y-3 text-sm">
          {review.wins.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-emerald-600">Wins</p>
              <ul className="list-inside list-disc text-foreground/90">
                {review.wins.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
          {review.struggles.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-amber-600">Struggles</p>
              <ul className="list-inside list-disc text-foreground/90">
                {review.struggles.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Missed days: <span className="font-semibold text-foreground">{review.missedDays}</span> / 7
          </p>
          {review.coachingSuggestions.length > 0 && (
            <div>
              <p className="text-xs font-semibold">Coaching suggestions</p>
              <ul className="list-inside list-disc text-foreground/90">
                {review.coachingSuggestions.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <p className="text-xs font-semibold">Macro adjustment recommendation</p>
            <p className="text-foreground/90">{review.macroAdjustmentRecommendations}</p>
          </div>
        </div>
      ) : (
        <Button type="button" size="sm" variant="outline" onClick={() => generate(false)} disabled={isPending}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Generate weekly review
        </Button>
      )}
    </div>
  );
}
