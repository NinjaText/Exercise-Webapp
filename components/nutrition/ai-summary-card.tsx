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
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-heading text-foreground">
          <Sparkles className="size-4 text-primary" aria-hidden />
          Today&apos;s AI Summary
        </h3>
        {summary && (
          <button
            type="button"
            onClick={() => generate(true)}
            disabled={isPending}
            aria-label="Regenerate summary"
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-surface-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>

      {summary ? (
        <div className="flex flex-col gap-2 text-body">
          <p>{summary.summary}</p>
          <p className="text-success-foreground">✓ {summary.highlight}</p>
          {summary.concern && <p className="text-warning-foreground">→ {summary.concern}</p>}
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
