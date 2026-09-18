import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { getClientIdsForTrainer } from "@/lib/services/client.service";
import { prisma } from "@/lib/prisma";
import * as nutritionService from "@/lib/services/nutrition.service";
import * as accountabilityService from "@/lib/services/accountability.service";
import { getDisplayName } from "@/lib/utils/display-name";
import { MacroProgressBars } from "@/components/nutrition/macro-progress-bars";
import { WaterTracker } from "@/components/nutrition/water-tracker";
import { NutritionGoalsDialog } from "@/components/nutrition/nutrition-goals-dialog";
import { MealsTable } from "@/components/nutrition/meals-table";
import { MealsRangeFilter } from "@/components/nutrition/meals-range-filter";
import { formatUtcDate } from "@/components/nutrition/nutrition-date-utils";
import { DayNotesCard } from "@/components/nutrition/day-notes-card";
import { TrendRangeToggle } from "@/components/nutrition/trend-range-toggle";
import { AccountabilityScoreCard } from "@/components/nutrition/accountability-score-card";
import { WeeklyReviewCard } from "@/components/nutrition/weekly-review-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageShell } from "@/components/shared/page-shell";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { UtensilsCrossed, TrendingUp } from "lucide-react";

function describeEmptyRange(preset: nutritionService.NutritionRangePreset, start: Date, end: Date): string {
  if (preset === "TODAY") return "No meals logged today.";
  if (start.getTime() === end.getTime()) return `No meals logged for ${formatUtcDate(start)}.`;
  return `No meals logged between ${formatUtcDate(start)} and ${formatUtcDate(end)}.`;
}

export default async function ClientNutritionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<{ range?: string; start?: string; end?: string }>;
}) {
  const { clientId } = await params;
  const rangeParams = await searchParams;
  const user = await getCurrentUser();

  if (user.role !== "TRAINER") notFound();

  const clientIds = await getClientIdsForTrainer(user.id);
  if (!clientIds.includes(clientId)) notFound();

  const client = await prisma.user.findUnique({
    where: { id: clientId },
    select: { firstName: true, lastName: true, email: true },
  });
  if (!client) notFound();

  const clientName = getDisplayName(client);

  const today = new Date();
  const { preset, start, end } = nutritionService.parseNutritionRangeParams(rangeParams);
  const isSingleDay = start.getTime() === end.getTime();
  const [summary, mealsLogs, mealsComments, history7, history30, weekly] = await Promise.all([
    nutritionService.getDailySummary(clientId, today),
    nutritionService.getNutritionLogsForRange(clientId, start, end),
    nutritionService.getNutritionCommentsForRange(clientId, start, end),
    nutritionService.getNutritionHistory(clientId, 7),
    nutritionService.getNutritionHistory(clientId, 30),
    accountabilityService.computeWeeklyAccountabilityScore(clientId, today),
  ]);
  const daily = weekly.days[weekly.days.length - 1];
  const streak = nutritionService.computeLoggingStreak(history30);

  return (
    <PageShell>
      <Tabs defaultValue="today" className="gap-6">
        <PageHeader
          breadcrumb={[{ label: "Nutrition", href: "/nutrition" }, { label: clientName }]}
          title={clientName}
          description={`${summary.mealsLogged} meal${summary.mealsLogged !== 1 ? "s" : ""} logged today`}
          primaryAction={
            <NutritionGoalsDialog clientId={clientId} role="TRAINER" target={summary.target} variant="default" />
          }
          meta={
            summary.adherencePct !== null ? (
              <span className="tabular-nums">{summary.adherencePct}% adherence today</span>
            ) : undefined
          }
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

        <SectionCard title="Today's Nutrition">
          <div className="space-y-4">
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
        </SectionCard>

        <TabsContent value="today" className="space-y-5 pt-1">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Meals</h3>
            <MealsRangeFilter preset={preset} start={start} end={end} />
          </div>

          <MealsTable
            clientId={clientId}
            logs={mealsLogs}
            comments={mealsComments}
            canDelete={false}
            canEdit
            emptyMessage={describeEmptyRange(preset, start, end)}
          />

          {isSingleDay && <DayNotesCard clientId={clientId} date={start} comments={mealsComments} />}
        </TabsContent>

        <TabsContent value="insights" className="space-y-5 pt-1">
          <SectionCard title="Accountability Score">
            <AccountabilityScoreCard
              dailyScore={daily.score}
              dailyBreakdown={daily.breakdown}
              weeklyScore={weekly.weeklyScore}
            />
          </SectionCard>

          <SectionCard title="Trends">
            <TrendRangeToggle history7={history7} history30={history30} streak={streak} />
          </SectionCard>

          <div className="rounded-xl p-4 ring-1 ring-border">
            <WeeklyReviewCard
              clientId={clientId}
              referenceDate={today}
              title={`${clientName}'s Weekly Nutrition Summary`}
            />
          </div>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
