"use client";

import { Progress } from "@/components/ui/progress";
import { SectionCard } from "@/components/shared/section-card";
import { TrendingUp } from "lucide-react";

export interface ProgramProgressSummary {
  programId: string;
  programName: string;
  /** null when the program has no startDate/durationWeeks to derive a week from. */
  week: { current: number; total: number } | null;
  completedSessions: number;
  totalSessions: number;
}

/**
 * Whole-program arc: "Week 3 of 8 — 41% complete".
 *
 * Deliberately distinct from the dashboard's "This Week" card, which measures
 * only the current week's sessions. Both are shown because clients ask two
 * different questions: "am I on track today?" and "how far through am I?".
 */
export function ProgramProgressBar({ summary }: { summary: ProgramProgressSummary | null }) {
  if (!summary) return null;

  const { programId, programName, week, completedSessions, totalSessions } = summary;
  const percent =
    totalSessions > 0 ? Math.min(Math.round((completedSessions / totalSessions) * 100), 100) : 0;

  return (
    <SectionCard
      title="Program progress"
      icon={TrendingUp}
      action={{ label: "View program", href: `/programs/${programId}` }}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{programName}</p>
          {week && (
            <p className="text-xs text-muted-foreground">
              Week {week.current} of {week.total}
            </p>
          )}
        </div>
        <span className="shrink-0 text-2xl font-bold text-primary">{percent}%</span>
      </div>
      <Progress value={percent} className="h-2.5" />
      <p className="mt-3 text-xs text-muted-foreground/70">
        {completedSessions} of {totalSessions} workouts complete
      </p>
    </SectionCard>
  );
}
