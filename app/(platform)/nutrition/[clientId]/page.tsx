import { notFound } from "next/navigation";
import { UtensilsCrossed, TrendingUp } from "lucide-react";
import { getCurrentUser } from "@/lib/current-user";
import { getClientIdsForTrainer } from "@/lib/services/client.service";
import { prisma } from "@/lib/prisma";
import * as nutritionService from "@/lib/services/nutrition.service";
import * as accountabilityService from "@/lib/services/accountability.service";
import { MacroProgressBars } from "@/components/nutrition/macro-progress-bars";
import { WaterTracker } from "@/components/nutrition/water-tracker";
import { NutritionGoalsDialog } from "@/components/nutrition/nutrition-goals-dialog";
import { MealsTable } from "@/components/nutrition/meals-table";
import { DayNotesCard } from "@/components/nutrition/day-notes-card";
import { TrendRangeToggle } from "@/components/nutrition/trend-range-toggle";
import { AccountabilityScoreCard } from "@/components/nutrition/accountability-score-card";
import { WeeklyReviewCard } from "@/components/nutrition/weekly-review-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default async function ClientNutritionDetailPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const user = await getCurrentUser();

  if (user.role !== "TRAINER") notFound();

  const clientIds = await getClientIdsForTrainer(user.id);
  if (!clientIds.includes(clientId)) notFound();

  const client = await prisma.user.findUnique({
    where: { id: clientId },
    select: { firstName: true, lastName: true },
  });
  if (!client) notFound();

  const today = new Date();
  const [summary, logs, comments, history7, history30, weekly] = await Promise.all([
    nutritionService.getDailySummary(clientId, today),
    nutritionService.getNutritionLogsForDate(clientId, today),
    nutritionService.getNutritionCommentsForDate(clientId, today),
    nutritionService.getNutritionHistory(clientId, 7),
    nutritionService.getNutritionHistory(clientId, 30),
    accountabilityService.computeWeeklyAccountabilityScore(clientId, today),
  ]);
  const daily = weekly.days[weekly.days.length - 1];
  const streak = nutritionService.computeLoggingStreak(history30);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">
            {client.firstName} {client.lastName} — Nutrition
          </h2>
          <p className="text-xs text-muted-foreground">
            {summary.mealsLogged} meal{summary.mealsLogged !== 1 ? "s" : ""} logged today
          </p>
        </div>
        <div className="flex items-center gap-3">
          {summary.adherencePct !== null && (
            <div className="text-right leading-none">
              <p className="text-xl font-bold tabular-nums">{summary.adherencePct}%</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">adherence</p>
            </div>
          )}
          <NutritionGoalsDialog clientId={clientId} role="TRAINER" target={summary.target} />
        </div>
      </div>

      <div className="space-y-4 rounded-xl p-4 ring-1 ring-border/50 shadow-sm">
        <MacroProgressBars
          calories={{ consumed: summary.consumed.calories, target: summary.target.calories }}
          proteinG={{ consumed: summary.consumed.proteinG, target: summary.target.proteinG }}
          carbsG={{ consumed: summary.consumed.carbsG, target: summary.target.carbsG }}
          fatG={{ consumed: summary.consumed.fatG, target: summary.target.fatG }}
        />
        <div className="border-t border-border/50 pt-4">
          <WaterTracker
            clientId={clientId}
            date={today}
            consumedMl={summary.consumed.waterMl}
            targetMl={summary.target.waterMl}
            readOnly
          />
        </div>
      </div>

      <Tabs defaultValue="today">
        <TabsList>
          <TabsTrigger value="today">
            <UtensilsCrossed />
            Today
          </TabsTrigger>
          <TabsTrigger value="insights">
            <TrendingUp />
            Insights
          </TabsTrigger>
        </TabsList>

        <TabsContent value="today" className="space-y-5 pt-1">
          <MealsTable
            clientId={clientId}
            date={today}
            logs={logs}
            comments={comments}
            canDelete={false}
          />

          <DayNotesCard clientId={clientId} date={today} comments={comments} />
        </TabsContent>

        <TabsContent value="insights" className="space-y-5 pt-1">
          <div className="rounded-xl p-4 ring-1 ring-border/50 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold">Accountability Score</h3>
            <AccountabilityScoreCard
              dailyScore={daily.score}
              dailyBreakdown={daily.breakdown}
              weeklyScore={weekly.weeklyScore}
            />
          </div>

          <div className="rounded-xl p-4 ring-1 ring-border/50 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold">Trends</h3>
            <TrendRangeToggle history7={history7} history30={history30} streak={streak} />
          </div>

          <div className="rounded-xl p-4 ring-1 ring-border/50 shadow-sm">
            <WeeklyReviewCard
              clientId={clientId}
              referenceDate={today}
              title={`${client.firstName}'s Weekly Nutrition Summary`}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
