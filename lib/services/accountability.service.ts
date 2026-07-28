import { prisma } from "@/lib/prisma";
import * as nutritionService from "@/lib/services/nutrition.service";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function dayRange(d: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

const WITHIN_PCT = 0.1; // ±10%

export interface AccountabilityBreakdown {
  workout: number; // 0 or 30
  calories: number; // 0 or 20
  protein: number; // 0 or 20
  water: number; // 0 or 10
  checkIn: number; // 0 or 20
}

export interface DailyAccountabilityScore {
  date: Date;
  score: number; // sum of breakdown, out of 100
  breakdown: AccountabilityBreakdown;
}

function withinPct(target: number | null, actual: number): boolean {
  if (!target || target <= 0) return false;
  return Math.abs(actual - target) / target <= WITHIN_PCT;
}

/**
 * Computes the daily accountability score for a client using the fixed
 * point rubric: workout completed (+30), calories within ±10% of target
 * (+20), protein within ±10% of target (+20), water goal met (+10), a
 * check-in submitted that day (+20). Max score is always 100; unmet or
 * inapplicable (no target set) components simply score 0.
 */
export async function computeDailyAccountabilityScore(
  clientId: string,
  date: Date
): Promise<DailyAccountabilityScore> {
  const { start, end } = dayRange(date);

  const [workoutCompleted, checkInSubmitted, summary] = await Promise.all([
    prisma.workoutSessionV2.findFirst({
      where: { clientId, status: "COMPLETED", completedAt: { gte: start, lt: end } },
      select: { id: true },
    }),
    prisma.checkInResponse.findFirst({
      where: { clientId, submittedAt: { gte: start, lt: end } },
      select: { id: true },
    }),
    nutritionService.getDailySummary(clientId, date),
  ]);

  const breakdown: AccountabilityBreakdown = {
    workout: workoutCompleted ? 30 : 0,
    calories: withinPct(summary.target.calories, summary.consumed.calories) ? 20 : 0,
    protein: withinPct(summary.target.proteinG, summary.consumed.proteinG) ? 20 : 0,
    water:
      summary.target.waterMl && summary.consumed.waterMl >= summary.target.waterMl ? 10 : 0,
    checkIn: checkInSubmitted ? 20 : 0,
  };

  const score = Object.values(breakdown).reduce((sum, v) => sum + v, 0);

  return { date: start, score, breakdown };
}

/**
 * Averages the daily accountability score over the 7 days ending on `date`
 * (inclusive), producing the weekly score shown alongside the daily one.
 */
export async function computeWeeklyAccountabilityScore(
  clientId: string,
  date: Date = new Date()
): Promise<{ weeklyScore: number; days: DailyAccountabilityScore[] }> {
  const { start: todayStart } = dayRange(date);

  const days = await Promise.all(
    Array.from({ length: 7 }, (_, i) => {
      const day = new Date(todayStart.getTime() - (6 - i) * 24 * 60 * 60 * 1000);
      return computeDailyAccountabilityScore(clientId, day);
    })
  );

  const weeklyScore = Math.round(days.reduce((sum, d) => sum + d.score, 0) / days.length);

  return { weeklyScore, days };
}
