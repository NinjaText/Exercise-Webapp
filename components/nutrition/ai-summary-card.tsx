"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Sparkles, Loader2, RefreshCw } from "lucide-react";
import { generateDailySummaryAction } from "@/actions/nutrition-actions";
import type { DailyNutritionSummary } from "@/lib/services/nutrition-ai.service";
import { Button } from "@/components/ui/button";

interface DailySummaryCardProps {
  clientId: string;
  date: Date;
  initialSummary?: DailyNutritionSummary | null;
}

export function DailySummaryCard({ clientId, date, initialSummary }: DailySummaryCardProps) {
  const [isPending, startTransition] = useTransition();
  const [summary, setSummary] = useState<DailyNutritionSummary | null>(initialSummary ?? null);

  function generate(force: boolean) {
    startTransition(async () => {
      const result = await generateDailySummaryAction({ clientId, date, force });
      if (result.success) {
        setSummary(result.data);
      } else {
        toast.error(result.error ?? "Failed to generate summary");
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-primary" />
          Today&apos;s AI Summary
        </h3>
        {summary && (
          <button
            type="button"
            onClick={() => generate(true)}
            disabled={isPending}
            aria-label="Regenerate summary"
            className="text-muted-foreground hover:text-foreground"
          >
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>

      {summary ? (
        <div className="space-y-2 text-sm">
          <p>{summary.summary}</p>
          <p className="text-emerald-600">✓ {summary.highlight}</p>
          {summary.concern && <p className="text-amber-600">→ {summary.concern}</p>}
        </div>
      ) : (
        <Button type="button" size="sm" variant="outline" onClick={() => generate(false)} disabled={isPending}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Generate summary
        </Button>
      )}
    </div>
  );
}
