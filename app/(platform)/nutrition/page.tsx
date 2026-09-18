import { UtensilsCrossed, TrendingUp, Target, Flame, Droplet, ClipboardCheck } from "lucide-react";
import { getCurrentUser } from "@/lib/current-user";
import type { StatusRole } from "@/lib/ui/status";
import * as nutritionService from "@/lib/services/nutrition.service";
import * as accountabilityService from "@/lib/services/accountability.service";
import { MacroProgressBars } from "@/components/nutrition/macro-progress-bars";
import { WaterTracker } from "@/components/nutrition/water-tracker";
import { ML_PER_OZ } from "@/lib/constants/nutrition";
import { NutritionGoalsDialog } from "@/components/nutrition/nutrition-goals-dialog";
import { MealLogDialog } from "@/components/nutrition/meal-log-dialog";
import { MealsTable } from "@/components/nutrition/meals-table";
import { MealsRangeFilter } from "@/components/nutrition/meals-range-filter";
import { formatUtcDate } from "@/components/nutrition/nutrition-date-utils";
import { DayNotesCard } from "@/components/nutrition/day-notes-card";
import { ClientRosterAdherence } from "@/components/nutrition/client-roster-adherence";
import { PageShell } from "@/components/shared/page-shell";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatCard } from "@/components/shared/stat-card";
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

export default async function NutritionPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; start?: string; end?: string }>;
}) {
  const rangeParams = await searchParams;
  const user = await getCurrentUser();

  if (user.role === "TRAINER") {
    return <TrainerNutritionView trainerId={user.id} />;
  }

  return <ClientNutritionView clientId={user.id} rangeParams={rangeParams} />;
}

function describeEmptyRange(preset: nutritionService.NutritionRangePreset, start: Date, end: Date): string {
  if (preset === "TODAY") return "No meals logged today.";
  if (start.getTime() === end.getTime()) return `No meals logged for ${formatUtcDate(start)}.`;
  return `No meals logged between ${formatUtcDate(start)} and ${formatUtcDate(end)}.`;
}

function adherenceRole(pct: number | null): StatusRole {
  if (pct === null) return "neutral";
  if (pct >= 85) return "success";
  if (pct >= 60) return "warning";
  return "danger";
}

// ─── Client View ─────────────────────────────────────────────────────────────

async function ClientNutritionView({
  clientId,
  rangeParams,
}: {
  clientId: string;
  rangeParams: { range?: string; start?: string; end?: string };
}) {
  const today = new Date();
  const { preset, start, end } = nutritionService.parseNutritionRangeParams(rangeParams);
  const isSingleDay = start.getTime() === end.getTime();

  const [summary, history7, history30, weekly, mealsLogs, mealsComments] = await Promise.all([
    nutritionService.getDailySummary(clientId, today),
    nutritionService.getNutritionHistory(clientId, 7),
    nutritionService.getNutritionHistory(clientId, 30),
    accountabilityService.computeWeeklyAccountabilityScore(clientId, today),
    nutritionService.getNutritionLogsForRange(clientId, start, end),
    nutritionService.getNutritionCommentsForRange(clientId, start, end),
  ]);

  const daily = weekly.days[weekly.days.length - 1];
  const streak = nutritionService.computeLoggingStreak(history30);
  const waterOz = Math.round(summary.consumed.waterMl / ML_PER_OZ);

  return (
    <PageShell>
      <Tabs defaultValue="today" className="gap-6">
        <PageHeader
          title="Nutrition"
          description={getTodayLabel()}
          primaryAction={<MealLogDialog clientId={clientId} date={today} />}
          secondaryActions={<NutritionGoalsDialog clientId={clientId} role="CLIENT" target={summary.target} />}
          tabs={
            <TabsList variant="line">
              <TabsTrigger value="today">
                <UtensilsCrossed />
                Today
              </TabsTrigger>
              <TabsTrigger value="insights">
                <TrendingUp />
                Insights
              </TabsTrigger>
            </TabsList>
          }
        />

        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {summary.adherencePct !== null && (
            <StatCard
              label="Adherence"
              value={`${summary.adherencePct}%`}
              icon={Target}
              role={adherenceRole(summary.adherencePct)}
              size="compact"
            />
          )}
          <StatCard
            label="Streak"
            value={`${streak} day${streak === 1 ? "" : "s"}`}
            icon={Flame}
            role="warning"
            size="compact"
          />
          <StatCard label="Water" value={`${waterOz} oz`} icon={Droplet} role="info" size="compact" />
        </div>

        <TabsContent value="today" className="space-y-5 pt-1">
          <SectionCard title="Macros" icon={Flame}>
            <MacroProgressBars
              calories={{ consumed: summary.consumed.calories, target: summary.target.calories }}
              proteinG={{ consumed: summary.consumed.proteinG, target: summary.target.proteinG }}
              carbsG={{ consumed: summary.consumed.carbsG, target: summary.target.carbsG }}
              fatG={{ consumed: summary.consumed.fatG, target: summary.target.fatG }}
            />
          </SectionCard>

          <SectionCard title="Water" icon={Droplet}>
            <WaterTracker
              clientId={clientId}
              date={today}
              consumedMl={summary.consumed.waterMl}
              targetMl={summary.target.waterMl}
            />
          </SectionCard>

          <SectionCard
            title="Meals"
            icon={UtensilsCrossed}
            action={<MealsRangeFilter preset={preset} start={start} end={end} />}
          >
            <MealsTable
              clientId={clientId}
              logs={mealsLogs}
              comments={mealsComments}
              canDelete
              canEdit
              emptyMessage={describeEmptyRange(preset, start, end)}
            />
          </SectionCard>

          {isSingleDay && <DayNotesCard clientId={clientId} date={start} comments={mealsComments} />}

          <div className="rounded-xl p-4 ring-1 ring-border">
            <DailySummaryCard clientId={clientId} date={today} />
          </div>
        </TabsContent>

        <TabsContent value="insights" className="space-y-5 pt-1">
          <SectionCard title="Accountability" icon={ClipboardCheck}>
            <AccountabilityScoreCard
              dailyScore={daily.score}
              dailyBreakdown={daily.breakdown}
              weeklyScore={weekly.weeklyScore}
            />
          </SectionCard>

          <SectionCard title="Trends" icon={TrendingUp}>
            <TrendRangeToggle history7={history7} history30={history30} streak={streak} />
          </SectionCard>

          <div className="rounded-xl p-4 ring-1 ring-border">
            <WeeklyReviewCard clientId={clientId} referenceDate={today} title="My Weekly Review" />
          </div>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

// ─── Trainer View ───────────────────────────────────────────────────────────

async function TrainerNutritionView({ trainerId }: { trainerId: string }) {
  const clients = await nutritionService.getRosterAdherenceSnapshot(trainerId);

  return (
    <PageShell>
      <PageHeader
        title="Client Nutrition"
        description={`${getTodayLabel()} — today's adherence at a glance`}
      />

      <ClientRosterAdherence clients={clients} />
    </PageShell>
  );
}
