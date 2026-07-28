"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { NutritionTrendCharts } from "./nutrition-trend-charts";

interface HistoryPoint {
  date: Date | string;
  consumed: { calories: number; proteinG: number; carbsG: number; fatG: number };
  adherencePct: number | null;
}

interface TrendRangeToggleProps {
  history7: HistoryPoint[];
  history30: HistoryPoint[];
  streak: number;
}

export function TrendRangeToggle({ history7, history30, streak }: TrendRangeToggleProps) {
  const [range, setRange] = useState<7 | 30>(7);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {([7, 30] as const).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRange(r)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
              range === r ? "bg-primary text-primary-foreground" : "ring-1 ring-border/50 text-muted-foreground"
            )}
          >
            {r} days
          </button>
        ))}
      </div>
      <NutritionTrendCharts history={range === 7 ? history7 : history30} streak={streak} />
    </div>
  );
}
