import { UtensilsCrossed, TrendingUp } from "lucide-react";
import { getCurrentUser } from "@/lib/current-user";
import * as nutritionService from "@/lib/services/nutrition.service";
import * as accountabilityService from "@/lib/services/accountability.service";
import { MacroProgressBars } from "@/components/nutrition/macro-progress-bars";
import { WaterTracker } from "@/components/nutrition/water-tracker";
import { NutritionGoalsDialog } from "@/components/nutrition/nutrition-goals-dialog";
import { MealLogDialog } from "@/components/nutrition/meal-log-dialog";
import { MealsTable } from "@/components/nutrition/meals-table";
import { DayNotesCard } from "@/components/nutrition/day-notes-card";
import { ClientRosterAdherence } from "@/components/nutrition/client-roster-adherence";
import { TrendRangeToggle } from "@/components/nutrition/trend-range-toggle";
import { AccountabilityScoreCard } from "@/components/nutrition/accountability-score-card";
import { DailySummaryCard } from "@/components/nutrition/ai-summary-card";
import { WeeklyReviewCard } from "@/components/nutrition/weekly-review-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function getTodayLabel(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export default async function NutritionPage() {
  const user = await getCurrentUser();

  if (user.role === "TRAINER") {
    return <TrainerNutritionView trainerId={user.id} />;
  }

  return <ClientNutritionView clientId={user.id} />;
}

// ─── Client View ─────────────────────────────────────────────────────────────

async function ClientNutritionView({ clientId }: { clientId: string }) {
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
          <h2 className="text-xl font-bold tracking-tight">Nutrition</h2>
          <p className="text-xs text-muted-foreground">{getTodayLabel()}</p>
        </div>
        <div className="flex items-center gap-3">
          {summary.adherencePct !== null && (
            <div className="text-right leading-none">
              <p className="text-xl font-bold tabular-nums">{summary.adherencePct}%</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">adherence</p>
            </div>
          )}
          <NutritionGoalsDialog clientId={clientId} role="CLIENT" target={summary.target} />
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
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Meals</h3>
            <MealLogDialog clientId={clientId} date={today} />
          </div>

          <MealsTable clientId={clientId} date={today} logs={logs} comments={comments} canDelete />

          <DayNotesCard clientId={clientId} date={today} comments={comments} />

          <div className="rounded-xl p-4 ring-1 ring-border/50 shadow-sm">
            <DailySummaryCard clientId={clientId} date={today} />
          </div>
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
            <WeeklyReviewCard clientId={clientId} referenceDate={today} title="My Weekly Review" />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Trainer View ───────────────────────────────────────────────────────────

async function TrainerNutritionView({ trainerId }: { trainerId: string }) {
  const clients = await nutritionService.getRosterAdherenceSnapshot(trainerId);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Client Nutrition</h2>
        <p className="text-xs text-muted-foreground">
          {getTodayLabel()} — today&apos;s adherence at a glance
        </p>
      </div>

      <ClientRosterAdherence clients={clients} />
    </div>
  );
}
