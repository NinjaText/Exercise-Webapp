"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ChevronRight, Target } from "lucide-react";

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
    <Card>
      <CardContent className="p-4 sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-50">
              <Target className="h-4.5 w-4.5 text-violet-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold">Program Progress</p>
              <p className="truncate text-xs text-muted-foreground">
                {programName}
                {week ? ` · Week ${week.current} of ${week.total}` : ""}
              </p>
            </div>
          </div>
          <span className="shrink-0 text-2xl font-bold text-primary">{percent}%</span>
        </div>
        <Progress value={percent} className="h-2.5" />
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground/70">
          <span>
            {completedSessions} of {totalSessions} workouts complete
          </span>
          <Link
            href={`/programs/${programId}`}
            className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline"
          >
            View program <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
